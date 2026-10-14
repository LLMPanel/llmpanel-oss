import type { Context } from "hono";
import { resolveDflashDrafter } from "@llmpanel/shared"
import { db } from "@llmpanel/db";
import { deployments, providerConnections, imageGenerations } from "@llmpanel/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { provisionDeployment } from "../services/deployment.service";
import { decrypt, aadFor } from "../services/encryption.service"
import { fireDeploymentAlert } from "../services/alert.service"
import { createProvider } from "@llmpanel/providers"
import type { ProviderType } from "../services/deployment-provider.service"
import { IMAGE_MODELS, findImageModelBySlug, findImageModelByHfId } from "../services/image-models.catalog"
import { buildDeploymentDomain, deploymentDomainUrl } from "../services/domain.service"
import { env } from "../env"
import { generateImages, type ImageGenBody } from "../services/image-gen.service"
import { getWorkspaceId } from "../lib/workspace-context"
import { checkDeploymentAllowed, reportDeploymentUsage } from "../services/billing.service"
import {
  findRegistryModelByHuggingfaceId,
  findRegistryModelBySlug,
  getRegistryCatalog,
  type RegistryModel,
} from "../services/model-registry.service"

async function fetchRegistryModel(slug: string): Promise<RegistryModel | null> {
  // Local image-generation models take priority — they aren't in the external registry.
  const local = findImageModelBySlug(slug)
  if (local) return local
  return findRegistryModelBySlug(slug)
}

async function fetchRegistryModelByHfId(huggingfaceId: string): Promise<RegistryModel | null> {
  const local = findImageModelByHfId(huggingfaceId)
  if (local) return local
  return findRegistryModelByHuggingfaceId(huggingfaceId)
}

async function fetchAllRegistryModels(): Promise<Map<string, RegistryModel>> {
  const map = new Map<string, RegistryModel>()
  // Seed with local image models so they resolve in list views too.
  for (const m of IMAGE_MODELS) map.set(m.huggingfaceId, m)

  const catalog = await getRegistryCatalog().catch(() => null)
  for (const m of catalog?.models ?? []) {
    map.set(m.huggingfaceId, m)
  }
  return map
}

function registryModelToFrontend(m: RegistryModel) {
  return { id: m.id, name: m.name, slug: m.slug, family: m.family }
}

type CreateDeploymentBody = {
  name?: string;
  description?: string;
  modelSlug: string;
  providerId: string;
  gpuType: string;
  providerOfferId?: string;
  cloudType?: "secure" | "community";
  gpuCount?: number;
  quantization: "fp16" | "int8" | "int4" | "gguf";
  inferenceEngine?: "vllm" | "sglang";
  kvCacheEnabled?: boolean;
  dflashEnabled?: boolean;
  envVars?: Record<string, string>;
};

export const createDeployment = async (c: Context) => {
  const user = c.get("user");
  const workspaceId = getWorkspaceId(c);
  const body = await c.req.json<CreateDeploymentBody>();

  // Plan gate — no-op on self-hosted installs. Checked before anything else so
  // a workspace at its limit gets a clean answer with no side effects. Plans
  // that price overage let the count go past the allowance and bill for it;
  // only plans without an overage price (free) actually block here.
  const quota = await checkDeploymentAllowed(workspaceId);
  if (!quota.allowed) {
    return c.json({ error: quota.reason, code: "plan_limit_reached" }, 402);
  }

  // Validate provider belongs to the caller's workspace
  const provider = (await db.select().from(providerConnections)).find(
    (p) => p.id === body.providerId && p.workspaceId === workspaceId,
  );
  if (!provider) return c.json({ error: "Provider not found" }, 404);
  if (provider.providerType === "vastai" && !body.providerOfferId) {
    return c.json({ error: "Vast.ai deployments require providerOfferId" }, 400)
  }
  if (body.cloudType && !["secure", "community"].includes(body.cloudType)) {
    return c.json({ error: "cloudType must be 'secure' or 'community'" }, 400)
  }

  // Look up model from the registry
  const registryModel = await fetchRegistryModel(body.modelSlug)
  if (!registryModel) return c.json({ error: "Model not found in registry" }, 404);

  // Resolve huggingfaceId — quantization-specific override or base model
  const quantInfo = registryModel.quantizations.find((q) => q.format === body.quantization)
  const huggingfaceId = quantInfo?.huggingfaceId ?? registryModel.huggingfaceId

  const gpuCount = body.gpuCount ?? 1;

  // Auto-generate a routable domain up front so it's stable for the whole
  // lifecycle (slug + short id => unique even across same-model deployments).
  const deploymentId = globalThis.crypto.randomUUID();
  const domain = buildDeploymentDomain(registryModel.slug, deploymentId);

  const [deployment] = await db
    .insert(deployments)
    .values({
      id: deploymentId,
      userId: user.id,
      workspaceId,
      name: body.name?.trim() || null,
      description: body.description?.trim() || null,
      huggingfaceId,
      domain,
      providerConnectionId: provider.id,
      providerType: provider.providerType,
      gpuType: body.gpuType,
      providerOfferId: body.providerOfferId ?? null,
      // Cloud choice only means something on RunPod; others stay null.
      cloudType: provider.providerType === "runpod" ? (body.cloudType ?? "secure") : null,
      gpuCount,
      quantization: body.quantization,
      inferenceEngine: body.inferenceEngine ?? "vllm",
      kvCacheEnabled: body.kvCacheEnabled ?? true,
      dflashEnabled: body.dflashEnabled ?? true,
      dflashDraftModel: resolveDflashDrafter(huggingfaceId)?.model ?? null,
      modelType: registryModel.modelType ?? null,
      dockerImage: registryModel.dockerImage ?? null,
      extraArgs: registryModel.extraArgs ?? null,
      status: "provisioning",
      createdAt: new Date(),
    })
    .returning();

  // Fire and forget — background provisioning
  provisionDeployment(deployment.id).catch(console.error);

  // Re-report metered overage now the count has changed. Deliberately not
  // awaited: billing must never sit in the path of a deployment, and the
  // reporter sends the current level so a dropped call self-corrects.
  void reportDeploymentUsage(workspaceId);

  // Return immediately — frontend subscribes to SSE for updates
  return c.json({ deployment: { ...deployment, model: registryModelToFrontend(registryModel) } }, 201);
};

// ── GET /api/v1/deployments ─────────────────────────────────────────
export const getDeployments = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);

  const status = c.req.query("status"); // optional filter
  const providerId = c.req.query("providerId"); // optional filter

  const [allDeployments, registryModels] = await Promise.all([
    db.query.deployments.findMany({ with: { providerConnection: true } }),
    fetchAllRegistryModels(),
  ]);

  const results = allDeployments
    .filter((d) => d.workspaceId === workspaceId)
    .filter((d) => (status ? d.status === status : true))
    .filter((d) => (providerId ? d.providerConnectionId === providerId : true))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((d) => {
      const rm = registryModels.get(d.huggingfaceId)
      return {
        ...d,
        model: rm ? registryModelToFrontend(rm) : null,
        providerConnection: d.providerConnection
          ? { ...d.providerConnection, encryptedApiKey: undefined }
          : null,
      }
    });

  // Calculate running duration for each deployment. domainUrl/gatewayUrl are
  // the public, client-facing URLs — the web app shows them instead of any
  // build-time-baked host.
  const enriched = results.map((d) => ({
    ...d,
    domainUrl: d.domain ? deploymentDomainUrl(d.domain) : null,
    gatewayUrl: env.PUBLIC_API_URL,
    runningFor: d.startedAt
      ? formatDuration(Date.now() - d.startedAt.getTime())
      : null,
  }));

  return c.json({ deployments: enriched });
};

// ── GET /api/v1/deployments/:id ─────────────────────────────────────
export const getDeployment = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");

  const base = await db.query.deployments.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.workspaceId, workspaceId)),
    with: { providerConnection: true },
  });

  if (!base) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  const registryModel = await fetchRegistryModelByHfId(base.huggingfaceId)

  const deployment = {
    ...base,
    model: registryModel ? registryModelToFrontend(registryModel) : null,
    providerConnection: base.providerConnection
      ? { ...base.providerConnection, encryptedApiKey: undefined }
      : null,
  };

  return c.json({
    deployment: {
      ...deployment,
      domainUrl: deployment.domain ? deploymentDomainUrl(deployment.domain) : null,
      gatewayUrl: env.PUBLIC_API_URL,
      runningFor: deployment.startedAt
        ? formatDuration(Date.now() - deployment.startedAt.getTime())
        : null,
    },
  });
};

// ── DELETE /api/v1/deployments/:id ──────────────────────────────────
export const stopDeployment = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");

  const deployment = (await db.select().from(deployments)).find(
    (d) => d.id === id && d.workspaceId === workspaceId,
  );

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  // A paused pod (stopped but with an externalId) still exists on the
  // provider and keeps billing for disk — it must remain terminatable.
  if (!deployment.externalId && ["stopped", "failed"].includes(deployment.status)) {
    return c.json({ error: "No pod to terminate — deployment is already stopped" }, 400);
  }

  try {
    const providerConnection = deployment.providerConnectionId
      ? (await db.select().from(providerConnections)).find(
          (p) => p.id === deployment.providerConnectionId,
        )
      : null;

    if (deployment.externalId) {
      const apiKey = providerConnection?.encryptedApiKey
        ? await decrypt(providerConnection.encryptedApiKey, aadFor.providerApiKey(providerConnection.id))
        : undefined;

      const provider = createProvider(deployment.providerType as ProviderType, apiKey);
      await provider.destroyDeployment(deployment.externalId);
    }

    // Update DB status
    await db
      .update(deployments)
      .set({
        status: "stopped",
        stoppedAt: new Date(),
        externalId: null,
        endpoint: null,
        statusMessage: "Destroyed by user",
      })
      .where(eq(deployments.id, id));

    fireDeploymentAlert(id, "deployment.stopped").catch(console.error)

    // The deployment no longer holds a slot, so the workspace's overage level
    // has dropped. The meter aggregates with MAX over the billing period, so
    // this does not reduce the current invoice — it sets the level the next
    // period starts from.
    void reportDeploymentUsage(workspaceId);

    return c.json({ success: true, message: "Deployment destroyed" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop deployment";
    return c.json({ error: message }, 500);
  }
};

// ── POST /api/v1/deployments/:id/restart ────────────────────────────
export const restartDeployment = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");

  const deployment = (await db.select().from(deployments)).find(
    (d) => d.id === id && d.workspaceId === workspaceId,
  );

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  // Running deployments are allowed through — provider.restartDeployment
  // reboots the pod in place. Only reject while a transition is in flight.
  if (
    ["provisioning", "downloading", "loading", "health_check"].includes(
      deployment.status,
    )
  ) {
    return c.json({ error: "Deployment is still starting up" }, 400);
  }

  try {
    const providerConnection = deployment.providerConnectionId
      ? (await db.select().from(providerConnections)).find(
          (p) => p.id === deployment.providerConnectionId,
        )
      : null;

    if (deployment.externalId) {
      // Try to restart existing container first (for local provider)
      const apiKey = providerConnection?.encryptedApiKey
        ? await decrypt(providerConnection.encryptedApiKey, aadFor.providerApiKey(providerConnection.id))
        : undefined;

      const provider = createProvider(deployment.providerType as ProviderType, apiKey);

      try {
        // If stopped, use start; if in other states, use restart
        if (deployment.status === "stopped") {
          await provider.startDeployment(deployment.externalId);
        } else {
          await provider.restartDeployment(deployment.externalId);
        }

        // Reset status and re-run health check flow
        await db
          .update(deployments)
          .set({
            status: "provisioning",
            statusMessage: "Restarting...",
            progress: 0,
            errorMessage: null,
            stoppedAt: null,
          })
          .where(eq(deployments.id, id));

        // Re-run provisioning from health check stage
        provisionDeployment(id).catch(console.error);
      } catch {
        // Container no longer exists — re-provision from scratch
        await db
          .update(deployments)
          .set({
            status: "provisioning",
            externalId: null,
            endpoint: null,
            statusMessage: "Re-provisioning...",
            progress: 0,
            errorMessage: null,
            stoppedAt: null,
          })
          .where(eq(deployments.id, id));

        provisionDeployment(id).catch(console.error);
      }
    } else {
      // No external ID — fresh provision
      await db
        .update(deployments)
        .set({
          status: "provisioning",
          statusMessage: "Starting fresh provision...",
          progress: 0,
          errorMessage: null,
          stoppedAt: null,
        })
        .where(eq(deployments.id, id));

      provisionDeployment(id).catch(console.error);
    }

    return c.json({ success: true, message: "Deployment restarting" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restart";
    return c.json({ error: message }, 500);
  }
};

// ── POST /api/v1/deployments/:id/stop (soft stop — pause) ───────────
export const pauseDeployment = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");

  const deployment = (await db.select().from(deployments)).find(
    (d) => d.id === id && d.workspaceId === workspaceId,
  );

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  if (deployment.status !== "running") {
    return c.json({ error: "Deployment is not running" }, 400);
  }

  try {
    const providerConnection = deployment.providerConnectionId
      ? (await db.select().from(providerConnections)).find(
          (p) => p.id === deployment.providerConnectionId,
        )
      : null;

    if (deployment.externalId) {
      const apiKey = providerConnection?.encryptedApiKey
        ? await decrypt(providerConnection.encryptedApiKey, aadFor.providerApiKey(providerConnection.id))
        : undefined;

      const provider = createProvider(deployment.providerType as ProviderType, apiKey);
      await provider.stopDeployment(deployment.externalId);
    }

    await db
      .update(deployments)
      .set({
        status: "stopped",
        stoppedAt: new Date(),
        statusMessage: "Paused by user",
        // keep externalId — so restart knows container ID
      })
      .where(eq(deployments.id, id));

    return c.json({ success: true, message: "Deployment paused" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pause";
    return c.json({ error: message }, 500);
  }
};

// ── POST /api/v1/deployments/:id/images/generations (session auth) ──
export const generateDeploymentImages = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");

  const deployment = await db.query.deployments.findFirst({
    where: (d, { eq, and }) => and(eq(d.id, id), eq(d.workspaceId, workspaceId)),
  });

  if (!deployment || deployment.status !== "running") {
    return c.json({ error: "Deployment not found or not running" }, 404);
  }

  const body = (await c.req.json()) as ImageGenBody;

  const result = await generateImages({
    deployment: {
      id: deployment.id,
      userId: deployment.userId,
      workspaceId: deployment.workspaceId,
      endpoint: deployment.endpoint,
      huggingfaceId: deployment.huggingfaceId,
    },
    body,
    apiKeyId: null,
  });

  return c.json(result.json as never, result.status as never);
};

// ── GET /api/v1/deployments/:id/images (recent generations) ─────────
export const getDeploymentImages = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);

  const rows = await db
    .select()
    .from(imageGenerations)
    .where(
      and(
        eq(imageGenerations.deploymentId, id),
        eq(imageGenerations.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(imageGenerations.createdAt))
    .limit(limit);

  return c.json({ images: rows });
};

// ── GET /api/v1/deployments/:id/images/stats (usage dashboard) ──────
// Aggregates image_generations in JS: per-deployment volumes are modest and
// this sidesteps SQLite epoch-seconds timestamp binding in GROUP BY entirely.
export const getDeploymentImageStats = async (c: Context) => {
  const workspaceId = getWorkspaceId(c);
  const id = c.req.param("id");
  const period = c.req.query("period") ?? "7d";

  const periodMs: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  const windowMs = periodMs[period] ?? periodMs["7d"];
  const bucketMs = period === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);

  const rows = await db
    .select({
      createdAt: imageGenerations.createdAt,
      latencyMs: imageGenerations.latencyMs,
      apiKeyId: imageGenerations.apiKeyId,
    })
    .from(imageGenerations)
    .where(
      and(
        eq(imageGenerations.deploymentId, id),
        eq(imageGenerations.workspaceId, workspaceId),
        gte(imageGenerations.createdAt, since),
      ),
    );

  const buckets = new Map<number, { images: number; latencySum: number; latencyCount: number }>();
  let latencySum = 0;
  let latencyCount = 0;
  let viaApiKey = 0;

  for (const row of rows) {
    const bucketStart = Math.floor(row.createdAt.getTime() / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart) ?? { images: 0, latencySum: 0, latencyCount: 0 };
    bucket.images += 1;
    if (row.latencyMs != null) {
      bucket.latencySum += row.latencyMs;
      bucket.latencyCount += 1;
      latencySum += row.latencyMs;
      latencyCount += 1;
    }
    buckets.set(bucketStart, bucket);
    if (row.apiKeyId) viaApiKey += 1;
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketStart, b]) => ({
      bucket: new Date(bucketStart).toISOString(),
      images: b.images,
      avgLatencyMs: b.latencyCount > 0 ? Math.round(b.latencySum / b.latencyCount) : 0,
    }));

  return c.json({
    stats: {
      period,
      bucket: period === "24h" ? "hour" : "day",
      totalImages: rows.length,
      viaApiKey,
      viaPlayground: rows.length - viaApiKey,
      averageLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
      series,
    },
  });
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

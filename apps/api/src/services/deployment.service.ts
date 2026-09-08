import { randomBytes } from "node:crypto"
import { resolveDflashDrafter } from "@llmpanel/shared"
import { db } from "@llmpanel/db"
import { deployments } from "@llmpanel/db/schema"
import { createProvider, DeployModelInputSchema } from "@llmpanel/providers"
import type { ProviderType } from "./deployment-provider.service"
import { decrypt, aadFor } from "./encryption.service"
import { fireDeploymentAlert } from "./alert.service"
import { eq } from "drizzle-orm"
import { env } from "../env"

// Deployments currently being provisioned in this process. The status
// reconciler skips these — an in-flight provisionDeployment owns the row.
export const activeProvisioning = new Set<string>()

// Health-check timeout leaves the instance alive: big models often outlive
// the probe budget, and the status reconciler will flip the row to "running"
// once /health finally answers. Destroying the pod here would make that
// recovery impossible.
class HealthCheckTimeoutError extends Error {
  constructor() {
    super("Health check timed out — instance left running, will recover automatically once the model is ready")
  }
}

export async function provisionDeployment(deploymentId: string): Promise<void> {
  activeProvisioning.add(deploymentId)
  try {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
      with: { providerConnection: true },
    })
    if (!deployment) throw new Error("Deployment not found")

    // Progress is one continuous bar across the whole pipeline — it never
    // reads 100% until the model is actually live:
    //   provisioning 5 → downloading 15–70 → loading 75 → health check 85–99.

    // STAGE 1: PROVISIONING
    await updateStatus(deploymentId, "provisioning", "Setting up infrastructure...", 5)
    fireDeploymentAlert(deploymentId, "deployment.started").catch(console.error)

    // In mock mode (macOS dev) skip real Docker/cloud
    const providerType = env.MOCK_DEPLOYMENT
      ? "mock"
      : (deployment.providerType as ProviderType)

    const apiKey =
      !env.MOCK_DEPLOYMENT && deployment.providerConnection?.encryptedApiKey
        ? await decrypt(deployment.providerConnection.encryptedApiKey, aadFor.providerApiKey(deployment.providerConnection.id))
        : undefined

    const totpSecret =
      !env.MOCK_DEPLOYMENT && deployment.providerConnection?.encryptedTotpSecret
        ? await decrypt(deployment.providerConnection.encryptedTotpSecret, aadFor.providerTotpSecret(deployment.providerConnection.id))
        : undefined

    const provider = createProvider(providerType, apiKey, totpSecret)

    // Per-deployment secret for the in-pod metrics agent. Persisted before
    // deployModel so the DB always matches what the pod received; reused on
    // redeploy so existing readers stay valid.
    const metricsToken = deployment.metricsToken ?? randomBytes(24).toString("hex")
    if (!deployment.metricsToken) {
      await db.update(deployments)
        .set({ metricsToken })
        .where(eq(deployments.id, deploymentId))
    }

    // Parse through the schema so Zod defaults (maxModelLen 4096, gpuCount 1,
    // kvCacheEnabled true) are applied — providers interpolate these into
    // engine command lines, and an unparsed undefined becomes the literal
    // string "undefined" in e.g. --max-model-len.
    const providerResult = await provider.deployModel(DeployModelInputSchema.parse({
      deploymentId: deployment.id,
      huggingfaceId: deployment.huggingfaceId,
      gpuType: deployment.gpuType,
      providerOfferId: deployment.providerOfferId ?? undefined,
      cloudType: deployment.cloudType as "secure" | "community" | null,
      gpuCount: deployment.gpuCount ?? 1,
      quantization: deployment.quantization as "fp16" | "int8" | "int4" | "gguf",
      inferenceEngine: deployment.inferenceEngine as "vllm" | "sglang",
      kvCacheEnabled: deployment.kvCacheEnabled ?? true,
      dflashEnabled: deployment.dflashEnabled ?? true,
      dflashDraftModel: deployment.dflashDraftModel ?? undefined,
      dflashNumTokens: resolveDflashDrafter(deployment.huggingfaceId)?.numSpeculativeTokens ?? undefined,
      modelType: deployment.modelType ?? undefined,
      dockerImage: deployment.dockerImage ?? undefined,
      extraArgs: deployment.extraArgs ?? undefined,
      envVars: { LLMPANEL_METRICS_TOKEN: metricsToken },
    }))

    await db.update(deployments)
      .set({ externalId: providerResult.externalId })
      .where(eq(deployments.id, deploymentId))

    // STAGE 2: DOWNLOADING + WAIT FOR ENDPOINT
    await updateStatus(deploymentId, "downloading", "Preparing the instance...", 15)

    let endpoint = providerResult.endpoint

    if (!env.MOCK_DEPLOYMENT) {
      // Host lifecycle events (image pull, container create/start) — the same
      // play-by-play the provider's own console shows. Best-effort: aborted as
      // soon as the endpoint resolves, and any stream error is swallowed.
      const systemEventsAbort = new AbortController()
      const systemEventClock: SystemEventClock = { lastEventAt: 0 }
      const systemEventsTask = provider.streamSystemEvents
        ? trackSystemEvents(
            provider.streamSystemEvents(providerResult.externalId, systemEventsAbort.signal),
            deploymentId,
            systemEventClock,
          ).catch(() => {})
        : Promise.resolve()

      try {
        // Run download tracking and endpoint polling concurrently
        // trackDownloadProgress is non-critical for cloud providers (best-effort logs)
        // waitForEndpoint is the critical path — resolves once IP is assigned
        const [resolvedEndpoint] = await Promise.all([
          endpoint
            ? Promise.resolve(endpoint)
            : waitForEndpoint(provider, providerResult.externalId, deploymentId, {
                maxAttempts: 120,
                intervalMs: 5000,
              }, systemEventClock),
          trackDownloadProgress(
            provider,
            providerResult.externalId,
            async (progress: number) => {
              // Scale the 0–100 download into the 15–70 band of the pipeline.
              await updateStatus(
                deploymentId,
                "downloading",
                `Downloading model weights... ${progress}%`,
                15 + Math.round(progress * 0.55),
              )
            }
          ).catch(() => {
            // Log streaming may fail for cloud providers — that's OK
            // The endpoint polling is the critical path
          }),
        ])
        endpoint = resolvedEndpoint
      } finally {
        systemEventsAbort.abort()
        await systemEventsTask
      }
    }

    // STAGE 3: LOADING INTO VRAM
    await updateStatus(deploymentId, "loading", "Loading model into GPU memory...", 75)
    if (!env.MOCK_DEPLOYMENT) {
      await new Promise(r => setTimeout(r, 15000))
    }

    // STAGE 4: HEALTH CHECK
    await updateStatus(deploymentId, "health_check", "Running health check...", 85)
    if (!env.MOCK_DEPLOYMENT && endpoint) {
      await waitForHealthCheck(endpoint, deploymentId, { maxAttempts: 60, intervalMs: 5000 })
    }

    // STAGE 5: RUNNING
    await db.update(deployments).set({
      status: "running",
      endpoint,
      costPerHour: providerResult.costPerHour,
      startedAt: new Date(),
      statusMessage: "Model is live!",
      progress: 100,
    }).where(eq(deployments.id, deploymentId))
    fireDeploymentAlert(deploymentId, "deployment.running", {
      message: "Model is live and accepting requests.",
    }).catch(console.error)

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    await db.update(deployments).set({
      status: "failed",
      errorMessage: message,
      stoppedAt: new Date(),
    }).where(eq(deployments.id, deploymentId))
    fireDeploymentAlert(deploymentId, "deployment.failed", {
      errorMessage: message,
    }).catch(console.error)

    // Keep the instance alive on a health-check timeout so the status
    // reconciler can adopt it when the model finishes loading.
    if (!(error instanceof HealthCheckTimeoutError)) {
      await cleanupFailedDeployment(deploymentId)
    }
  } finally {
    activeProvisioning.delete(deploymentId)
  }
}

async function updateStatus(
  deploymentId: string,
  status: string,
  message: string,
  progress?: number
): Promise<void> {
  await db.update(deployments).set({
    status,
    statusMessage: message,
    ...(progress !== undefined && { progress }),
  }).where(eq(deployments.id, deploymentId))
}

async function waitForEndpoint(
  provider: ReturnType<typeof createProvider>,
  externalId: string,
  deploymentId: string,
  options: { maxAttempts: number; intervalMs: number },
  systemEventClock?: SystemEventClock
): Promise<string> {
  for (let i = 0; i < options.maxAttempts; i++) {
    const info = await provider.getDeploymentInfo(externalId)

    // If instance failed or stopped on provider side, abort
    if (info.status === "failed" || info.status === "stopped") {
      throw new Error(`Provider instance ${externalId} entered status: ${info.status}`)
    }

    // Update DB with provider-reported status for SSE visibility. Prefer the
    // provider's own lifecycle detail (RunPod lastStatusChange, Vast
    // status_msg) — the same message its console shows. A provider-side
    // "running" only means the container is up, not the model — cap the
    // pipeline stage at "downloading" so the stepper doesn't jump to Live.
    // When the system-event stream wrote recently, its message is fresher
    // than this poll — don't overwrite it.
    const systemEventIsFresh =
      systemEventClock != null && Date.now() - systemEventClock.lastEventAt < 15_000
    if (!systemEventIsFresh) {
      // RunPod's lastStatusChange is often just "Rented by User: <date>" —
      // billing noise, not progress. Fall through to the generic text.
      const usefulDetail =
        info.statusDetail && !/rented by user/i.test(info.statusDetail)
          ? info.statusDetail
          : null
      const statusMessage =
        usefulDetail ??
        (info.status === "downloading"
          ? "Downloading model weights on provider..."
          : "Waiting for instance to be ready...")
      const stage = info.status === "running" ? "downloading" : info.status
      await updateStatus(deploymentId, stage, statusMessage)
    }

    if (info.endpoint) {
      return info.endpoint
    }

    await new Promise(r => setTimeout(r, options.intervalMs))
  }
  throw new Error("Timed out waiting for provider endpoint to become available")
}

async function waitForHealthCheck(
  endpoint: string,
  deploymentId: string,
  options: { maxAttempts: number; intervalMs: number }
): Promise<void> {
  for (let i = 0; i < options.maxAttempts; i++) {
    try {
      const res = await fetch(`${endpoint}/health`)
      if (res.ok) return
    } catch { /* not ready yet */ }
    // Show movement during the longest silent phase: attempt count plus a
    // progress creep through the health-check band (85–99).
    await updateStatus(
      deploymentId,
      "health_check",
      `Health check: waiting for the model server (${i + 1}/${options.maxAttempts})`,
      85 + Math.min(14, Math.floor(((i + 1) / options.maxAttempts) * 14)),
    )
    await new Promise(r => setTimeout(r, options.intervalMs))
  }
  throw new HealthCheckTimeoutError()
}

// Docker-style host events are noisy (layer ids, digests, dozens of
// "Extracting" lines) — collapse them into a handful of human phases.
// Unrecognized lines are dropped rather than shown raw.
function friendlySystemEvent(line: string): string | null {
  const l = line.toLowerCase()
  if (l.includes("create container")) return "Creating container..."
  if (l.includes("start container") || l.includes("container started")) {
    return "Container started — booting the model server..."
  }
  if (l.includes("pull complete") || l.includes("downloaded newer image") || l.includes("image is up to date")) {
    return "Container image ready, starting..."
  }
  if (l.includes("extracting")) return "Extracting container image..."
  if (l.includes("downloading") || l.includes("pulling f") || l.includes("pulling from")) {
    return "Downloading container image..."
  }
  return null
}

/** Written by trackSystemEvents; read by waitForEndpoint so the two stage-2
 *  message writers don't fight — fresh system events win. */
interface SystemEventClock {
  lastEventAt: number
}

async function trackSystemEvents(
  events: AsyncGenerator<string>,
  deploymentId: string,
  clock: SystemEventClock,
): Promise<void> {
  let lastMessage = ""
  for await (const line of events) {
    const message = friendlySystemEvent(line)
    if (!message || message === lastMessage) continue
    lastMessage = message
    clock.lastEventAt = Date.now()
    await updateStatus(deploymentId, "downloading", message)
  }
}

async function trackDownloadProgress(
  provider: ReturnType<typeof createProvider>,
  externalId: string,
  onProgress: (progress: number) => Promise<void>
): Promise<void> {
  const timeoutMs = 8 * 60 * 1000 // 8 minutes max
  const startTime = Date.now()

  for await (const log of provider.streamLogs(externalId)) {
    if (Date.now() - startTime > timeoutMs) return

    const match = log.match(/(\d+)%/)
    if (match) await onProgress(parseInt(match[1]))
    // vLLM prints this when fully loaded and ready
    if (log.includes("Application startup complete") || log.includes("Uvicorn running")) {
      return
    }
  }
}

async function cleanupFailedDeployment(deploymentId: string): Promise<void> {
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
    with: { providerConnection: true },
  })
  if (!deployment?.externalId) return
  try {
    const providerType = env.MOCK_DEPLOYMENT
      ? "mock"
      : (deployment.providerType as ProviderType)
    const apiKey =
      !env.MOCK_DEPLOYMENT && deployment.providerConnection?.encryptedApiKey
        ? await decrypt(deployment.providerConnection.encryptedApiKey, aadFor.providerApiKey(deployment.providerConnection.id))
        : undefined
    const totpSecret =
      !env.MOCK_DEPLOYMENT && deployment.providerConnection?.encryptedTotpSecret
        ? await decrypt(deployment.providerConnection.encryptedTotpSecret, aadFor.providerTotpSecret(deployment.providerConnection.id))
        : undefined
    const provider = createProvider(providerType, apiKey, totpSecret)
    await provider.destroyDeployment(deployment.externalId)
  } catch { /* best effort */ }
}

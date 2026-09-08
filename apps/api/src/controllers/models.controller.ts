// apps/api/src/controllers/models.controller.ts
import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { models, deployments } from "@llmpanel/db/schema"
import { eq, and, like, sql } from "drizzle-orm"
import { getWorkspaceId } from "../lib/workspace-context"

// ── GET /api/v1/models ───────────────────────────────────────────────
export const getModels = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)

  // Optional query filters
  const family = c.req.query("family")
  const tag = c.req.query("tag")
  const minVram = c.req.query("minVram")

  const conditions = [eq(models.isActive, true)]
  if (family) conditions.push(eq(models.family, family))
  if (minVram) conditions.push(sql`${models.minVram} <= ${Number(minVram)}`)

  const allModels = await db.query.models.findMany({
    where: and(...conditions),
    orderBy: [models.family, models.name],
  })

  // Filter by tag (stored as JSON string in DB)
  const filtered = tag
    ? allModels.filter((m) => {
        const tags: string[] = JSON.parse(m.tags)
        return tags.includes(tag)
      })
    : allModels

  // Check which models the workspace already has deployed (running)
  const userDeployments = await db.query.deployments.findMany({
    where: and(
      eq(deployments.workspaceId, workspaceId),
      eq(deployments.status, "running")
    ),
    columns: { huggingfaceId: true },
  })

  const deployedHfIds = new Set(userDeployments.map((d) => d.huggingfaceId))

  const enriched = filtered.map((m) => ({
    ...m,
    tags: JSON.parse(m.tags) as string[],
    supportedQuantizations: JSON.parse(m.supportedQuantizations) as string[],
    isDeployed: deployedHfIds.has(m.huggingfaceId),
  }))

  return c.json({ models: enriched })
}

// ── GET /api/v1/models/:id ───────────────────────────────────────────
export const getModel = async (c: Context) => {
  const id = c.req.param("id")

  const model = await db.query.models.findFirst({
    where: and(eq(models.id, id), eq(models.isActive, true)),
  })

  if (!model) {
    return c.json({ error: "Model not found" }, 404)
  }

  return c.json({
    model: {
      ...model,
      tags: JSON.parse(model.tags) as string[],
      supportedQuantizations: JSON.parse(model.supportedQuantizations) as string[],
    },
  })
}

// ── GET /api/v1/models/:id/compatibility ────────────────────────────
export const checkCompatibility = async (c: Context) => {
  const id = c.req.param("id")
  const gpuType = c.req.query("gpuType")
  const quantization = c.req.query("quantization") ?? "fp16"

  if (!gpuType) {
    return c.json({ error: "gpuType query param is required" }, 400)
  }

  const model = await db.query.models.findFirst({
    where: eq(models.id, id),
  })

  if (!model) {
    return c.json({ error: "Model not found" }, 404)
  }

  const estimatedVramGb = calculateVramUsage(model.minVram, quantization)

  // GPU VRAM lookup table (can be extended)
  const gpuVramMap: Record<string, number> = {
    "H100 SXM": 80,
    "H100 PCIe": 80,
    "A100 SXM": 80,
    "A100 PCIe": 40,
    "A40": 48,
    "RTX 4090": 24,
    "RTX 3090": 24,
    "RTX 4080": 16,
    "RTX 3080": 10,
    "L40S": 48,
    "L4": 24,
  }

  const availableVramGb = gpuVramMap[gpuType] ?? 0

  const compatible = estimatedVramGb <= availableVramGb

  let warning: string | null = null
  if (compatible && estimatedVramGb > availableVramGb * 0.9) {
    warning = "This model will use over 90% of available VRAM. Consider a smaller quantization."
  }

  return c.json({
    compatible,
    estimatedVramGb,
    availableVramGb,
    warning,
    recommendation: compatible
      ? null
      : `Try int8 or int4 quantization to reduce VRAM usage to ~${calculateVramUsage(model.minVram, "int4").toFixed(1)}GB`,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────
function calculateVramUsage(baseVram: number, quantization: string): number {
  const multipliers: Record<string, number> = {
    fp16: 2.0,
    int8: 1.0,
    int4: 0.5,
    gguf: 0.6,
  }
  return baseVram * (multipliers[quantization] ?? 1.0)
}
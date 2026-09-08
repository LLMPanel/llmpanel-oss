# 06 — Deployment Flow

## Key Design: Return Fast, Provision Async

API returns in milliseconds. Heavy work happens in background. SSE pushes every stage update to frontend.

## Stage Progression

```
provisioning → downloading → loading → health_check → running
                                                     ↘ failed
```

## apps/api/src/services/deployment.service.ts

```typescript
import { db } from "../lib/db"
import { deployments } from "@llmpanel/db/schema"
import { createProvider } from "@llmpanel/providers"
import { decrypt } from "./encryption.service"
import { eq } from "drizzle-orm"

export async function provisionDeployment(deploymentId: string): Promise<void> {
  try {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
      with: { model: true, providerConnection: true },
    })
    if (!deployment) throw new Error("Deployment not found")

    // STAGE 1: PROVISIONING
    await updateStatus(deploymentId, "provisioning", "Setting up infrastructure...")

    const apiKey = deployment.providerConnection?.encryptedApiKey
      ? await decrypt(deployment.providerConnection.encryptedApiKey)
      : undefined

    const provider = createProvider(deployment.providerType as any, apiKey)

    const providerResult = await provider.deployModel({
      deploymentId: deployment.id,
      modelId: deployment.modelId,
      huggingfaceId: deployment.model.huggingfaceId,
      gpuType: deployment.gpuType,
      quantization: deployment.quantization as any,
      inferenceEngine: deployment.inferenceEngine as any,
    })

    await db.update(deployments)
      .set({ externalId: providerResult.externalId })
      .where(eq(deployments.id, deploymentId))

    // STAGE 2: DOWNLOADING
    await updateStatus(deploymentId, "downloading", "Downloading model weights from HuggingFace...", 0)

    await trackDownloadProgress(
      provider,
      providerResult.externalId,
      async (progress: number) => {
        await updateStatus(deploymentId, "downloading", `Downloading model weights... ${progress}%`, progress)
      }
    )

    // STAGE 3: LOADING INTO VRAM
    await updateStatus(deploymentId, "loading", "Loading model into GPU memory...", 100)
    await new Promise(r => setTimeout(r, 30000)) // wait for VRAM load

    // STAGE 4: HEALTH CHECK
    await updateStatus(deploymentId, "health_check", "Running health check...")
    await waitForHealthCheck(providerResult.endpoint!, { maxAttempts: 30, intervalMs: 2000 })

    // STAGE 5: RUNNING
    await db.update(deployments).set({
      status: "running",
      endpoint: providerResult.endpoint,
      costPerHour: providerResult.costPerHour,
      startedAt: new Date(),
      statusMessage: "Model is live!",
      progress: 100,
    }).where(eq(deployments.id, deploymentId))

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    await db.update(deployments).set({
      status: "failed",
      errorMessage: message,
      stoppedAt: new Date(),
    }).where(eq(deployments.id, deploymentId))

    await cleanupFailedDeployment(deploymentId)
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

async function waitForHealthCheck(
  endpoint: string,
  options: { maxAttempts: number; intervalMs: number }
): Promise<void> {
  for (let i = 0; i < options.maxAttempts; i++) {
    try {
      const res = await fetch(`${endpoint}/health`)
      if (res.ok) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, options.intervalMs))
  }
  throw new Error("Health check failed — model did not start in time")
}

async function trackDownloadProgress(
  provider: any,
  externalId: string,
  onProgress: (progress: number) => Promise<void>
): Promise<void> {
  for await (const log of provider.streamLogs(externalId)) {
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
  })
  if (!deployment?.externalId) return
  try {
    const provider = createProvider(deployment.providerType as any)
    await provider.stopDeployment(deployment.externalId)
  } catch { /* best effort */ }
}
```

## apps/api/src/controllers/deployments.controller.ts

```typescript
import type { Context } from "hono"
import { db } from "../lib/db"
import { deployments, models, providerConnections } from "@llmpanel/db/schema"
import { provisionDeployment } from "../services/deployment.service"
import { createProvider } from "@llmpanel/providers"
import { decrypt } from "../services/encryption.service"
import { eq, and, desc } from "drizzle-orm"
import { randomUUID } from "crypto"

export const getDeployments = async (c: Context) => {
  const user = c.get("user")
  const status = c.req.query("status")
  const providerId = c.req.query("providerId")

  const conditions = [eq(deployments.userId, user.id)]
  if (status) conditions.push(eq(deployments.status, status))
  if (providerId) conditions.push(eq(deployments.providerConnectionId, providerId))

  const results = await db.query.deployments.findMany({
    where: and(...conditions),
    with: {
      model: true,
      providerConnection: { columns: { encryptedApiKey: false } },
    },
    orderBy: [desc(deployments.createdAt)],
  })

  return c.json({
    deployments: results.map((d) => ({
      ...d,
      runningFor: d.startedAt ? formatDuration(Date.now() - d.startedAt.getTime()) : null,
    })),
  })
}

export const getDeployment = async (c: Context) => {
  const user = c.get("user")
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.userId, user.id)),
    with: { model: true, providerConnection: { columns: { encryptedApiKey: false } } },
  })

  if (!deployment) return c.json({ error: "Deployment not found" }, 404)

  return c.json({
    deployment: {
      ...deployment,
      runningFor: deployment.startedAt
        ? formatDuration(Date.now() - deployment.startedAt.getTime())
        : null,
    },
  })
}

export const createDeployment = async (c: Context) => {
  const user = c.get("user")
  const body = c.req.valid("json")

  const model = await db.query.models.findFirst({ where: eq(models.id, body.modelId) })
  if (!model) return c.json({ error: "Model not found" }, 404)

  const provider = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.id, body.providerId),
      eq(providerConnections.userId, user.id)
    ),
  })
  if (!provider) return c.json({ error: "Provider not found" }, 404)

  const [deployment] = await db.insert(deployments).values({
    id: randomUUID(),
    userId: user.id,
    modelId: model.id,
    providerConnectionId: provider.id,
    providerType: provider.providerType,
    gpuType: body.gpuType,
    quantization: body.quantization,
    inferenceEngine: body.inferenceEngine ?? "vllm",
    status: "provisioning",
    createdAt: new Date(),
  }).returning()

  // Fire and forget — frontend subscribes to SSE for updates
  provisionDeployment(deployment.id).catch(console.error)

  return c.json({ deployment }, 201)
}

export const stopDeployment = async (c: Context) => {
  const user = c.get("user")
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.userId, user.id)),
    with: { providerConnection: true },
  })

  if (!deployment) return c.json({ error: "Deployment not found" }, 404)
  if (["stopped", "failed"].includes(deployment.status)) {
    return c.json({ error: "Deployment is already stopped" }, 400)
  }

  try {
    if (deployment.externalId) {
      const apiKey = deployment.providerConnection?.encryptedApiKey
        ? await decrypt(deployment.providerConnection.encryptedApiKey)
        : undefined
      const provider = createProvider(deployment.providerType as any, apiKey)
      await provider.stopDeployment(deployment.externalId)
    }

    await db.update(deployments)
      .set({ status: "stopped", stoppedAt: new Date(), statusMessage: "Stopped by user" })
      .where(eq(deployments.id, id))

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to stop" }, 500)
  }
}

export const pauseDeployment = async (c: Context) => {
  const user = c.get("user")
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.userId, user.id)),
    with: { providerConnection: true },
  })

  if (!deployment) return c.json({ error: "Deployment not found" }, 404)
  if (deployment.status !== "running") return c.json({ error: "Deployment is not running" }, 400)

  try {
    if (deployment.externalId) {
      const apiKey = deployment.providerConnection?.encryptedApiKey
        ? await decrypt(deployment.providerConnection.encryptedApiKey)
        : undefined
      const provider = createProvider(deployment.providerType as any, apiKey)
      await provider.stopDeployment(deployment.externalId)
    }

    await db.update(deployments)
      .set({ status: "stopped", stoppedAt: new Date(), statusMessage: "Paused by user" })
      .where(eq(deployments.id, id))

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to pause" }, 500)
  }
}

export const restartDeployment = async (c: Context) => {
  const user = c.get("user")
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.userId, user.id)),
    with: { providerConnection: true },
  })

  if (!deployment) return c.json({ error: "Deployment not found" }, 404)
  if (deployment.status === "running") return c.json({ error: "Already running" }, 400)

  await db.update(deployments).set({
    status: "provisioning",
    statusMessage: "Restarting...",
    progress: 0,
    errorMessage: null,
    stoppedAt: null,
    ...(deployment.externalId ? {} : { externalId: null, endpoint: null }),
  }).where(eq(deployments.id, id))

  provisionDeployment(id).catch(console.error)

  return c.json({ success: true, message: "Deployment restarting" })
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}
```

## What Can Go Wrong (handle these errors clearly)

| Stage | Error | User-facing message |
|-------|-------|-------------------|
| provisioning | GPU not available on RunPod | "No GPUs of this type available right now" |
| provisioning | Insufficient RunPod balance | "Insufficient account balance" |
| downloading | HuggingFace token missing | "Add HuggingFace token in Settings for gated models" |
| downloading | Model not found on HF | "Model ID not found on HuggingFace" |
| loading | OOM (VRAM) | "Out of GPU memory — try a smaller quantization" |
| health_check | vLLM crashed | "Model failed to start — check logs for details" |

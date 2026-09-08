import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { deployments } from "@llmpanel/db/schema"
import { resolveProvider } from "../services/deployment-provider.service"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { getWorkspaceId } from "../lib/workspace-context"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  createDeployment,
  getDeployments,
  getDeployment,
  stopDeployment,
  restartDeployment,
  pauseDeployment,
  generateDeploymentImages,
  getDeploymentImages,
  getDeploymentImageStats,
} from "../controllers/deployments.controller"
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from "../controllers/alerts.controller"
import { channelsRoute } from "./channels.route"
import { agentsRoute } from "./agents.route"
import { ragRoute } from "./rag.route"

const DeployInputSchema = z.object({
  name: z.string().trim().max(60).optional(),
  description: z.string().trim().max(280).optional(),
  modelSlug: z.string(),
  providerId: z.string(),
  gpuType: z.string(),
  providerOfferId: z.string().optional(),
  gpuCount: z.number().int().min(1).optional(),
  quantization: z.enum(["fp16", "int8", "int4", "gguf"]),
  inferenceEngine: z.enum(["vllm", "sglang"]).default("vllm"),
  kvCacheEnabled: z.boolean().optional(),
  dflashEnabled: z.boolean().optional(),
  envVars: z.record(z.string(), z.string()).optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────

// Log/status streams are workspace-scoped like every other read — an id alone
// must never expose another workspace's deployment.
async function getWorkspaceDeployment(id: string, workspaceId: string) {
  const dep = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
  })
  if (!dep) throw new Error(`Deployment ${id} not found`)
  return dep
}

async function getProviderForDeployment(dep: Awaited<ReturnType<typeof getWorkspaceDeployment>>) {
  return resolveProvider(dep)
}

export const deploymentsRoute = new Hono()
  .use(sessionAuth)

  .get("/", getDeployments)

  .post("/", requireRole("member"), zValidator("json", DeployInputSchema), createDeployment)

  .get("/:id", getDeployment)

  .delete("/:id", requireRole("member"), stopDeployment)

  .post("/:id/stop", requireRole("member"), pauseDeployment)

  .post("/:id/restart", requireRole("member"), restartDeployment)

  // Image generation (text-to-image deployments)
  .post("/:id/images/generations", requireRole("member"), generateDeploymentImages)
  .get("/:id/images/stats", getDeploymentImageStats)
  .get("/:id/images", getDeploymentImages)

  // Channels sub-router
  .route("/:id/channels", channelsRoute)
  .route("/:id/agents", agentsRoute)
  .route("/:id/rag", ragRoute)

  // Alert rules for a specific deployment
  .get("/:id/alerts", getAlertRules)
  .post("/:id/alerts", requireRole("member"), createAlertRule)
  .patch("/:id/alerts/:ruleId", requireRole("member"), updateAlertRule)
  .delete("/:id/alerts/:ruleId", requireRole("member"), deleteAlertRule)

  // SSE: live status updates
  .get("/:id/status", async (c) => {
    const deploymentId = c.req.param("id")
    const workspaceId = getWorkspaceId(c)

    return streamSSE(c, async (stream) => {
      const sendUpdate = async () => {
        const dep = await getWorkspaceDeployment(deploymentId, workspaceId)
        await stream.writeSSE({
          data: JSON.stringify({
            status: dep.status,
            progress: dep.progress,
            message: dep.statusMessage,
            endpoint: dep.endpoint,
          }),
        })

        if (["running", "failed", "stopped"].includes(dep.status)) {
          await stream.close()
          return true  // done
        }
        return false
      }

      const done = await sendUpdate()
      if (done) return

      const interval = setInterval(async () => {
        const done = await sendUpdate()
        if (done) clearInterval(interval)
      }, 1500)

      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(interval)
      })
    })
  })

  // REST: fetch container logs on-demand (one-shot)
  .get("/:id/container-logs", async (c) => {
    const deploymentId = c.req.param("id")
    const workspaceId = getWorkspaceId(c)
    const tail = Number(c.req.query("tail") ?? "500")

    try {
      const dep = await getWorkspaceDeployment(deploymentId, workspaceId)
      if (!dep.externalId) {
        return c.json({ lines: [], message: "No container running" })
      }

      const provider = await getProviderForDeployment(dep)
      const lines = await provider.fetchLogs(dep.externalId, tail, {
        metricsToken: dep.metricsToken,
      })

      return c.json({
        lines,
        externalId: dep.externalId,
        providerType: dep.providerType,
        status: dep.status,
      })
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to fetch logs" },
        502
      )
    }
  })

  // SSE: container logs
  .get("/:id/logs", async (c) => {
    const deploymentId = c.req.param("id")
    const workspaceId = getWorkspaceId(c)

    return streamSSE(c, async (stream) => {
      const dep = await getWorkspaceDeployment(deploymentId, workspaceId)
      if (!dep.externalId) {
        await stream.writeSSE({ data: "No container running" })
        return
      }

      const provider = await getProviderForDeployment(dep)

      // RunPod streams by polling the in-pod agent, so the generator only
      // ends on repeated failures — stop consuming when the client leaves.
      const iter = provider.streamLogs(dep.externalId, {
        metricsToken: dep.metricsToken,
      })
      try {
        for await (const log of iter) {
          if (c.req.raw.signal.aborted) break
          await stream.writeSSE({ data: log })
        }
      } finally {
        await iter.return?.(undefined)
      }
    })
  })

import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { GATEWAY_SCOPES } from "../middlewares/api-key-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import { auth } from "../lib/auth"
import { db } from "@llmpanel/db"
import { apiKeys, deployments, requestLogs } from "@llmpanel/db/schema"
import { and, or, eq, isNull, gte, count, sum, avg, desc } from "drizzle-orm"
import { createHash, randomBytes } from "crypto"
import { getWorkspaceId } from "../lib/workspace-context"

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  deploymentId: z.string().nullish(),
  // Only scopes the gateway enforces — an unrecognised one would mint a key
  // that 403s on every endpoint it was meant to unlock.
  scopes: z.array(z.enum(GATEWAY_SCOPES)).min(1).default(["chat"]),
  // The create dialog sends null for "unlimited"/"never" — accept both null and undefined.
  rpmLimit: z.number().nullish(),
  tpmLimit: z.number().nullish(),
  dailyLimit: z.number().nullish(),
  expiresAt: z.string().datetime().nullish(),
})

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rpmLimit: z.number().nullish(),
  tpmLimit: z.number().nullish(),
  dailyLimit: z.number().nullish(),
  isActive: z.boolean().optional(),
})

export const apiKeysRoute = new Hono()
  .use(sessionAuth)

  .get("/", async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    if (!session) return c.json({ error: "Unauthorized" }, 401)

    const workspaceId = getWorkspaceId(c)
    const deploymentId = c.req.query("deploymentId")

    // Per-deployment view includes global keys (null deploymentId) — they can
    // call this deployment's endpoint too.
    const keys = await db.query.apiKeys.findMany({
      where: deploymentId
        ? and(
            eq(apiKeys.workspaceId, workspaceId),
            or(eq(apiKeys.deploymentId, deploymentId), isNull(apiKeys.deploymentId))
          )
        : eq(apiKeys.workspaceId, workspaceId),
      with: { deployment: { columns: { id: true, name: true } } },
      orderBy: [desc(apiKeys.createdAt)],
    })

    // Never return the hash — only prefix for display
    return c.json({
      apiKeys: keys.map(({ deployment, ...k }) => ({
        ...k,
        keyHash: undefined,  // strip hash from response
        deploymentName: deployment?.name ?? (k.deploymentId ? k.deploymentId : "All deployments"),
      })),
    })
  })

  .post("/", requireRole("member"), zValidator("json", CreateApiKeySchema), async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    if (!session) return c.json({ error: "Unauthorized" }, 401)

    const user = session.user
    const workspaceId = getWorkspaceId(c)
    const body = await c.req.json<z.infer<typeof CreateApiKeySchema>>()

    // A deployment-scoped key must point at a deployment in this workspace
    if (body.deploymentId) {
      const deployment = await db.query.deployments.findFirst({
        where: and(
          eq(deployments.id, body.deploymentId),
          eq(deployments.workspaceId, workspaceId)
        ),
        columns: { id: true },
      })
      if (!deployment) return c.json({ error: "Deployment not found" }, 404)
    }

    // Generate key: gpup_sk_ + 32 random bytes as hex
    const rawKey = `gpup_sk_${randomBytes(32).toString("hex")}`
    const keyHash = createHash("sha256").update(rawKey).digest("hex")
    const prefix = rawKey.substring(0, 15) + "..."  // show first 15 chars in UI

    const [apiKey] = await db.insert(apiKeys).values({
      id: crypto.randomUUID(),
      userId: user.id,
      workspaceId,
      deploymentId: body.deploymentId ?? null,
      name: body.name,
      keyHash,
      prefix,
      scopes: JSON.stringify(body.scopes),
      rpmLimit: body.rpmLimit ?? null,
      tpmLimit: body.tpmLimit ?? null,
      dailyLimit: body.dailyLimit ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isActive: true,
      createdAt: new Date(),
    }).returning()

    // ONLY TIME the full key is returned — frontend must show it once
    return c.json({
      apiKey: { ...apiKey, key: rawKey, keyHash: undefined },
    }, 201)
  })

  // Per-key usage stats for the api-keys table (last 24h/7d/30d).
  .get("/:id/usage", async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    if (!session) return c.json({ error: "Unauthorized" }, 401)

    const workspaceId = getWorkspaceId(c)
    const id = c.req.param("id")
    const period = c.req.query("period") ?? "24h"
    const periodMs: Record<string, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    }
    const since = new Date(Date.now() - (periodMs[period] ?? periodMs["24h"]))

    const key = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
      columns: { id: true },
    })
    if (!key) return c.json({ error: "API key not found" }, 404)

    const [row] = await db
      .select({
        totalRequests: count(),
        totalTokens: sum(requestLogs.totalTokens),
        promptTokens: sum(requestLogs.promptTokens),
        completionTokens: sum(requestLogs.completionTokens),
        avgLatencyMs: avg(requestLogs.latencyMs),
      })
      .from(requestLogs)
      .where(and(eq(requestLogs.apiKeyId, id), gte(requestLogs.createdAt, since)))

    return c.json({
      usage: {
        totalRequests: Number(row.totalRequests),
        totalTokens: Number(row.totalTokens ?? 0),
        promptTokens: Number(row.promptTokens ?? 0),
        completionTokens: Number(row.completionTokens ?? 0),
        averageLatencyMs: Math.round(Number(row.avgLatencyMs ?? 0)),
        period,
      },
    })
  })

  .put("/:id", requireRole("member"), zValidator("json", UpdateApiKeySchema), async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    if (!session) return c.json({ error: "Unauthorized" }, 401)

    const workspaceId = getWorkspaceId(c)
    const id = c.req.param("id")
    const body = c.req.valid("json")

    const existing = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
      columns: { id: true },
    })
    if (!existing) return c.json({ error: "API key not found" }, 404)

    await db.update(apiKeys)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.rpmLimit !== undefined && { rpmLimit: body.rpmLimit }),
        ...(body.tpmLimit !== undefined && { tpmLimit: body.tpmLimit }),
        ...(body.dailyLimit !== undefined && { dailyLimit: body.dailyLimit }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      })
      .where(eq(apiKeys.id, id))

    return c.json({ success: true })
  })

  .delete("/:id", requireRole("member"), async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    if (!session) return c.json({ error: "Unauthorized" }, 401)

    const workspaceId = getWorkspaceId(c)
    const id = c.req.param("id")

    const existing = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
      columns: { id: true },
    })
    if (!existing) return c.json({ error: "API key not found" }, 404)

    // Soft delete — revoked keys stay visible with their request logs intact
    await db.update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, id))

    return c.json({ success: true })
  })

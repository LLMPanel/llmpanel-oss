// apps/api/src/controllers/api-keys.controller.ts
import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { apiKeys, deployments, requestLogs } from "@llmpanel/db/schema"
import { eq, and, gte, count, sum, avg, desc } from "drizzle-orm"
import { createHash, randomBytes } from "crypto"
import { randomUUID } from "crypto"
import { getWorkspaceId } from "../lib/workspace-context"

// ── GET /api/v1/api-keys ─────────────────────────────────────────────
export const getApiKeys = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)

  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.workspaceId, workspaceId),
    with: {
      deployment: {
        columns: { id: true },
        with: {
          model: { columns: { name: true } },
        },
      },
      agent: {
        columns: { id: true, name: true },
      },
    },
    orderBy: [desc(apiKeys.createdAt)],
  })

  return c.json({
    apiKeys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: JSON.parse(k.scopes) as string[],
      rpmLimit: k.rpmLimit,
      tpmLimit: k.tpmLimit,
      dailyLimit: k.dailyLimit,
      deploymentId: k.deploymentId,
      agentId: k.agentId,
      agentName: k.agent?.name ?? null,
      deploymentName: k.agent
        ? `Agent: ${k.agent.name}`
        : k.deployment?.model?.name ?? "All Deployments",
      isActive: k.isActive,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      // keyHash is intentionally excluded
    })),
  })
}

// ── POST /api/v1/api-keys ────────────────────────────────────────────
export const createApiKey = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const body = await c.req.json()
  const { name, deploymentId, scopes, rpmLimit, tpmLimit, dailyLimit, expiresAt } = body

  if (!name) {
    return c.json({ error: "name is required" }, 400)
  }

  // Validate deployment belongs to the workspace (if scoped)
  if (deploymentId) {
    const deployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, workspaceId)
      ),
    })
    if (!deployment) {
      return c.json({ error: "Deployment not found" }, 404)
    }
  }

  // Generate key: gpup_sk_ + 32 random bytes hex
  const rawKey = `gpup_sk_${randomBytes(32).toString("hex")}`
  const keyHash = createHash("sha256").update(rawKey).digest("hex")
  const prefix = `${rawKey.substring(0, 16)}...`

  const [apiKey] = await db.insert(apiKeys).values({
    id: randomUUID(),
    userId: user.id,
    workspaceId,
    deploymentId: deploymentId ?? null,
    name,
    keyHash,
    prefix,
    scopes: JSON.stringify(scopes ?? ["chat"]),
    rpmLimit: rpmLimit ?? null,
    tpmLimit: tpmLimit ?? null,
    dailyLimit: dailyLimit ?? null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: true,
    createdAt: new Date(),
  }).returning()

  // Return full key ONCE — never returned again after this
  return c.json({
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,        // ← only time this is shown
      prefix: apiKey.prefix,
      scopes: JSON.parse(apiKey.scopes),
      createdAt: apiKey.createdAt,
    },
  }, 201)
}

// ── PUT /api/v1/api-keys/:id ─────────────────────────────────────────
export const updateApiKey = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")
  const body = await c.req.json()
  const { name, rpmLimit, tpmLimit, dailyLimit, isActive } = body

  const existing = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
  })

  if (!existing) {
    return c.json({ error: "API key not found" }, 404)
  }

  await db.update(apiKeys)
    .set({
      ...(name !== undefined && { name }),
      ...(rpmLimit !== undefined && { rpmLimit }),
      ...(tpmLimit !== undefined && { tpmLimit }),
      ...(dailyLimit !== undefined && { dailyLimit }),
      ...(isActive !== undefined && { isActive }),
    })
    .where(eq(apiKeys.id, id))

  return c.json({ success: true })
}

// ── DELETE /api/v1/api-keys/:id ──────────────────────────────────────
export const deleteApiKey = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const existing = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
  })

  if (!existing) {
    return c.json({ error: "API key not found" }, 404)
  }

  // Soft delete — mark inactive rather than hard delete
  // (preserves request logs foreign key integrity)
  await db.update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, id))

  return c.json({ success: true })
}

// ── GET /api/v1/api-keys/:id/usage ───────────────────────────────────
export const getApiKeyUsage = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")
  const period = c.req.query("period") ?? "24h"

  const existing = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)),
  })

  if (!existing) {
    return c.json({ error: "API key not found" }, 404)
  }

  const since = getPeriodStart(period)

  const [stats] = await db
    .select({
      totalRequests: count(),
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.apiKeyId, id),
        gte(requestLogs.createdAt, since)
      )
    )

  // Error rate
  const [errorStats] = await db
    .select({ errorCount: count() })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.apiKeyId, id),
        gte(requestLogs.createdAt, since),
        // status >= 400
      )
    )

  return c.json({
    usage: {
      totalRequests: Number(stats.totalRequests),
      totalTokens: Number(stats.totalTokens ?? 0),
      promptTokens: Number(stats.promptTokens ?? 0),
      completionTokens: Number(stats.completionTokens ?? 0),
      averageLatencyMs: Math.round(Number(stats.avgLatencyMs ?? 0)),
      period,
    },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────
function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case "24h": return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case "7d":  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    default:    return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }
}
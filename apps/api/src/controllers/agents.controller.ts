import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { agents, agentCollections, apiKeys, deployments, ragCollections, requestLogs } from "@llmpanel/db/schema"
import { and, desc, eq, inArray, like } from "drizzle-orm"
import { createHash, randomBytes, randomUUID } from "crypto"
import { encrypt, aadFor } from "../services/encryption.service"
import { getWorkspaceId } from "../lib/workspace-context"

type AgentSourceType = "deployment" | "openai-compatible"

export const AGENT_TOOL_NAMES = ["knowledge_search"] as const
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number]

type CreateAgentBody = {
  name: string
  description?: string
  systemPrompt?: string
  sourceType: AgentSourceType
  targetDeploymentId?: string
  externalBaseUrl?: string
  externalModel?: string
  externalApiKey?: string
  emoji?: string
  toolsEnabled?: AgentToolName[]
  /** @deprecated single-collection form, still accepted for older clients */
  ragCollectionId?: string | null
  ragCollectionIds?: string[]
  maxSteps?: number
  temperature?: number | null
  maxTokens?: number | null
}

type UpdateAgentBody = Partial<CreateAgentBody>

function parseToolsEnabled(raw: string): AgentToolName[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is AgentToolName =>
      AGENT_TOOL_NAMES.includes(t as AgentToolName)
    )
  } catch {
    return []
  }
}

export interface AttachedCollectionSummary {
  id: string
  name: string
  documentCount: number
  totalChunks: number
  vectorStoreType: string
  embeddingSource: string
}

function serializeAgent(
  agent: typeof agents.$inferSelect,
  attachedCollections: AttachedCollectionSummary[]
) {
  return {
    ...agent,
    toolsEnabled: parseToolsEnabled(agent.toolsEnabled),
    endpointPath: `/v1/agents/${agent.id}/chat/completions`,
    encryptedExternalApiKey: undefined,
    ragCollections: attachedCollections,
    ragCollectionIds: attachedCollections.map((c) => c.id),
    // Legacy single-collection field kept for older clients.
    ragCollectionId: attachedCollections[0]?.id ?? null,
  }
}

/** Attached active collections for a set of agents, keyed by agent id. */
async function loadAttachments(
  agentIds: string[]
): Promise<Map<string, AttachedCollectionSummary[]>> {
  const map = new Map<string, AttachedCollectionSummary[]>()
  if (agentIds.length === 0) return map

  const links = await db.query.agentCollections.findMany({
    where: inArray(agentCollections.agentId, agentIds),
    with: { collection: true },
  })

  for (const link of links) {
    if (!link.collection.isActive) continue
    const summary: AttachedCollectionSummary = {
      id: link.collection.id,
      name: link.collection.name,
      documentCount: link.collection.documentCount,
      totalChunks: link.collection.totalChunks,
      vectorStoreType: link.collection.vectorStoreType,
      embeddingSource: link.collection.embeddingSource,
    }
    const existing = map.get(link.agentId)
    if (existing) existing.push(summary)
    else map.set(link.agentId, [summary])
  }
  return map
}

async function serializeAgentWithAttachments(agent: typeof agents.$inferSelect) {
  const attachments = await loadAttachments([agent.id])
  return serializeAgent(agent, attachments.get(agent.id) ?? [])
}

/**
 * Normalize the requested collection ids (new array form or legacy single id)
 * and verify they all belong to the workspace. `undefined` means "no change".
 */
async function resolveRagCollectionIds(
  workspaceId: string,
  body: Pick<CreateAgentBody, "ragCollectionId" | "ragCollectionIds">
): Promise<{ ok: true; ids: string[] | undefined } | { ok: false }> {
  const requested =
    body.ragCollectionIds ??
    (body.ragCollectionId !== undefined
      ? body.ragCollectionId
        ? [body.ragCollectionId]
        : []
      : undefined)

  if (requested === undefined) return { ok: true, ids: undefined }

  const unique = [...new Set(requested)]
  if (unique.length === 0) return { ok: true, ids: [] }

  const rows = await db.query.ragCollections.findMany({
    where: and(
      inArray(ragCollections.id, unique),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
  })
  if (rows.length !== unique.length) return { ok: false }
  return { ok: true, ids: unique }
}

/** Replace an agent's collection attachments with the given set. */
async function syncAgentCollections(agentId: string, ids: string[]): Promise<void> {
  await db.delete(agentCollections).where(eq(agentCollections.agentId, agentId))
  if (ids.length > 0) {
    const now = new Date()
    await db.insert(agentCollections).values(
      ids.map((collectionId) => ({ agentId, collectionId, createdAt: now }))
    )
  }
}

async function ensureParentDeployment(c: Context, workspaceId: string, deploymentId: string) {
  const parentDeployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
  })

  if (!parentDeployment) {
    c.status(404)
    return null
  }

  return parentDeployment
}

export const getAgents = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const parentDeployment = await ensureParentDeployment(c, workspaceId, deploymentId)
  if (!parentDeployment) return c.json({ error: "Deployment not found" })

  const items = await db.query.agents.findMany({
    where: and(
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true)
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  })

  const attachments = await loadAttachments(items.map((a) => a.id))
  return c.json({
    agents: items.map((a) => serializeAgent(a, attachments.get(a.id) ?? [])),
  })
}

export const createAgent = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const body = await c.req.json<CreateAgentBody>()

  const parentDeployment = await ensureParentDeployment(c, workspaceId, deploymentId)
  if (!parentDeployment) return c.json({ error: "Deployment not found" })

  if (body.sourceType === "deployment") {
    const targetDeploymentId = body.targetDeploymentId ?? deploymentId
    const target = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, targetDeploymentId), eq(deployments.workspaceId, workspaceId)),
    })
    if (!target) return c.json({ error: "Target deployment not found" }, 404)
  }

  // Row id is generated up front so the ciphertext can be AAD-bound to it.
  const newAgentId = crypto.randomUUID()
  let encryptedExternalApiKey: string | null = null
  if (body.sourceType === "openai-compatible" && body.externalApiKey?.trim()) {
    encryptedExternalApiKey = await encrypt(body.externalApiKey.trim(), aadFor.agentExternalApiKey(newAgentId))
  }

  const ragResolution = await resolveRagCollectionIds(workspaceId, body)
  if (!ragResolution.ok) return c.json({ error: "Knowledge base collection not found" }, 404)
  const ragIds = ragResolution.ids ?? []

  const now = new Date()
  const [agent] = await db.insert(agents).values({
    id: newAgentId,
    userId: user.id,
    workspaceId,
    deploymentId,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    systemPrompt: body.systemPrompt?.trim() || null,
    sourceType: body.sourceType,
    targetDeploymentId: body.sourceType === "deployment" ? (body.targetDeploymentId ?? deploymentId) : null,
    externalBaseUrl: body.sourceType === "openai-compatible" ? (body.externalBaseUrl?.trim() ?? null) : null,
    externalModel: body.sourceType === "openai-compatible" ? (body.externalModel?.trim() ?? null) : null,
    encryptedExternalApiKey,
    emoji: body.emoji?.trim() || null,
    toolsEnabled: JSON.stringify(body.toolsEnabled ?? []),
    ragCollectionId: ragIds[0] ?? null,
    maxSteps: body.maxSteps ?? 6,
    temperature: body.temperature ?? null,
    maxTokens: body.maxTokens ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).returning()

  await syncAgentCollections(agent.id, ragIds)

  return c.json({ agent: await serializeAgentWithAttachments(agent) }, 201)
}

export const updateAgent = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const body = await c.req.json<UpdateAgentBody>()

  const parentDeployment = await ensureParentDeployment(c, workspaceId, deploymentId)
  if (!parentDeployment) return c.json({ error: "Deployment not found" })

  const existing = await db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true)
    ),
  })

  if (!existing) return c.json({ error: "Agent not found" }, 404)

  const sourceType = body.sourceType ?? (existing.sourceType as AgentSourceType)

  if (sourceType === "deployment") {
    const targetDeploymentId = body.targetDeploymentId ?? existing.targetDeploymentId ?? deploymentId
    const target = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, targetDeploymentId), eq(deployments.workspaceId, workspaceId)),
    })
    if (!target) return c.json({ error: "Target deployment not found" }, 404)
  }

  let encryptedExternalApiKey = existing.encryptedExternalApiKey
  let externalBaseUrl = existing.externalBaseUrl
  let externalModel = existing.externalModel
  if (sourceType === "openai-compatible") {
    externalBaseUrl = body.externalBaseUrl?.trim() ?? existing.externalBaseUrl
    externalModel = body.externalModel?.trim() ?? existing.externalModel

    if (!externalBaseUrl || !externalModel) {
      return c.json({ error: "externalBaseUrl and externalModel are required for openai-compatible source" }, 400)
    }

    if (typeof body.externalApiKey === "string" && body.externalApiKey.trim()) {
      encryptedExternalApiKey = await encrypt(body.externalApiKey.trim(), aadFor.agentExternalApiKey(agentId))
    } else if (!existing.encryptedExternalApiKey) {
      return c.json({ error: "externalApiKey is required for openai-compatible source" }, 400)
    }
  } else {
    encryptedExternalApiKey = null
    externalBaseUrl = null
    externalModel = null
  }

  const ragResolution = await resolveRagCollectionIds(workspaceId, body)
  if (!ragResolution.ok) return c.json({ error: "Knowledge base collection not found" }, 404)

  let ragCollectionId = existing.ragCollectionId
  if (ragResolution.ids !== undefined) {
    await syncAgentCollections(agentId, ragResolution.ids)
    ragCollectionId = ragResolution.ids[0] ?? null
  }

  await db.update(agents).set({
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.description !== undefined && { description: body.description?.trim() || null }),
    ...(body.systemPrompt !== undefined && { systemPrompt: body.systemPrompt?.trim() || null }),
    ...(body.emoji !== undefined && { emoji: body.emoji?.trim() || null }),
    ...(body.toolsEnabled !== undefined && { toolsEnabled: JSON.stringify(body.toolsEnabled) }),
    ...(body.maxSteps !== undefined && { maxSteps: body.maxSteps }),
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.maxTokens !== undefined && { maxTokens: body.maxTokens }),
    ragCollectionId,
    sourceType,
    targetDeploymentId: sourceType === "deployment"
      ? (body.targetDeploymentId ?? existing.targetDeploymentId ?? deploymentId)
      : null,
    externalBaseUrl,
    externalModel,
    encryptedExternalApiKey,
    updatedAt: new Date(),
  }).where(eq(agents.id, agentId))

  const updated = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)),
  })

  if (!updated) return c.json({ error: "Agent not found" }, 404)
  return c.json({ agent: await serializeAgentWithAttachments(updated) })
}

export const deleteAgent = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")

  const existing = await db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true)
    ),
  })

  if (!existing) return c.json({ error: "Agent not found" }, 404)

  await db.update(agents).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(agents.id, agentId))

  // Revoke keys locked to this agent — they have nothing left to access.
  await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.agentId, agentId))

  return c.json({ success: true })
}

// ── Single agent ─────────────────────────────────────────────────────

async function findWorkspaceAgent(workspaceId: string, deploymentId: string, agentId: string) {
  return db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true)
    ),
  })
}

export const getAgent = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  return c.json({ agent: await serializeAgentWithAttachments(agent) })
}

// ── Per-agent API keys ───────────────────────────────────────────────

function serializeAgentKey(key: typeof apiKeys.$inferSelect) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    isActive: key.isActive,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  }
}

export const getAgentKeys = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const keys = await db.query.apiKeys.findMany({
    where: and(
      eq(apiKeys.agentId, agentId),
      eq(apiKeys.workspaceId, workspaceId),
      eq(apiKeys.isActive, true)
    ),
    orderBy: [desc(apiKeys.createdAt)],
  })

  return c.json({ keys: keys.map(serializeAgentKey) })
}

export const createAgentKey = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const body = await c.req.json<{ name?: string; expiresAt?: string }>().catch(() => ({} as { name?: string; expiresAt?: string }))

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  // Same format as gateway keys: gpup_sk_ + 32 random bytes hex, SHA-256 stored.
  const rawKey = `gpup_sk_${randomBytes(32).toString("hex")}`
  const keyHash = createHash("sha256").update(rawKey).digest("hex")
  const prefix = `${rawKey.substring(0, 16)}...`

  const [key] = await db.insert(apiKeys).values({
    id: randomUUID(),
    userId: user.id,
    workspaceId,
    deploymentId: null,
    agentId,
    name: body.name?.trim() || `${agent.name} key`,
    keyHash,
    prefix,
    scopes: JSON.stringify(["chat"]),
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    isActive: true,
    createdAt: new Date(),
  }).returning()

  // Full key is returned exactly once — only the hash is stored.
  return c.json({ key: { ...serializeAgentKey(key), key: rawKey } }, 201)
}

export const revokeAgentKey = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const keyId = c.req.param("keyId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.id, keyId),
      eq(apiKeys.workspaceId, workspaceId),
      eq(apiKeys.agentId, agentId)
    ),
  })
  if (!existing) return c.json({ error: "API key not found" }, 404)

  await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, keyId))
  return c.json({ success: true })
}

// ── Usage stats (Overview tab) ───────────────────────────────────────

export const getAgentUsage = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // Depending on mount point the logged path may or may not carry a /v1 prefix.
  const agentPathSuffix = `%/agents/${agentId}/chat/completions`

  const logs = await db.query.requestLogs.findMany({
    where: and(
      eq(requestLogs.workspaceId, workspaceId),
      like(requestLogs.path, agentPathSuffix)
    ),
    orderBy: [desc(requestLogs.createdAt)],
    limit: 500,
  })

  const recent = logs.filter((l) => l.createdAt >= since)
  const totalTokens = recent.reduce((sum, l) => sum + (l.totalTokens ?? 0), 0)
  const errorCount = recent.filter((l) => l.statusCode >= 400).length
  const avgLatencyMs = recent.length
    ? Math.round(recent.reduce((sum, l) => sum + l.latencyMs, 0) / recent.length)
    : 0

  return c.json({
    usage: {
      period: "7d",
      totalRequests: recent.length,
      totalTokens,
      errorCount,
      avgLatencyMs,
      lastRequestAt: logs[0]?.createdAt ?? null,
    },
  })
}

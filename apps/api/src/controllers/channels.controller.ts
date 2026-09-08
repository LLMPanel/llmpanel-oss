import type { Context } from "hono"
import { eq, and, ne, desc, sql, gte } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { channelConnections, channelMessages, deployments, agents } from "@llmpanel/db"
import { encrypt, decrypt, aadFor } from "../services/encryption.service"
import { channelManager } from "../services/channel-manager.service"
import { getWorkspaceId } from "../lib/workspace-context"

type ChannelPlatform = "whatsapp" | "telegram" | "discord" | "slack" | "feishu" | "twitch" | "zalo"

type ChannelRow = typeof channelConnections.$inferSelect
type AgentRow = typeof agents.$inferSelect
type AgentSummary = { id: string; name: string; emoji: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertDeploymentInWorkspace(deploymentId: string, workspaceId: string) {
  const dep = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })
  if (!dep || dep.workspaceId !== workspaceId) {
    return null
  }
  return dep
}

function safeParseConfig(json: string): Record<string, string> {
  try {
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

async function assertChannelInWorkspace(channelId: string, deploymentId: string, workspaceId: string) {
  return db.query.channelConnections.findFirst({
    where: and(
      eq(channelConnections.id, channelId),
      eq(channelConnections.deploymentId, deploymentId),
      eq(channelConnections.workspaceId, workspaceId),
    ),
  })
}

/** Agent must belong to the same workspace + deployment and be active. */
async function resolveBindableAgent(
  agentId: string,
  deploymentId: string,
  workspaceId: string
): Promise<AgentRow | null> {
  const agent = await db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true),
    ),
  })
  return agent ?? null
}

const MASK_SENTINEL = "••••••"

const mask = (v: string) => v ? v.slice(0, 6) + MASK_SENTINEL : ""

/** Reject configs echoing masked values back — encrypting them would corrupt credentials. */
function containsMaskedValues(config: Record<string, string>): boolean {
  return Object.values(config).some((v) => typeof v === "string" && v.includes(MASK_SENTINEL))
}

function parseAllowlistColumn(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((v): v is string => typeof v === "string")
  } catch {
    return null
  }
}

function serializeChannel(
  ch: ChannelRow,
  config: Record<string, string>,
  agent: AgentSummary | null
) {
  return {
    id: ch.id,
    platform: ch.platform,
    name: ch.name,
    status: ch.status,
    statusMessage: ch.statusMessage,
    isActive: ch.isActive,
    connectedAt: ch.connectedAt,
    createdAt: ch.createdAt,
    systemPrompt: ch.systemPrompt,
    memoryEnabled: ch.memoryEnabled,
    agentId: ch.agentId,
    agent,
    historyEnabled: ch.historyEnabled,
    historyLimit: ch.historyLimit,
    allowlist: parseAllowlistColumn(ch.allowlist),
    rateLimitPerMinute: ch.rateLimitPerMinute,
    config: maskConfig(ch.platform as ChannelPlatform, config),
  }
}

function toAgentSummary(agent: AgentRow | null | undefined): AgentSummary | null {
  if (!agent) return null
  return { id: agent.id, name: agent.name, emoji: agent.emoji }
}

// Strip sensitive fields before sending to frontend
function maskConfig(platform: ChannelPlatform, config: Record<string, string>) {
  switch (platform) {
    case "whatsapp":
      return { phoneNumber: config.phoneNumber, sessionId: config.sessionId }
    case "telegram":
      return { botToken: mask(config.botToken), webhookSecret: config.webhookSecret }
    case "discord":
      return {
        botToken: mask(config.botToken),
        applicationId: config.applicationId,
        publicKey: config.publicKey,
        guildId: config.guildId,
      }
    case "slack":
      return {
        botToken: mask(config.botToken),
        appToken: mask(config.appToken ?? ""),
        signingSecret: mask(config.signingSecret ?? ""),
        appId: config.appId,
        defaultChannel: config.defaultChannel,
      }
    case "feishu":
      return {
        appId: config.appId,
        appSecret: mask(config.appSecret ?? ""),
      }
    case "twitch":
      return {
        oauthToken: mask(config.oauthToken ?? ""),
        clientId: config.clientId,
        channels: config.channels,
      }
    case "zalo":
      return {
        appId: config.appId,
        secretKey: mask(config.secretKey ?? ""),
        oaAccessToken: mask(config.oaAccessToken ?? ""),
      }
    default:
      return {}
  }
}

const validPlatforms: ChannelPlatform[] = [
  "whatsapp", "telegram", "discord", "slack", "feishu", "twitch", "zalo",
]

// ── GET /api/v1/deployments/:id/channels ─────────────────────────────────────

export const getChannels = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const channels = await db.query.channelConnections.findMany({
    where: and(
      eq(channelConnections.deploymentId, deploymentId),
      eq(channelConnections.workspaceId, workspaceId),
      eq(channelConnections.isActive, true),
    ),
    with: { agent: true },
  })

  const result = await Promise.all(
    channels.map(async (ch) => {
      const rawConfig = await decrypt(ch.encryptedConfig, aadFor.channelConnectionConfig(ch.id)).catch(() => "{}")
      const config = safeParseConfig(rawConfig)
      return serializeChannel(ch, config, toAgentSummary(ch.agent))
    })
  )

  return c.json({ channels: result })
}

// ── GET /api/v1/deployments/:id/channels/:channelId ──────────────────────────

export const getChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const channel = await db.query.channelConnections.findFirst({
    where: and(
      eq(channelConnections.id, channelId),
      eq(channelConnections.deploymentId, deploymentId),
      eq(channelConnections.workspaceId, workspaceId),
      eq(channelConnections.isActive, true),
    ),
    with: { agent: true },
  })
  if (!channel) return c.json({ error: "Channel not found" }, 404)

  const rawConfig = await decrypt(channel.encryptedConfig, aadFor.channelConnectionConfig(channel.id)).catch(() => "{}")
  const config = safeParseConfig(rawConfig)

  return c.json({ channel: serializeChannel(channel, config, toAgentSummary(channel.agent)) })
}

// ── POST /api/v1/deployments/:id/channels ────────────────────────────────────

export const createChannel = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const body = await c.req.json<{
    platform: ChannelPlatform
    name: string
    config: Record<string, string>
    systemPrompt?: string
    memoryEnabled?: boolean
    agentId?: string | null
    historyEnabled?: boolean
    historyLimit?: number
    allowlist?: string[] | null
    rateLimitPerMinute?: number | null
  }>()

  if (!body.platform || !body.name || !body.config) {
    return c.json({ error: "platform, name, and config are required" }, 400)
  }

  if (!validPlatforms.includes(body.platform)) {
    return c.json({ error: "Invalid platform" }, 400)
  }

  let agent: AgentRow | null = null
  if (body.agentId) {
    agent = await resolveBindableAgent(body.agentId, deploymentId, workspaceId)
    if (!agent) {
      return c.json({ error: "Agent not found on this deployment" }, 400)
    }
  }

  // Row id is generated up front so the ciphertext can be AAD-bound to it.
  const newChannelId = crypto.randomUUID()
  const encryptedConfig = await encrypt(JSON.stringify(body.config), aadFor.channelConnectionConfig(newChannelId))

  const [channel] = await db.insert(channelConnections).values({
    id: newChannelId,
    userId: user.id,
    workspaceId,
    deploymentId,
    platform: body.platform,
    name: body.name,
    encryptedConfig,
    systemPrompt: body.systemPrompt ?? null,
    memoryEnabled: body.memoryEnabled ?? true,
    agentId: agent?.id ?? null,
    historyEnabled: body.historyEnabled ?? true,
    historyLimit: body.historyLimit ?? 20,
    allowlist: body.allowlist && body.allowlist.length > 0
      ? JSON.stringify(body.allowlist)
      : null,
    rateLimitPerMinute: body.rateLimitPerMinute ?? null,
    status: "pending",
    isActive: true,
    createdAt: new Date(),
  }).returning()

  // Fire and forget — start the channel adapter
  void channelManager.startChannel(channel.id)

  return c.json({
    channel: serializeChannel(channel, body.config, toAgentSummary(agent)),
  }, 201)
}

// ── PATCH /api/v1/deployments/:id/channels/:channelId ────────────────────────

export const updateChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const body = await c.req.json<{
    name?: string
    isActive?: boolean
    config?: Record<string, string>
    systemPrompt?: string | null
    memoryEnabled?: boolean
    agentId?: string | null
    historyEnabled?: boolean
    historyLimit?: number
    allowlist?: string[] | null
    rateLimitPerMinute?: number | null
  }>()

  const updates: Partial<typeof channelConnections.$inferInsert> = {}
  let configChanged = false
  let memoryChanged = false

  if (body.name !== undefined) updates.name = body.name
  if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt
  if (body.memoryEnabled !== undefined) {
    updates.memoryEnabled = body.memoryEnabled
    memoryChanged = body.memoryEnabled !== existing.memoryEnabled
  }
  if (body.historyEnabled !== undefined) updates.historyEnabled = body.historyEnabled
  if (body.historyLimit !== undefined) updates.historyLimit = body.historyLimit
  if (body.allowlist !== undefined) {
    updates.allowlist = body.allowlist && body.allowlist.length > 0
      ? JSON.stringify(body.allowlist)
      : null
  }
  if (body.rateLimitPerMinute !== undefined) {
    updates.rateLimitPerMinute = body.rateLimitPerMinute
  }
  if (body.agentId !== undefined) {
    if (body.agentId === null) {
      updates.agentId = null
    } else {
      const agent = await resolveBindableAgent(body.agentId, deploymentId, workspaceId)
      if (!agent) {
        return c.json({ error: "Agent not found on this deployment" }, 400)
      }
      updates.agentId = agent.id
    }
  }
  if (body.config !== undefined) {
    if (containsMaskedValues(body.config)) {
      return c.json(
        { error: "config contains masked values; re-enter full credentials" },
        400
      )
    }
    updates.encryptedConfig = await encrypt(JSON.stringify(body.config), aadFor.channelConnectionConfig(channelId))
    configChanged = true
  }
  if (body.isActive !== undefined) updates.isActive = body.isActive

  await db.update(channelConnections).set(updates).where(eq(channelConnections.id, channelId))

  // Adapter lifecycle. Behavior fields (agent, prompts, history, access
  // control) are read fresh per message and need no restart; credentials and
  // the memory toggle are captured at connect time, so they trigger one.
  if (body.isActive === true) {
    void channelManager.startChannel(channelId) // start stops any existing adapter first
  } else if (body.isActive === false) {
    void channelManager.stopChannel(channelId)
  } else if ((configChanged || memoryChanged) && existing.isActive) {
    void channelManager.restartChannel(channelId)
  }

  return c.json({ success: true })
}

// ── DELETE /api/v1/deployments/:id/channels/:channelId ───────────────────────

export const deleteChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  // Stop adapter before soft delete
  await channelManager.stopChannel(channelId)

  // Soft delete
  await db.update(channelConnections)
    .set({ isActive: false, status: "pending" })
    .where(eq(channelConnections.id, channelId))

  return c.json({ success: true })
}

// ── POST /api/v1/deployments/:id/channels/:channelId/start ──────────────────

export const startChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  void channelManager.startChannel(channelId)
  return c.json({ success: true, message: "Channel starting" })
}

// ── POST /api/v1/deployments/:id/channels/:channelId/stop ───────────────────

export const stopChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  await channelManager.stopChannel(channelId)
  return c.json({ success: true, message: "Channel stopped" })
}

// ── POST /api/v1/deployments/:id/channels/:channelId/restart ────────────────

export const restartChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  void channelManager.restartChannel(channelId)
  return c.json({ success: true, message: "Channel restarting" })
}

// ── GET /api/v1/deployments/:id/channels/:channelId/messages ────────────────

export const getMessages = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 100)
  const offset = Number(c.req.query("offset") ?? "0")

  const messages = await db.query.channelMessages.findMany({
    where: eq(channelMessages.channelConnectionId, channelId),
    orderBy: desc(channelMessages.createdAt),
    limit,
    offset,
  })

  return c.json({ messages })
}

// ── GET /api/v1/deployments/:id/channels/:channelId/stats ───────────────────

export const getChannelStats = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const notSystem = and(
    eq(channelMessages.channelConnectionId, channelId),
    ne(channelMessages.direction, "system"),
  )

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [totals] = await db
    .select({
      totalMessages: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${channelMessages.platformUserId})`,
      lastMessageAt: sql<number | null>`max(${channelMessages.createdAt})`,
    })
    .from(channelMessages)
    .where(notSystem)

  const [recent] = await db
    .select({ messages24h: sql<number>`count(*)` })
    .from(channelMessages)
    .where(and(notSystem, gte(channelMessages.createdAt, since24h)))

  return c.json({
    stats: {
      totalMessages: totals?.totalMessages ?? 0,
      messages24h: recent?.messages24h ?? 0,
      uniqueUsers: totals?.uniqueUsers ?? 0,
      connectedAt: existing.connectedAt,
      lastMessageAt: totals?.lastMessageAt
        ? new Date(totals.lastMessageAt * 1000)
        : null,
    },
  })
}

// ── GET /api/v1/deployments/:id/channels/:channelId/conversations ───────────

export const getConversations = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const rows = await db
    .select({
      platformUserId: channelMessages.platformUserId,
      platformUsername: sql<string | null>`max(${channelMessages.platformUsername})`,
      messageCount: sql<number>`count(*)`,
      lastMessageAt: sql<number>`max(${channelMessages.createdAt})`,
      lastMessagePreview: sql<string | null>`(
        select m2.content from channel_messages m2
        where m2.channel_connection_id = ${channelId}
          and m2.platform_user_id = ${channelMessages.platformUserId}
          and m2.direction != 'system'
        order by m2.rowid desc limit 1
      )`,
    })
    .from(channelMessages)
    .where(and(
      eq(channelMessages.channelConnectionId, channelId),
      ne(channelMessages.direction, "system"),
    ))
    .groupBy(channelMessages.platformUserId)
    .orderBy(desc(sql`max(${channelMessages.createdAt})`))

  return c.json({
    conversations: rows.map((r) => ({
      platformUserId: r.platformUserId,
      platformUsername: r.platformUsername,
      messageCount: r.messageCount,
      lastMessageAt: new Date(r.lastMessageAt * 1000),
      lastMessagePreview: r.lastMessagePreview,
    })),
  })
}

// ── GET /api/v1/deployments/:id/channels/:channelId/conversations/:platformUserId/messages

export const getConversationMessages = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")
  const platformUserId = c.req.param("platformUserId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const limit = Math.min(Number(c.req.query("limit") ?? "100"), 200)
  const offset = Number(c.req.query("offset") ?? "0")

  // Newest first by insertion order (created_at only has second granularity);
  // includes "system" reset markers so the UI can render dividers.
  const messages = await db.query.channelMessages.findMany({
    where: and(
      eq(channelMessages.channelConnectionId, channelId),
      eq(channelMessages.platformUserId, platformUserId),
    ),
    orderBy: desc(sql`rowid`),
    limit,
    offset,
  })

  return c.json({ messages })
}

// ── POST /api/v1/deployments/:id/channels/:channelId/test ───────────────────

export const testChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const channelId = c.req.param("channelId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await assertChannelInWorkspace(channelId, deploymentId, workspaceId)
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  if (!channelManager.isChannelRunning(channelId)) {
    return c.json({ error: "Channel is not currently running" }, 400)
  }

  return c.json({ success: true, message: "Channel is connected and running" })
}

import type { Context } from "hono"
import { eq, and } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { alertChannels, alertRules, deployments } from "@llmpanel/db/schema"
import { encrypt, decrypt, aadFor } from "../services/encryption.service"
import { sendTestAlert } from "../services/alert.service"
import { getWorkspaceId } from "../lib/workspace-context"

type AlertPlatform = "telegram" | "discord" | "slack"

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseConfig(json: string): Record<string, string> {
  try {
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

function safeParseEvents(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Return masked credentials safe to expose in API responses */
function maskConfig(platform: AlertPlatform, config: Record<string, string>) {
  const mask = (v: string) => (v ? `${v.slice(0, 6)}••••••` : "")
  switch (platform) {
    case "telegram":
      return { botToken: mask(config.botToken ?? ""), chatId: config.chatId ?? "" }
    case "discord":
      return { webhookUrl: mask(config.webhookUrl ?? "") }
    case "slack":
      return { webhookUrl: mask(config.webhookUrl ?? "") }
    default:
      return {}
  }
}

async function assertDeploymentInWorkspace(deploymentId: string, workspaceId: string) {
  const dep = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
  })
  return dep ?? null
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT CHANNELS (user-level)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/alerts/channels
export const getAlertChannels = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)

  const channels = await db.query.alertChannels.findMany({
    where: and(eq(alertChannels.workspaceId, workspaceId), eq(alertChannels.isActive, true)),
  })

  const result = await Promise.all(
    channels.map(async (ch) => {
      const rawConfig = await decrypt(ch.encryptedConfig, aadFor.alertChannelConfig(ch.id)).catch(() => "{}")
      const config = safeParseConfig(rawConfig)
      return {
        id: ch.id,
        platform: ch.platform,
        name: ch.name,
        isActive: ch.isActive,
        createdAt: ch.createdAt,
        config: maskConfig(ch.platform as AlertPlatform, config),
      }
    })
  )

  return c.json({ channels: result })
}

// POST /api/v1/alerts/channels
export const createAlertChannel = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)

  const body = await c.req.json<{
    platform: AlertPlatform
    name: string
    config: Record<string, string>
  }>()

  const validPlatforms: AlertPlatform[] = ["telegram", "discord", "slack"]
  if (!body.platform || !validPlatforms.includes(body.platform)) {
    return c.json({ error: "platform must be one of: telegram, discord, slack" }, 400)
  }
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400)
  if (!body.config) return c.json({ error: "config is required" }, 400)

  // Platform-specific config validation
  switch (body.platform) {
    case "telegram":
      if (!body.config.botToken || !body.config.chatId)
        return c.json({ error: "telegram requires botToken and chatId" }, 400)
      break
    case "discord":
      if (!body.config.webhookUrl)
        return c.json({ error: "discord requires webhookUrl" }, 400)
      break
    case "slack":
      if (!body.config.webhookUrl)
        return c.json({ error: "slack requires webhookUrl" }, 400)
      break
  }

  // Row id is generated up front so the ciphertext can be AAD-bound to it.
  const newChannelId = crypto.randomUUID()
  const encryptedConfig = await encrypt(JSON.stringify(body.config), aadFor.alertChannelConfig(newChannelId))

  const [channel] = await db
    .insert(alertChannels)
    .values({
      id: newChannelId,
      userId: user.id,
      workspaceId,
      platform: body.platform,
      name: body.name.trim(),
      encryptedConfig,
      isActive: true,
      createdAt: new Date(),
    })
    .returning()

  return c.json(
    {
      channel: {
        id: channel.id,
        platform: channel.platform,
        name: channel.name,
        isActive: channel.isActive,
        createdAt: channel.createdAt,
        config: maskConfig(body.platform, body.config),
      },
    },
    201
  )
}

// PATCH /api/v1/alerts/channels/:channelId
export const updateAlertChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const channelId = c.req.param("channelId")

  const existing = await db.query.alertChannels.findFirst({
    where: and(eq(alertChannels.id, channelId), eq(alertChannels.workspaceId, workspaceId)),
  })
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  const body = await c.req.json<{
    name?: string
    config?: Record<string, string>
  }>()

  const updates: Partial<typeof alertChannels.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.config !== undefined) {
    updates.encryptedConfig = await encrypt(JSON.stringify(body.config), aadFor.alertChannelConfig(channelId))
  }

  await db.update(alertChannels).set(updates).where(eq(alertChannels.id, channelId))

  return c.json({ success: true })
}

// DELETE /api/v1/alerts/channels/:channelId
export const deleteAlertChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const channelId = c.req.param("channelId")

  const existing = await db.query.alertChannels.findFirst({
    where: and(eq(alertChannels.id, channelId), eq(alertChannels.workspaceId, workspaceId)),
  })
  if (!existing) return c.json({ error: "Channel not found" }, 404)

  // Soft delete — also deactivates any rules pointing to this channel
  await db.update(alertChannels).set({ isActive: false }).where(eq(alertChannels.id, channelId))

  return c.json({ success: true })
}

// POST /api/v1/alerts/channels/:channelId/test
export const testAlertChannel = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const channelId = c.req.param("channelId")

  try {
    await sendTestAlert(channelId, workspaceId)
    return c.json({ success: true, message: "Test alert sent successfully" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test alert"
    return c.json({ error: message }, 400)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT RULES (deployment-level)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/deployments/:id/alerts
export const getAlertRules = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const rules = await db.query.alertRules.findMany({
    where: eq(alertRules.deploymentId, deploymentId),
    with: { channel: true },
  })

  const result = await Promise.all(
    rules.map(async (rule) => {
      const rawConfig = await decrypt(rule.channel.encryptedConfig, aadFor.alertChannelConfig(rule.channel.id)).catch(() => "{}")
      const config = safeParseConfig(rawConfig)
      return {
        id: rule.id,
        deploymentId: rule.deploymentId,
        channelId: rule.channelId,
        events: safeParseEvents(rule.events),
        isActive: rule.isActive,
        createdAt: rule.createdAt,
        channel: {
          id: rule.channel.id,
          platform: rule.channel.platform,
          name: rule.channel.name,
          isActive: rule.channel.isActive,
          config: maskConfig(rule.channel.platform as AlertPlatform, config),
        },
      }
    })
  )

  return c.json({ rules: result })
}

// POST /api/v1/deployments/:id/alerts
export const createAlertRule = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const body = await c.req.json<{
    channelId: string
    events: string[]
  }>()

  if (!body.channelId) return c.json({ error: "channelId is required" }, 400)
  if (!Array.isArray(body.events) || body.events.length === 0)
    return c.json({ error: "events must be a non-empty array" }, 400)

  const validEvents = [
    "deployment.started",
    "deployment.running",
    "deployment.failed",
    "deployment.stopped",
  ]
  const invalid = body.events.filter((e) => !validEvents.includes(e))
  if (invalid.length > 0)
    return c.json({ error: `Invalid events: ${invalid.join(", ")}` }, 400)

  // Verify the channel belongs to this workspace and is active
  const channel = await db.query.alertChannels.findFirst({
    where: and(
      eq(alertChannels.id, body.channelId),
      eq(alertChannels.workspaceId, workspaceId),
      eq(alertChannels.isActive, true)
    ),
  })
  if (!channel) return c.json({ error: "Alert channel not found" }, 404)

  const [rule] = await db
    .insert(alertRules)
    .values({
      id: crypto.randomUUID(),
      deploymentId,
      channelId: body.channelId,
      events: JSON.stringify(body.events),
      isActive: true,
      createdAt: new Date(),
    })
    .returning()

  return c.json(
    {
      rule: {
        id: rule.id,
        deploymentId: rule.deploymentId,
        channelId: rule.channelId,
        events: body.events,
        isActive: rule.isActive,
        createdAt: rule.createdAt,
      },
    },
    201
  )
}

// PATCH /api/v1/deployments/:id/alerts/:ruleId
export const updateAlertRule = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const ruleId = c.req.param("ruleId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await db.query.alertRules.findFirst({
    where: and(eq(alertRules.id, ruleId), eq(alertRules.deploymentId, deploymentId)),
  })
  if (!existing) return c.json({ error: "Alert rule not found" }, 404)

  const body = await c.req.json<{
    events?: string[]
    isActive?: boolean
  }>()

  const updates: Partial<typeof alertRules.$inferInsert> = {}
  if (body.events !== undefined) updates.events = JSON.stringify(body.events)
  if (body.isActive !== undefined) updates.isActive = body.isActive

  await db.update(alertRules).set(updates).where(eq(alertRules.id, ruleId))

  return c.json({ success: true })
}

// DELETE /api/v1/deployments/:id/alerts/:ruleId
export const deleteAlertRule = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const ruleId = c.req.param("ruleId")

  const dep = await assertDeploymentInWorkspace(deploymentId, workspaceId)
  if (!dep) return c.json({ error: "Deployment not found" }, 404)

  const existing = await db.query.alertRules.findFirst({
    where: and(eq(alertRules.id, ruleId), eq(alertRules.deploymentId, deploymentId)),
  })
  if (!existing) return c.json({ error: "Alert rule not found" }, 404)

  await db.delete(alertRules).where(eq(alertRules.id, ruleId))

  return c.json({ success: true })
}

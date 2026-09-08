import { db } from "@llmpanel/db"
import { alertRules, alertChannels, deployments } from "@llmpanel/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { decrypt, aadFor } from "./encryption.service"

export type AlertEvent =
  | "deployment.started"
  | "deployment.running"
  | "deployment.failed"
  | "deployment.stopped"

type TelegramConfig = { botToken: string; chatId: string }
type DiscordConfig  = { webhookUrl: string }
type SlackConfig    = { webhookUrl: string }

interface AlertPayload {
  event: AlertEvent
  deploymentId: string
  modelName: string
  status: string
  message?: string
  errorMessage?: string
}

// ── Platform senders ────────────────────────────────────────────────────────

async function sendTelegram(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram API error ${res.status}: ${body}`)
  }
}

async function sendDiscord(config: DiscordConfig, payload: AlertPayload): Promise<void> {
  const color = eventColor(payload.event)
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: eventTitle(payload.event),
          description: buildDescription(payload),
          color,
          fields: [
            { name: "Deployment ID", value: `\`${payload.deploymentId}\``, inline: true },
            { name: "Model", value: payload.modelName, inline: true },
            { name: "Status", value: payload.status, inline: true },
          ],
          footer: { text: "LLMPanel Alerts" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Discord webhook error ${res.status}: ${body}`)
  }
}

async function sendSlack(config: SlackConfig, payload: AlertPayload): Promise<void> {
  const emoji = eventEmoji(payload.event)
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} ${eventTitle(payload.event)}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Model:*\n${payload.modelName}` },
            { type: "mrkdwn", text: `*Status:*\n${payload.status}` },
            { type: "mrkdwn", text: `*Deployment:*\n\`${payload.deploymentId}\`` },
          ],
        },
        ...(payload.message || payload.errorMessage
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Details:*\n${payload.errorMessage ?? payload.message}`,
                },
              },
            ]
          : []),
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Slack webhook error ${res.status}: ${body}`)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function eventTitle(event: AlertEvent): string {
  switch (event) {
    case "deployment.started": return "Deployment Started"
    case "deployment.running": return "Deployment Running"
    case "deployment.failed":  return "Deployment Failed"
    case "deployment.stopped": return "Deployment Stopped"
  }
}

function eventEmoji(event: AlertEvent): string {
  switch (event) {
    case "deployment.started": return "🚀"
    case "deployment.running": return "✅"
    case "deployment.failed":  return "🔴"
    case "deployment.stopped": return "⏹️"
  }
}

function eventColor(event: AlertEvent): number {
  // Discord color as integer
  switch (event) {
    case "deployment.started": return 0x3b82f6  // blue
    case "deployment.running": return 0x22c55e  // green
    case "deployment.failed":  return 0xef4444  // red
    case "deployment.stopped": return 0x6b7280  // gray
  }
}

function buildDescription(payload: AlertPayload): string {
  const emoji = eventEmoji(payload.event)
  const base = `${emoji} **${payload.modelName}** — ${payload.status}`
  if (payload.errorMessage) return `${base}\n\n**Error:** ${payload.errorMessage}`
  if (payload.message) return `${base}\n\n${payload.message}`
  return base
}

function buildTelegramText(payload: AlertPayload): string {
  const emoji = eventEmoji(payload.event)
  const lines = [
    `${emoji} <b>${eventTitle(payload.event)}</b>`,
    `<b>Model:</b> ${payload.modelName}`,
    `<b>Status:</b> ${payload.status}`,
    `<b>Deployment:</b> <code>${payload.deploymentId}</code>`,
  ]
  if (payload.errorMessage) lines.push(`<b>Error:</b> ${payload.errorMessage}`)
  else if (payload.message) lines.push(`<b>Details:</b> ${payload.message}`)
  return lines.join("\n")
}

function safeParseConfig<T>(json: string): T {
  return JSON.parse(json) as T
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: find all active alert rules for a deployment matching
 * the event, then dispatch notifications to each channel. Errors are swallowed
 * per-channel so one bad config cannot block others.
 */
export async function fireDeploymentAlert(
  deploymentId: string,
  event: AlertEvent,
  extra?: { message?: string; errorMessage?: string }
): Promise<void> {
  // Load deployment + model name
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })
  if (!deployment) return

  // Find active rules that include this event
  const rules = await db.query.alertRules.findMany({
    where: and(
      eq(alertRules.deploymentId, deploymentId),
      eq(alertRules.isActive, true),
    ),
    with: { channel: true },
  })

  const matchingRules = rules.filter((rule) => {
    const events = safeParseConfig<string[]>(rule.events)
    return events.includes(event) && rule.channel.isActive
  })

  if (matchingRules.length === 0) return

  const payload: AlertPayload = {
    event,
    deploymentId,
    modelName: deployment.huggingfaceId,
    status: deployment.status,
    message: extra?.message,
    errorMessage: extra?.errorMessage,
  }

  // Dispatch to each channel concurrently (best effort)
  await Promise.allSettled(
    matchingRules.map(async (rule) => {
      const channel = rule.channel
      const plainConfig = await decrypt(channel.encryptedConfig, aadFor.alertChannelConfig(channel.id))

      switch (channel.platform) {
        case "telegram": {
          const cfg = safeParseConfig<TelegramConfig>(plainConfig)
          await sendTelegram(cfg, buildTelegramText(payload))
          break
        }
        case "discord": {
          const cfg = safeParseConfig<DiscordConfig>(plainConfig)
          await sendDiscord(cfg, payload)
          break
        }
        case "slack": {
          const cfg = safeParseConfig<SlackConfig>(plainConfig)
          await sendSlack(cfg, payload)
          break
        }
      }
    })
  )
}

/**
 * Send a single test message to an alert channel.
 */
export async function sendTestAlert(channelId: string, workspaceId: string): Promise<void> {
  const channel = await db.query.alertChannels.findFirst({
    where: and(
      eq(alertChannels.id, channelId),
      eq(alertChannels.workspaceId, workspaceId),
    ),
  })
  if (!channel) throw new Error("Channel not found")

  const plainConfig = await decrypt(channel.encryptedConfig, aadFor.alertChannelConfig(channel.id))

  const testPayload: AlertPayload = {
    event: "deployment.running",
    deploymentId: "test-deployment-id",
    modelName: "Test Model",
    status: "running",
    message: "This is a test alert from LLMPanel. Your channel is configured correctly! 🎉",
  }

  switch (channel.platform) {
    case "telegram": {
      const cfg = safeParseConfig<TelegramConfig>(plainConfig)
      await sendTelegram(cfg, buildTelegramText(testPayload))
      break
    }
    case "discord": {
      const cfg = safeParseConfig<DiscordConfig>(plainConfig)
      await sendDiscord(cfg, testPayload)
      break
    }
    case "slack": {
      const cfg = safeParseConfig<SlackConfig>(plainConfig)
      await sendSlack(cfg, testPayload)
      break
    }
    default:
      throw new Error(`Unsupported platform: ${channel.platform}`)
  }
}

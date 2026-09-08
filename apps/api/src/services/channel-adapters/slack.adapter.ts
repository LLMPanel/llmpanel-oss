import { App } from "@slack/bolt"
import type { IChannelAdapter, IncomingMessage } from "./types"

const MAX_MESSAGE_LENGTH = 40000

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLen))
    remaining = remaining.slice(maxLen)
  }
  return chunks
}

export class SlackAdapter implements IChannelAdapter {
  platform = "slack" as const
  private app: App | null = null
  private connected = false
  private retryCount = 0
  private maxRetries = 5

  async connect(
    config: Record<string, string>,
    onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void> {
    const { botToken, appToken } = config
    if (!botToken) throw new Error("Slack botToken is required")
    if (!appToken) throw new Error("Slack appToken is required")

    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
    })

    this.app.message(async ({ message, say }) => {
      // Only handle user messages (not bot messages or subtypes)
      if (!("text" in message) || !message.text) return
      if ("bot_id" in message) return

      const msg: IncomingMessage = {
        platformUserId: "user" in message ? (message.user ?? "unknown") : "unknown",
        platformUsername: "user" in message ? (message.user ?? "unknown") : "unknown",
        text: message.text,
        channelId: message.channel,
        replyToMessageId: "thread_ts" in message ? message.thread_ts : undefined,
      }
      await onMessage(msg)
    })

    await this.startWithRetry()
  }

  private async startWithRetry(): Promise<void> {
    try {
      await this.app?.start()
      this.connected = true
      this.retryCount = 0
      console.log("[SlackAdapter] Bot started in socket mode")
    } catch (err) {
      this.connected = false
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
        console.log(`[SlackAdapter] Retrying in ${delay}ms (attempt ${this.retryCount})`)
        await new Promise((r) => setTimeout(r, delay))
        await this.startWithRetry()
      } else {
        throw new Error(`Slack connection failed after ${this.maxRetries} retries`)
      }
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.app) throw new Error("Slack app not connected")
    const chunks = chunkText(text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: chunk,
      })
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.app) {
      await this.app.stop()
      this.app = null
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}

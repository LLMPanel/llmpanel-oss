import { Client, GatewayIntentBits, Partials } from "discord.js"
import type { IChannelAdapter, IncomingMessage } from "./types"

const MAX_MESSAGE_LENGTH = 2000

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

export class DiscordAdapter implements IChannelAdapter {
  platform = "discord" as const
  private client: Client | null = null
  private connected = false
  private retryCount = 0
  private maxRetries = 5

  async connect(
    config: Record<string, string>,
    onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void> {
    const { botToken } = config
    if (!botToken) throw new Error("Discord botToken is required")

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    })

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot) return

      const msg: IncomingMessage = {
        platformUserId: message.author.id,
        platformUsername: message.author.username,
        text: message.content,
        channelId: message.channelId,
        replyToMessageId: message.reference?.messageId ?? undefined,
      }
      await onMessage(msg)
    })

    this.client.on("error", (err) => {
      console.error("[DiscordAdapter] Client error:", err.message)
    })

    await this.loginWithRetry(botToken)
  }

  private async loginWithRetry(token: string): Promise<void> {
    try {
      await this.client?.login(token)
      this.connected = true
      this.retryCount = 0
      console.log("[DiscordAdapter] Bot logged in")
    } catch (err) {
      this.connected = false
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
        console.log(`[DiscordAdapter] Retrying in ${delay}ms (attempt ${this.retryCount})`)
        await new Promise((r) => setTimeout(r, delay))
        await this.loginWithRetry(token)
      } else {
        throw new Error(`Discord connection failed after ${this.maxRetries} retries`)
      }
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.client) throw new Error("Discord client not connected")
    const channel = await this.client.channels.fetch(channelId)
    if (!channel || !("send" in channel)) throw new Error("Channel not found or not text-based")
    const chunks = chunkText(text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await (channel as { send: (content: string) => Promise<unknown> }).send(chunk)
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.client) {
      await this.client.destroy()
      this.client = null
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}

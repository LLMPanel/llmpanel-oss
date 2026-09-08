import { Bot } from "grammy"
import type { IChannelAdapter, IncomingMessage } from "./types"

const MAX_MESSAGE_LENGTH = 4096

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

export class TelegramAdapter implements IChannelAdapter {
  platform = "telegram" as const
  private bot: Bot | null = null
  private connected = false
  private retryCount = 0
  private maxRetries = 5

  async connect(
    config: Record<string, string>,
    onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void> {
    const { botToken } = config
    if (!botToken) throw new Error("Telegram botToken is required")

    this.bot = new Bot(botToken)

    this.bot.on("message:text", async (ctx) => {
      const msg: IncomingMessage = {
        platformUserId: String(ctx.from.id),
        platformUsername: ctx.from.username ?? ctx.from.first_name ?? "unknown",
        text: ctx.message.text,
        channelId: String(ctx.chat.id),
        replyToMessageId: ctx.message.reply_to_message
          ? String(ctx.message.reply_to_message.message_id)
          : undefined,
      }
      await onMessage(msg)
    })

    this.bot.catch((err) => {
      console.error("[TelegramAdapter] Bot error:", err.message)
    })

    // Validate the token before starting the long-poll loop; bot.start()
    // runs fire-and-forget, so without this an invalid token would still
    // report the channel as active.
    try {
      const me = await this.bot.api.getMe()
      console.log(`[TelegramAdapter] Authenticated as @${me.username}`)
    } catch (err) {
      this.bot = null
      const detail = err instanceof Error ? err.message : "unknown error"
      throw new Error(`Telegram token validation failed: ${detail}`)
    }

    await this.startWithRetry()
  }

  private async startWithRetry(): Promise<void> {
    try {
      this.connected = true
      this.retryCount = 0
      // bot.start() blocks — run in background
      void this.bot?.start({
        onStart: () => {
          console.log("[TelegramAdapter] Bot started polling")
        },
      })
    } catch (err) {
      this.connected = false
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
        console.log(`[TelegramAdapter] Retrying in ${delay}ms (attempt ${this.retryCount})`)
        await new Promise((r) => setTimeout(r, delay))
        await this.startWithRetry()
      } else {
        throw new Error(`Telegram connection failed after ${this.maxRetries} retries`)
      }
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram bot not connected")
    const chunks = chunkText(text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(Number(chatId), chunk)
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.bot) {
      await this.bot.stop()
      this.bot = null
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}

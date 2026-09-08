import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys"
import type { IChannelAdapter, IncomingMessage } from "./types"
import { join } from "path"

const MAX_MESSAGE_LENGTH = 65536

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

export class WhatsAppAdapter implements IChannelAdapter {
  platform = "whatsapp" as const
  private socket: WASocket | null = null
  private connected = false
  private retryCount = 0
  private maxRetries = 5
  private onMessageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null
  private sessionDir: string | null = null

  async connect(
    config: Record<string, string>,
    onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void> {
    this.onMessageHandler = onMessage
    const sessionId = config.sessionId ?? config.phoneNumber ?? "default"
    this.sessionDir = join(process.cwd(), ".whatsapp-sessions", sessionId)

    await this.connectWithRetry()
  }

  private async connectWithRetry(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir!)

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: true,
      })

      this.socket.ev.on("creds.update", saveCreds)

      this.socket.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "close") {
          this.connected = false
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })
            ?.output?.statusCode
          if (statusCode !== DisconnectReason.loggedOut && this.retryCount < this.maxRetries) {
            this.retryCount++
            const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
            console.log(`[WhatsAppAdapter] Reconnecting in ${delay}ms (attempt ${this.retryCount})`)
            setTimeout(() => {
              void this.connectWithRetry()
            }, delay)
          } else {
            console.error("[WhatsAppAdapter] Connection closed permanently")
          }
        } else if (connection === "open") {
          this.connected = true
          this.retryCount = 0
          console.log("[WhatsAppAdapter] Connected")
        }
      })

      this.socket.ev.on("messages.upsert", async ({ messages }) => {
        for (const m of messages) {
          if (m.key.fromMe) continue
          const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text
          if (!text) continue

          const msg: IncomingMessage = {
            platformUserId: m.key.remoteJid ?? "unknown",
            platformUsername: m.pushName ?? "unknown",
            text,
            channelId: m.key.remoteJid ?? undefined,
          }

          if (this.onMessageHandler) {
            await this.onMessageHandler(msg)
          }
        }
      })
    } catch (err) {
      this.connected = false
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
        console.log(`[WhatsAppAdapter] Retrying in ${delay}ms (attempt ${this.retryCount})`)
        await new Promise((r) => setTimeout(r, delay))
        await this.connectWithRetry()
      } else {
        throw new Error(`WhatsApp connection failed after ${this.maxRetries} retries`)
      }
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket) throw new Error("WhatsApp socket not connected")
    const chunks = chunkText(text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await this.socket.sendMessage(jid, { text: chunk })
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.socket) {
      this.socket.end(undefined)
      this.socket = null
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}

import { db } from "@llmpanel/db"
import { channelConnections, deployments, agents } from "@llmpanel/db/schema"
import { eq, and } from "drizzle-orm"
import { decrypt, aadFor } from "./encryption.service"
import { createChannelAdapter } from "./channel-adapters/factory"
import type { IChannelAdapter, IncomingMessage } from "./channel-adapters/types"
import {
  initMemory,
  searchMemories,
  addMemory,
  deleteUserMemories,
} from "./memory.service"
import {
  getConversationHistory,
  insertResetMarker,
  logExchange,
  type ChatMessage,
} from "./channel-history.service"
import { SlidingWindowLimiter } from "./rate-limiter"
import {
  resolveAgentTarget,
  runAgentLoop,
  type AgentRow,
} from "./agent-runtime.service"
import type { Memory } from "mem0ai/oss"

type ChannelRow = typeof channelConnections.$inferSelect

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

type GenerateResult =
  | { ok: true; content: string; totalTokens: number | null }
  | { ok: false; errorMessage: string }

interface ActiveChannel {
  adapter: IChannelAdapter
  memory: Memory | null
}

const RESET_COMMANDS = new Set(["/reset", "/clear"])
const REFUSAL_COOLDOWN_MS = 60 * 60 * 1000 // one polite refusal per user per hour

function parseAllowlist(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const entries = parsed.filter((v): v is string => typeof v === "string")
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase()
}

function isAllowed(channel: ChannelRow, msg: IncomingMessage): boolean {
  const allowlist = parseAllowlist(channel.allowlist)
  if (!allowlist) return true
  const candidates = [msg.platformUserId, msg.platformUsername]
    .filter(Boolean)
    .map(normalizeHandle)
  return allowlist.some((entry) => candidates.includes(normalizeHandle(entry)))
}

class ChannelManager {
  private channels = new Map<string, ActiveChannel>()
  private limiter = new SlidingWindowLimiter()
  // key = `${channelId}:${platformUserId}` → last refusal/throttle notice time
  private refusalNoticeAt = new Map<string, number>()
  private throttleNoticeAt = new Map<string, number>()

  async startChannel(channelId: string): Promise<void> {
    // Stop existing if running
    if (this.channels.has(channelId)) {
      await this.stopChannel(channelId)
    }

    const channel = await db.query.channelConnections.findFirst({
      where: and(
        eq(channelConnections.id, channelId),
        eq(channelConnections.isActive, true),
      ),
    })
    if (!channel) {
      console.error(`[ChannelManager] Channel ${channelId} not found or inactive`)
      return
    }

    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, channel.deploymentId),
    })
    const deploymentRunning =
      !!deployment && !!deployment.endpoint && deployment.status === "running"

    // Direct mode needs the local deployment; agent mode resolves its own
    // target per message (which may be an external openai-compatible provider).
    if (!channel.agentId && !deploymentRunning) {
      await db.update(channelConnections)
        .set({ status: "error", statusMessage: "Deployment not running" })
        .where(eq(channelConnections.id, channelId))
      return
    }

    let config: Record<string, string>
    try {
      const decrypted = await decrypt(channel.encryptedConfig, aadFor.channelConnectionConfig(channel.id))
      config = JSON.parse(decrypted) as Record<string, string>
    } catch {
      await db.update(channelConnections)
        .set({ status: "error", statusMessage: "Failed to decrypt config" })
        .where(eq(channelConnections.id, channelId))
      return
    }

    const adapter = createChannelAdapter(channel.platform)

    // mem0 needs the local deployment endpoint; degrade gracefully without it.
    let memory: Memory | null = null
    if (channel.memoryEnabled) {
      if (deploymentRunning && deployment.endpoint) {
        try {
          memory = initMemory(deployment.endpoint)
        } catch (err) {
          console.error(`[ChannelManager] Memory init failed for ${channelId}:`, err)
        }
      } else {
        console.warn(
          `[ChannelManager] Memory enabled but deployment not running for ${channelId}; continuing without memory`
        )
      }
    }

    const onMessage = (msg: IncomingMessage): Promise<void> =>
      this.handleIncoming(channelId, adapter, memory, msg)

    try {
      await adapter.connect(config, onMessage)
      this.channels.set(channelId, { adapter, memory })
      await db.update(channelConnections)
        .set({ status: "active", statusMessage: null, connectedAt: new Date() })
        .where(eq(channelConnections.id, channelId))
      console.log(`[ChannelManager] Channel ${channelId} (${channel.platform}) started`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed"
      await db.update(channelConnections)
        .set({ status: "error", statusMessage: message })
        .where(eq(channelConnections.id, channelId))
      console.error(`[ChannelManager] Failed to start channel ${channelId}:`, message)
    }
  }

  // ── Per-message pipeline ──────────────────────────────────────────────
  // Behavior config (agent binding, prompts, history, access control) is
  // read fresh from the DB each message so settings edits apply instantly.
  private async handleIncoming(
    channelId: string,
    adapter: IChannelAdapter,
    memory: Memory | null,
    msg: IncomingMessage
  ): Promise<void> {
    const receivedAt = new Date()
    try {
      const channel = await db.query.channelConnections.findFirst({
        where: and(
          eq(channelConnections.id, channelId),
          eq(channelConnections.isActive, true),
        ),
      })
      if (!channel) return

      const replyTarget = msg.channelId ?? msg.platformUserId
      const userKey = `${channelId}:${msg.platformUserId}`

      // 1. Allowlist — polite refusal at most once per user per hour, else silent
      if (!isAllowed(channel, msg)) {
        const last = this.refusalNoticeAt.get(userKey) ?? 0
        if (Date.now() - last > REFUSAL_COOLDOWN_MS) {
          this.refusalNoticeAt.set(userKey, Date.now())
          await adapter.sendMessage(replyTarget, "Sorry, you're not authorized to use this bot.")
        }
        return
      }

      // 2. Rate limit — throttle notice at most once per window
      if (channel.rateLimitPerMinute != null && channel.rateLimitPerMinute > 0) {
        if (!this.limiter.allow(userKey, channel.rateLimitPerMinute)) {
          const last = this.throttleNoticeAt.get(userKey) ?? 0
          if (Date.now() - last > 60_000) {
            this.throttleNoticeAt.set(userKey, Date.now())
            await adapter.sendMessage(
              replyTarget,
              "You're sending messages too quickly. Please try again in a minute."
            )
          }
          return
        }
      }

      // 3. /reset | /clear command
      if (RESET_COMMANDS.has(msg.text.trim().toLowerCase())) {
        await insertResetMarker(channelId, msg.platformUserId, msg.platformUsername ?? null)
        if (memory) {
          await deleteUserMemories(memory, userKey)
        }
        await adapter.sendMessage(replyTarget, "Conversation context cleared.")
        return
      }

      // 4. Build messages: system prompt (+mem0 context) + history + user msg
      const agent = channel.agentId
        ? await db.query.agents.findFirst({
            where: and(eq(agents.id, channel.agentId), eq(agents.isActive, true)),
          })
        : undefined

      let memoryContext = ""
      if (memory) {
        const memories = await searchMemories(memory, userKey, msg.text)
        if (memories.length > 0) {
          memoryContext = `\n\nRelevant context from previous conversations:\n${memories.join("\n")}`
        }
      }

      // Agent mode uses the agent's own system prompt; the channel prompt
      // only applies in direct mode.
      const basePrompt = agent ? agent.systemPrompt : channel.systemPrompt
      const messages: ChatMessage[] = []
      if (basePrompt) {
        messages.push({ role: "system", content: basePrompt + memoryContext })
      } else if (memoryContext) {
        messages.push({ role: "system", content: `You are a helpful assistant.${memoryContext}` })
      }

      if (channel.historyEnabled) {
        const history = await getConversationHistory(
          channelId,
          msg.platformUserId,
          channel.historyLimit
        )
        messages.push(...history)
      }
      messages.push({ role: "user", content: msg.text })

      // 5. Generate
      const result = agent
        ? await this.generateViaAgent(agent, messages)
        : await this.generateDirect(channel, messages)

      if (!result.ok) {
        console.error(`[ChannelManager] Generation failed for ${channelId}: ${result.errorMessage}`)
        await adapter.sendMessage(
          replyTarget,
          "Sorry, I'm having trouble generating a response right now."
        )
        return
      }

      // 6. Reply, remember, log
      await adapter.sendMessage(replyTarget, result.content)

      if (memory) {
        void addMemory(memory, userKey, [
          { role: "user", content: msg.text },
          { role: "assistant", content: result.content },
        ])
      }

      await logExchange({
        channelConnectionId: channelId,
        platformUserId: msg.platformUserId,
        platformUsername: msg.platformUsername ?? null,
        userText: msg.text,
        assistantText: result.content,
        totalTokens: result.totalTokens,
        receivedAt,
      })
    } catch (err) {
      console.error(`[ChannelManager] Message handler error:`, err)
    }
  }

  /** Agent mode: run the server-side agent loop (RAG tools, sampling config). */
  private async generateViaAgent(
    agent: AgentRow,
    messages: ChatMessage[]
  ): Promise<GenerateResult> {
    const resolved = await resolveAgentTarget(agent)
    if (!resolved.ok) {
      return { ok: false, errorMessage: resolved.message }
    }
    const result = await runAgentLoop({
      agent,
      target: resolved.target,
      body: { messages },
      defaultModel: resolved.defaultModel,
    })
    if (!result.ok) {
      return {
        ok: false,
        errorMessage: `Agent loop failed (${result.status}): ${JSON.stringify(result.errorBody)}`,
      }
    }
    return {
      ok: true,
      content: result.content || "No response generated.",
      totalTokens: result.usage.total_tokens || null,
    }
  }

  /** Direct mode: call the deployment endpoint, re-read per message so a
   *  restarted deployment (new port) keeps working. */
  private async generateDirect(
    channel: ChannelRow,
    messages: ChatMessage[]
  ): Promise<GenerateResult> {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, channel.deploymentId),
    })
    if (!deployment || !deployment.endpoint || deployment.status !== "running") {
      return { ok: false, errorMessage: "Deployment not running" }
    }

    const response = await fetch(`${deployment.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    if (!response.ok) {
      return { ok: false, errorMessage: `LLM request failed: ${response.status}` }
    }

    const data = (await response.json()) as ChatCompletionResponse
    return {
      ok: true,
      content: data.choices?.[0]?.message?.content ?? "No response generated.",
      totalTokens: data.usage?.total_tokens ?? null,
    }
  }

  async stopChannel(
    channelId: string,
    opts?: {
      /** Keep the DB status untouched (process shutdown) so startAllActive
       *  can restore the channel on the next boot. */
      preserveStatus?: boolean
    }
  ): Promise<void> {
    const active = this.channels.get(channelId)
    if (active) {
      try {
        await active.adapter.disconnect()
      } catch (err) {
        console.error(`[ChannelManager] Error disconnecting ${channelId}:`, err)
      }
      this.channels.delete(channelId)
    }
    this.limiter.clearPrefix(`${channelId}:`)
    for (const map of [this.refusalNoticeAt, this.throttleNoticeAt]) {
      for (const key of map.keys()) {
        if (key.startsWith(`${channelId}:`)) map.delete(key)
      }
    }
    if (!opts?.preserveStatus) {
      await db.update(channelConnections)
        .set({ status: "pending", statusMessage: null })
        .where(eq(channelConnections.id, channelId))
    }
    console.log(`[ChannelManager] Channel ${channelId} stopped`)
  }

  async restartChannel(channelId: string): Promise<void> {
    await this.stopChannel(channelId)
    await this.startChannel(channelId)
  }

  async startAllActive(): Promise<void> {
    const activeChannels = await db.query.channelConnections.findMany({
      where: and(
        eq(channelConnections.isActive, true),
        eq(channelConnections.status, "active"),
      ),
    })

    console.log(`[ChannelManager] Starting ${activeChannels.length} active channels`)

    for (const ch of activeChannels) {
      // Fire and forget — don't block boot on individual channels
      void this.startChannel(ch.id).catch((err) => {
        console.error(`[ChannelManager] Failed to auto-start channel ${ch.id}:`, err)
      })
    }
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.channels.keys())
    console.log(`[ChannelManager] Stopping ${ids.length} channels`)
    // Preserve status so startAllActive restores these channels on next boot
    await Promise.allSettled(ids.map((id) => this.stopChannel(id, { preserveStatus: true })))
  }

  isChannelRunning(channelId: string): boolean {
    const active = this.channels.get(channelId)
    return active?.adapter.isConnected() ?? false
  }

  getActiveCount(): number {
    return this.channels.size
  }
}

export const channelManager = new ChannelManager()

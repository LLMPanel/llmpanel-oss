// ─────────────────────────────────────────────────────────────────────────────
// Shared types, storage helpers and small utilities for the deployment chat.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant" | "system"

/** Per-message performance metrics captured while streaming. */
export interface MessageStats {
  /** Time-to-first-token, ms. */
  ttftMs?: number
  /** Total wall-clock time from request start to completion, ms. */
  totalMs?: number
  /** Output (completion) tokens. */
  tokens?: number
  /** Prompt tokens (from the engine's usage payload, when available). */
  promptTokens?: number
  /** Decode throughput, tokens/second. */
  tokensPerSec?: number
  /** True when token counts are client-side estimates, not engine-reported. */
  estimated?: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  /** Assistant-only: the model that produced this reply. */
  model?: string
  /** Assistant-only: performance metrics. */
  stats?: MessageStats
  /** Assistant-only: set when generation failed. */
  error?: boolean
}

export interface ChatSettings {
  systemPrompt: string
  temperature: number
  maxTokens: number
  topP: number
}

export interface ChatSession {
  id: string
  title: string
  deploymentId: string
  messages: ChatMessage[]
  settings: ChatSettings
  createdAt: string
  updatedAt: string
}

// ── defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
}

// ── ids ────────────────────────────────────────────────────────────────────────

/**
 * `crypto.randomUUID()` only exists in secure contexts. When the dashboard is
 * opened over a plain-HTTP LAN address (e.g. http://192.168.x.x:3000) it is
 * `undefined` and calling it throws — which would abort message creation before
 * anything renders. Fall back to a non-cryptographic id in that case.
 */
export function safeUUID(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ── token estimation ──────────────────────────────────────────────────────────

/**
 * Rough token estimate used as a fallback when the engine does not report
 * usage. ~4 characters per token is the widely-used heuristic for English.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/** Estimate the total prompt tokens for a set of messages. */
export function estimateConversationTokens(
  messages: Pick<ChatMessage, "content">[],
  systemPrompt = "",
): number {
  const base = systemPrompt ? estimateTokens(systemPrompt) : 0
  // +4 tokens/message roughly accounts for role/formatting overhead.
  return messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + 4,
    base,
  )
}

/**
 * Best-effort context window (in tokens) for a model family. Deployments don't
 * carry a context length, so we map common families and fall back sensibly.
 */
export function contextWindowFor(family?: string | null): number {
  if (!family) return 8192
  const f = family.toLowerCase()
  if (f.includes("qwen")) return 32768
  if (f.includes("llama")) return 8192
  if (f.includes("mistral") || f.includes("mixtral")) return 32768
  if (f.includes("phi")) return 16384
  if (f.includes("gemma")) return 8192
  if (f.includes("deepseek")) return 32768
  if (f.includes("yi")) return 32768
  return 8192
}

// ── reasoning ─────────────────────────────────────────────────────────────────

/** A reply split into the model's thinking and its answer. */
export interface ReplyParts {
  /** The text inside <think>…</think>, or null when the model did not think. */
  thinking: string | null
  /** True until the closing </think> arrives. */
  stillThinking: boolean
  answer: string
}

const THINK_OPEN = "<think>"
const THINK_CLOSE = "</think>"

/**
 * Thinking models (Qwen3, DeepSeek-R1, …) stream their reasoning inline as
 * `<think>…</think>`: llama.cpp runs with `--reasoning-format none`, and vLLM
 * does the same without a reasoning parser. Some chat templates open the block
 * in the prompt, so the reply carries only the closing tag.
 */
export function splitThinking(content: string): ReplyParts {
  const head = content.trimStart()
  // Mid-stream, "<thi" is the start of a tag, not an answer.
  if (head && THINK_OPEN.startsWith(head)) {
    return { thinking: "", stillThinking: true, answer: "" }
  }

  const opened = head.startsWith(THINK_OPEN)
  const start = opened ? content.indexOf(THINK_OPEN) + THINK_OPEN.length : 0
  const close = content.indexOf(THINK_CLOSE, start)
  if (close === -1) {
    return opened
      ? { thinking: content.slice(start).trim(), stillThinking: true, answer: "" }
      : { thinking: null, stillThinking: false, answer: content }
  }
  return {
    thinking: content.slice(start, close).trim(),
    stillThinking: false,
    answer: content.slice(close + THINK_CLOSE.length).trimStart(),
  }
}

// ── formatting ────────────────────────────────────────────────────────────────

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${Math.round(n)}`
}

export function formatDuration(ms?: number): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ── localStorage ───────────────────────────────────────────────────────────────

const SESSIONS_KEY = "llmpanel_chat_sessions"
const SETTINGS_KEY = "llmpanel_chat_default_settings"

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return []
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(SESSIONS_KEY) ?? "[]",
    ) as ChatSession[]
    // Backfill fields for sessions saved by older versions of the page.
    return raw.map((s) => ({
      ...s,
      settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) },
      messages: (s.messages ?? []).map((m) => ({
        id: m.id ?? safeUUID(),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ?? s.updatedAt ?? new Date().toISOString(),
        model: m.model,
        stats: m.stats,
        error: m.error,
      })),
    }))
  } catch {
    return []
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // storage full / disabled — best effort
  }
}

export function loadDefaultSettings(): ChatSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(
        window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
      ) as Partial<ChatSettings>),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveDefaultSettings(settings: ChatSettings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // best effort
  }
}

// ── export ─────────────────────────────────────────────────────────────────────

export function sessionToMarkdown(session: ChatSession): string {
  const lines: string[] = [`# ${session.title}`, ""]
  if (session.settings.systemPrompt.trim()) {
    lines.push(`> **System:** ${session.settings.systemPrompt}`, "")
  }
  for (const m of session.messages) {
    if (m.role === "system") continue
    lines.push(m.role === "user" ? "### 🧑 User" : "### 🤖 Assistant")
    lines.push("", m.content, "")
  }
  return lines.join("\n")
}

export function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

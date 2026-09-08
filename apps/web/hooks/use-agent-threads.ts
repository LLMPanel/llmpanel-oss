"use client"

import { useCallback, useEffect, useState } from "react"

// ── types ────────────────────────────────────────────────────────────────────

export type AgentMessageRole = "system" | "user" | "assistant" | "tool"

export interface AgentThread {
  id: string
  agentId: string
  userId: string
  title: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentThreadMessage {
  id: string
  threadId: string
  role: AgentMessageRole
  content: string | null
  toolCalls: string | null
  toolCallId: string | null
  toolName: string | null
  promptTokens: number | null
  completionTokens: number | null
  createdAt: string
}

/** Live tool call streamed while the agent thinks. */
export interface AgentStepEvent {
  tool: string
  arguments: string
  result: string
  durationMs: number
}

/** Chunk of the final assistant answer. */
export interface AgentDeltaEvent {
  content: string
}

export interface AgentUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface AgentDoneEvent {
  message: AgentThreadMessage
  usage: AgentUsage
  toolsDegraded: boolean
  steps: number
}

export interface AgentErrorEvent {
  message: string
}

export interface SendThreadHandlers {
  onStep: (event: AgentStepEvent) => void
  onDelta: (event: AgentDeltaEvent) => void
  onDone: (event: AgentDoneEvent) => void
  onError: (event: AgentErrorEvent) => void
}

const base = (deploymentId: string, agentId: string) =>
  `/api/v1/deployments/${deploymentId}/agents/${agentId}/threads`

// ── thread list ──────────────────────────────────────────────────────────────

export function useAgentThreads(deploymentId: string, agentId: string) {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(base(deploymentId, agentId), {
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch threads")
      }
      const data = (await res.json()) as { threads: AgentThread[] }
      setThreads(data.threads)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, agentId])

  useEffect(() => {
    void load()
  }, [load])

  const createThread = useCallback(
    async (title?: string): Promise<AgentThread> => {
      const res = await globalThis.fetch(base(deploymentId, agentId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title ? { title } : {}),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to create thread")
      }
      const data = (await res.json()) as { thread: AgentThread }
      setThreads((prev) => [data.thread, ...prev])
      return data.thread
    },
    [deploymentId, agentId],
  )

  const removeThread = useCallback(
    async (threadId: string): Promise<void> => {
      const res = await globalThis.fetch(
        `${base(deploymentId, agentId)}/${threadId}`,
        { method: "DELETE", credentials: "include" },
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to delete thread")
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
    },
    [deploymentId, agentId],
  )

  return { threads, isLoading, error, refetch: load, createThread, removeThread }
}

// ── thread messages ────────────────────────────────────────────────────────

export function useThreadMessages(
  deploymentId: string,
  agentId: string,
  threadId: string | null,
) {
  const [messages, setMessages] = useState<AgentThreadMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (id: string | null = threadId): Promise<void> => {
      if (!id) {
        setMessages([])
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const res = await globalThis.fetch(
          `${base(deploymentId, agentId)}/${id}/messages`,
          { credentials: "include" },
        )
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? "Failed to fetch messages")
        }
        const data = (await res.json()) as { messages: AgentThreadMessage[] }
        setMessages(data.messages)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    },
    [deploymentId, agentId, threadId],
  )

  useEffect(() => {
    void load(threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId, agentId, threadId])

  return { messages, isLoading, error, refetch: load }
}

// ── SSE send ───────────────────────────────────────────────────────────────

/**
 * POSTs a user message and parses the resulting `text/event-stream`.
 * EventSource can't POST, so we read the fetch ReadableStream by hand:
 * buffer on "\n\n", track the current `event:` name, JSON.parse each `data:`.
 * The server persists the user message — callers must not create it separately.
 */
export async function sendThreadMessage(
  deploymentId: string,
  agentId: string,
  threadId: string,
  content: string,
  handlers: SendThreadHandlers,
  signal: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await globalThis.fetch(
      `${base(deploymentId, agentId)}/${threadId}/messages`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal,
      },
    )
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    handlers.onError({
      message: (err as Error).message || "Failed to reach the agent",
    })
    return
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // response body wasn't JSON — keep the status message
    }
    handlers.onError({ message })
    return
  }

  if (!res.body) {
    handlers.onError({ message: "The agent returned an empty response." })
    return
  }

  const dispatch = (frame: string) => {
    let eventName = "message"
    const dataLines: string[] = []
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""))
      }
    }
    if (dataLines.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(dataLines.join("\n"))
    } catch {
      return // skip malformed frame
    }
    switch (eventName) {
      case "step":
        handlers.onStep(parsed as AgentStepEvent)
        break
      case "delta":
        handlers.onDelta(parsed as AgentDeltaEvent)
        break
      case "done":
        handlers.onDone(parsed as AgentDoneEvent)
        break
      case "error":
        handlers.onError(parsed as AgentErrorEvent)
        break
      default:
        break
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (frame.trim()) dispatch(frame)
      }
    }
    if (buffer.trim()) dispatch(buffer)
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    handlers.onError({
      message: (err as Error).message || "Stream interrupted",
    })
  }
}

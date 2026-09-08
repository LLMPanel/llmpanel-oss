"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Deployment } from "@/hooks/use-deployments"
import {
  DEFAULT_SETTINGS,
  estimateTokens,
  loadDefaultSettings,
  loadSessions,
  safeUUID,
  saveDefaultSettings,
  saveSessions,
  type ChatMessage,
  type ChatSession,
  type ChatSettings,
} from "@/lib/chat"

export interface LiveStats {
  /** performance.now() timestamp when the request started. */
  startedAt: number
  ttftMs?: number
  tokens: number
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function newMessage(
  role: ChatMessage["role"],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: safeUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

export function useChat(
  deployments: Deployment[],
  // When provided, the chat is locked to a single deployment (the one in the
  // route). We skip the "pick any running model" behaviour and only surface
  // sessions belonging to this deployment.
  forcedDeploymentId?: string,
) {
  const runningDeployments = useMemo(
    () => deployments.filter((d) => d.status === "running"),
    [deployments],
  )

  const [allSessions, setAllSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>(
    forcedDeploymentId ?? "",
  )

  // When locked to a route deployment, only expose that deployment's sessions.
  const sessions = useMemo(
    () =>
      forcedDeploymentId
        ? allSessions.filter((s) => s.deploymentId === forcedDeploymentId)
        : allSessions,
    [allSessions, forcedDeploymentId],
  )
  // internal alias so the rest of the hook keeps operating on the full list
  const setSessions = setAllSessions
  const [draftSettings, setDraftSettings] =
    useState<ChatSettings>(DEFAULT_SETTINGS)
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const sessionsRef = useRef<ChatSession[]>([])
  sessionsRef.current = sessions

  // ── bootstrap from storage ──────────────────────────────────────────────
  useEffect(() => {
    setSessions(loadSessions())
    setDraftSettings(loadDefaultSettings())
  }, [])

  // ── deployment selection ────────────────────────────────────────────────
  useEffect(() => {
    // Locked mode: always pin to the route deployment.
    if (forcedDeploymentId) {
      setSelectedDeploymentId(forcedDeploymentId)
      return
    }
    // Free mode: auto-select the first running deployment.
    if (!selectedDeploymentId && runningDeployments.length > 0) {
      setSelectedDeploymentId(runningDeployments[0].id)
    }
  }, [forcedDeploymentId, runningDeployments, selectedDeploymentId])

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) ?? null
  const messages = currentSession?.messages ?? []
  const settings = currentSession?.settings ?? draftSettings

  const selectedDeployment = useMemo(
    () => deployments.find((d) => d.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId],
  )
  const modelName =
    selectedDeployment?.model?.name ??
    selectedDeployment?.huggingfaceId ??
    "model"

  // ── persistence helper ──────────────────────────────────────────────────
  const commit = useCallback(
    (updater: (prev: ChatSession[]) => ChatSession[]) => {
      setSessions((prev) => {
        const next = updater(prev)
        saveSessions(next)
        return next
      })
    },
    [],
  )

  const patchMessage = useCallback(
    (
      sessionId: string,
      messageId: string,
      patch: Partial<ChatMessage>,
      // Skip the localStorage write for per-token streaming updates; the final
      // patch persists the whole message. Avoids thrashing storage mid-stream.
      persist = true,
    ) => {
      const updater = (prev: ChatSession[]) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                updatedAt: new Date().toISOString(),
                messages: s.messages.map((m) =>
                  m.id === messageId ? { ...m, ...patch } : m,
                ),
              }
            : s,
        )
      if (persist) commit(updater)
      else setSessions(updater)
    },
    [commit],
  )

  // ── settings ─────────────────────────────────────────────────────────────
  const updateSettings = useCallback(
    (patch: Partial<ChatSettings>) => {
      if (currentSessionId) {
        commit((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, settings: { ...s.settings, ...patch } }
              : s,
          ),
        )
      } else {
        setDraftSettings((prev) => {
          const next = { ...prev, ...patch }
          saveDefaultSettings(next)
          return next
        })
      }
    },
    [currentSessionId, commit],
  )

  // ── core streaming routine ────────────────────────────────────────────────
  // Streams a completion for `baseMessages` (which must end on a user turn)
  // into a fresh assistant placeholder, measuring TTFT / tokens / throughput.
  const runGeneration = useCallback(
    async (
      sessionId: string,
      baseMessages: ChatMessage[],
      sessionSettings: ChatSettings,
      deploymentId: string,
    ) => {
      const assistant = newMessage("assistant", "", { model: modelName })

      commit((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                updatedAt: new Date().toISOString(),
                messages: [...baseMessages, assistant],
              }
            : s,
        ),
      )

      const history = baseMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }))

      const ctrl = new AbortController()
      abortRef.current = ctrl
      setIsStreaming(true)

      const startedAt = now()
      setLiveStats({ startedAt, tokens: 0 })

      let accumulated = ""
      let firstTokenAt: number | undefined
      let usage:
        | { prompt_tokens?: number; completion_tokens?: number }
        | undefined

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            deploymentId,
            messages: history,
            stream: true,
            system: sessionSettings.systemPrompt || undefined,
            temperature: sessionSettings.temperature,
            max_tokens: sessionSettings.maxTokens,
            top_p: sessionSettings.topP,
          }),
        })

        if (!res.ok) {
          const info = (await res
            .json()
            .catch(() => ({}))) as { error?: string; detail?: string }
          throw new Error(
            info.error ??
              info.detail ??
              `Request failed with status ${res.status}`,
          )
        }
        if (!res.body) throw new Error("The model returned an empty response.")

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? "" // keep incomplete trailing line

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const data = trimmed.slice(5).trim()
            if (!data || data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[]
                usage?: { prompt_tokens?: number; completion_tokens?: number }
              }
              if (parsed.usage) usage = parsed.usage

              const delta = parsed.choices?.[0]?.delta?.content ?? ""
              if (!delta) continue

              if (firstTokenAt === undefined) {
                firstTokenAt = now()
                setLiveStats((s) =>
                  s ? { ...s, ttftMs: firstTokenAt! - s.startedAt } : s,
                )
              }
              accumulated += delta
              setLiveStats((s) =>
                s ? { ...s, tokens: estimateTokens(accumulated) } : s,
              )
              patchMessage(
                sessionId,
                assistant.id,
                { content: accumulated },
                false, // stream update — persist only on finalize
              )
            } catch {
              // skip malformed chunk
            }
          }
        }

        // finalize metrics
        const end = now()
        const totalMs = end - startedAt
        const ttftMs =
          firstTokenAt !== undefined ? firstTokenAt - startedAt : undefined
        const outputTokens =
          usage?.completion_tokens ?? estimateTokens(accumulated)
        const decodeMs =
          firstTokenAt !== undefined ? end - firstTokenAt : totalMs
        const tokensPerSec =
          decodeMs > 0 ? outputTokens / (decodeMs / 1000) : 0

        patchMessage(sessionId, assistant.id, {
          content: accumulated,
          stats: {
            ttftMs,
            totalMs,
            tokens: outputTokens,
            promptTokens: usage?.prompt_tokens,
            tokensPerSec,
            estimated: usage?.completion_tokens == null,
          },
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const reason = (err as Error).message || "Unknown error"
          patchMessage(sessionId, assistant.id, {
            content: accumulated
              ? `${accumulated}\n\n⚠️ Generation interrupted: ${reason}`
              : `⚠️ **Couldn't get a response.**\n\n${reason}`,
            error: true,
          })
        } else if (accumulated) {
          // keep whatever streamed before the user hit stop
          patchMessage(sessionId, assistant.id, { content: accumulated })
        } else {
          // remove the empty placeholder on an immediate abort
          commit((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.filter((m) => m.id !== assistant.id),
                  }
                : s,
            ),
          )
        }
      } finally {
        setIsStreaming(false)
        setLiveStats(null)
        abortRef.current = null
      }
    },
    [commit, patchMessage, modelName],
  )

  // ── public actions ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || !selectedDeploymentId || isStreaming) return
    setInput("")

    const userMsg = newMessage("user", text)
    let sessionId = currentSessionId
    let sessionSettings = settings
    let baseMessages: ChatMessage[]

    if (!sessionId) {
      sessionId = safeUUID()
      sessionSettings = draftSettings
      const session: ChatSession = {
        id: sessionId,
        title: text.slice(0, 60),
        deploymentId: selectedDeploymentId,
        messages: [userMsg],
        settings: draftSettings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      commit((prev) => [session, ...prev])
      setCurrentSessionId(sessionId)
      baseMessages = [userMsg]
    } else {
      const existing = sessionsRef.current.find((s) => s.id === sessionId)
      baseMessages = [...(existing?.messages ?? []), userMsg]
      sessionSettings = existing?.settings ?? settings
    }

    await runGeneration(
      sessionId,
      baseMessages,
      sessionSettings,
      selectedDeploymentId,
    )
  }, [
    input,
    selectedDeploymentId,
    isStreaming,
    currentSessionId,
    settings,
    draftSettings,
    commit,
    runGeneration,
  ])

  const regenerate = useCallback(async () => {
    if (isStreaming || !currentSessionId) return
    const session = sessionsRef.current.find((s) => s.id === currentSessionId)
    if (!session) return
    // Drop trailing assistant messages back to the last user turn.
    let cut = session.messages.length
    while (cut > 0 && session.messages[cut - 1].role !== "user") cut--
    if (cut === 0) return
    const baseMessages = session.messages.slice(0, cut)
    await runGeneration(
      session.id,
      baseMessages,
      session.settings,
      session.deploymentId || selectedDeploymentId,
    )
  }, [isStreaming, currentSessionId, selectedDeploymentId, runGeneration])

  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      if (isStreaming || !currentSessionId) return
      const text = newContent.trim()
      if (!text) return
      const session = sessionsRef.current.find(
        (s) => s.id === currentSessionId,
      )
      if (!session) return
      const idx = session.messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return
      const edited: ChatMessage = {
        ...session.messages[idx],
        content: text,
        createdAt: new Date().toISOString(),
      }
      const baseMessages = [...session.messages.slice(0, idx), edited]
      await runGeneration(
        session.id,
        baseMessages,
        session.settings,
        session.deploymentId || selectedDeploymentId,
      )
    },
    [isStreaming, currentSessionId, selectedDeploymentId, runGeneration],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const selectSession = useCallback((session: ChatSession) => {
    setCurrentSessionId(session.id)
    setSelectedDeploymentId(session.deploymentId)
  }, [])

  const newSession = useCallback(() => {
    setCurrentSessionId(null)
    setInput("")
    setDraftSettings(loadDefaultSettings())
  }, [])

  const deleteSession = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((s) => s.id !== id))
      if (currentSessionId === id) setCurrentSessionId(null)
    },
    [commit, currentSessionId],
  )

  const clearSessions = useCallback(() => {
    // Remove every conversation in the current scope. When locked to a route
    // deployment, only that deployment's sessions are wiped.
    commit((prev) =>
      forcedDeploymentId
        ? prev.filter((s) => s.deploymentId !== forcedDeploymentId)
        : [],
    )
    setCurrentSessionId(null)
  }, [commit, forcedDeploymentId])

  const clearMessages = useCallback(() => {
    if (!currentSessionId) return
    commit((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, messages: [], updatedAt: new Date().toISOString() }
          : s,
      ),
    )
  }, [commit, currentSessionId])

  return {
    // data
    sessions,
    currentSession,
    currentSessionId,
    messages,
    settings,
    runningDeployments,
    selectedDeployment,
    selectedDeploymentId,
    modelName,
    isStreaming,
    liveStats,
    input,
    // setters / actions
    setInput,
    setSelectedDeploymentId,
    updateSettings,
    sendMessage,
    regenerate,
    editAndResend,
    stop,
    selectSession,
    newSession,
    deleteSession,
    clearSessions,
    clearMessages,
  }
}

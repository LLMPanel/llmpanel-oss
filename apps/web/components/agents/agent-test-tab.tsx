"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BookText,
  PanelLeft,
  SendHorizonal,
  Sparkles,
  Square,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container"
import { ScrollButton } from "@/components/ui/scroll-button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { agentModelLabel } from "@/components/agents/agent-shared"
import { AgentTestSidebar } from "@/components/agents/agent-test-sidebar"
import {
  AssistantBubble,
  ErrorBubble,
  ThinkingIndicator,
  ToolStepRow,
  UserBubble,
  stepFromEvent,
  stepFromMessage,
  type AssistantMeta,
  type ToolStep,
} from "@/components/agents/agent-test-messages"
import {
  sendThreadMessage,
  useAgentThreads,
  useThreadMessages,
} from "@/hooks/use-agent-threads"
import { useDeployments } from "@/hooks/use-deployments"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"

interface PendingTurn {
  threadId: string
  userContent: string
  steps: ToolStep[]
  assistantText: string
  error: string | null
}

export function AgentTestTab({ agent }: { agent: DeploymentAgent }) {
  const deploymentId = agent.deploymentId
  const agentId = agent.id

  const { deployments } = useDeployments()
  const {
    threads,
    isLoading: threadsLoading,
    refetch: refetchThreads,
    createThread,
    removeThread,
  } = useAgentThreads(deploymentId, agentId)

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const { messages, refetch: refetchMessages } = useThreadMessages(
    deploymentId,
    agentId,
    activeThreadId,
  )

  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [metaById, setMetaById] = useState<Record<string, AssistantMeta>>({})
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  // Read by the stream callbacks, which outlive the render they started in.
  const activeThreadIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  const hasKnowledge = agent.toolsEnabled.includes("knowledge_search")
  const modelLabel = agentModelLabel(agent, deployments)

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const runSend = useCallback(
    async (threadId: string, content: string) => {
      setPending({ threadId, userContent: content, steps: [], assistantText: "", error: null })
      setIsStreaming(true)

      const ctrl = new AbortController()
      abortRef.current = ctrl

      await sendThreadMessage(
        deploymentId,
        agentId,
        threadId,
        content,
        {
          onStep: (event) =>
            setPending((p) =>
              p ? { ...p, steps: [...p.steps, stepFromEvent(event)] } : p,
            ),
          onDelta: (event) =>
            setPending((p) =>
              p ? { ...p, assistantText: p.assistantText + event.content } : p,
            ),
          onDone: (event) => {
            setMetaById((m) => ({
              ...m,
              [event.message.id]: {
                promptTokens: event.usage.prompt_tokens,
                completionTokens: event.usage.completion_tokens,
                totalTokens: event.usage.total_tokens,
                toolsDegraded: event.toolsDegraded,
                steps: event.steps,
              },
            }))
            // Swap the optimistic pending turn for the canonical persisted
            // messages, and refresh the thread list so the auto-title shows.
            void (async () => {
              await refetchMessages(threadId)
              void refetchThreads()
              setPending((p) => (p && p.threadId === threadId ? null : p))
            })()
          },
          onError: (event) =>
            setPending((p) =>
              p ? { ...p, error: event.message } : p,
            ),
        },
        ctrl.signal,
      )

      if (abortRef.current === ctrl) abortRef.current = null
      setIsStreaming(false)
    },
    [deploymentId, agentId, refetchMessages, refetchThreads],
  )

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput("")

    let threadId = activeThreadIdRef.current
    if (!threadId) {
      try {
        const thread = await createThread()
        threadId = thread.id
        setActiveThreadId(thread.id)
      } catch {
        setPending({
          threadId: "",
          userContent: content,
          steps: [],
          assistantText: "",
          error: "Couldn't start a new conversation. Please try again.",
        })
        return
      }
    }
    await runSend(threadId, content)
  }, [input, isStreaming, createThread, runSend])

  const retry = useCallback(() => {
    if (!pending || isStreaming) return
    const { threadId, userContent } = pending
    if (!threadId) {
      setInput(userContent)
      setPending(null)
      return
    }
    void runSend(threadId, userContent)
  }, [pending, isStreaming, runSend])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    setPending(null)
  }, [])

  const switchThread = useCallback((threadId: string | null) => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    setPending(null)
    setActiveThreadId(threadId)
    setMobileSidebarOpen(false)
  }, [])

  const handleDelete = useCallback(
    (threadId: string) => {
      void removeThread(threadId)
      if (activeThreadIdRef.current === threadId) switchThread(null)
    },
    [removeThread, switchThread],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role !== "system"),
    [messages],
  )
  const showEmptyState = visibleMessages.length === 0 && !pending

  const sidebar = (
    <AgentTestSidebar
      threads={threads}
      isLoading={threadsLoading}
      activeThreadId={activeThreadId}
      disabled={isStreaming}
      onSelect={switchThread}
      onNew={() => switchThread(null)}
      onDelete={handleDelete}
    />
  )

  return (
    <Card className="flex h-[calc(100vh-19rem)] min-h-[540px] overflow-hidden p-0">
      {/* Sidebar — desktop */}
      <aside className="hidden w-[230px] shrink-0 border-r bg-muted/20 md:flex">
        {sidebar}
      </aside>

      {/* Sidebar — mobile */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="text-sm">Conversations</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="truncate text-sm font-medium">{agent.name}</span>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {showEmptyState ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/40">
                <Sparkles className="size-5 text-muted-foreground" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Send a message to start testing{" "}
                <span className="font-medium text-foreground">{agent.name}</span>
                .
              </p>
            </div>
          ) : (
            <ChatContainerRoot className="h-full">
              <ChatContainerContent className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
                {visibleMessages.map((m) => {
                  if (m.role === "user") {
                    return <UserBubble key={m.id} content={m.content ?? ""} />
                  }
                  if (m.role === "tool") {
                    return <ToolStepRow key={m.id} step={stepFromMessage(m)} />
                  }
                  return (
                    <AssistantBubble
                      key={m.id}
                      emoji={agent.emoji}
                      content={m.content ?? ""}
                      meta={metaById[m.id]}
                    />
                  )
                })}

                {pending && (
                  <>
                    <UserBubble content={pending.userContent} />
                    {pending.steps.map((step, i) => (
                      <ToolStepRow key={`pending-step-${i}`} step={step} />
                    ))}
                    {pending.assistantText && (
                      <AssistantBubble
                        emoji={agent.emoji}
                        content={pending.assistantText}
                      />
                    )}
                    {pending.error ? (
                      <ErrorBubble message={pending.error} onRetry={retry} />
                    ) : (
                      !pending.assistantText && (
                        <ThinkingIndicator emoji={agent.emoji} />
                      )
                    )}
                  </>
                )}

                <ChatContainerScrollAnchor />
              </ChatContainerContent>
              <div className="absolute bottom-4 right-4">
                <ScrollButton className="shadow-sm" />
              </div>
            </ChatContainerRoot>
          )}
        </div>

        {/* Composer */}
        <div className="border-t bg-background/80 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${agent.name}…`}
                disabled={isStreaming}
                className="max-h-40 min-h-[40px] resize-none border-none bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
              />
              {isStreaming ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9 shrink-0 rounded-full"
                  onClick={stop}
                  title="Stop"
                >
                  <Square className="size-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  title="Send"
                >
                  <SendHorizonal className="size-4" />
                </Button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{modelLabel}</span>
              {hasKnowledge && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1">
                    <BookText className="size-3" />
                    Knowledge base attached
                  </span>
                </>
              )}
              <span className="opacity-40">·</span>
              <span>Enter to send · Shift+Enter for newline</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

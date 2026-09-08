"use client"

import { useState, useCallback, useRef } from "react"
import { Send, StopCircle, Sparkles, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/ui/prompt-input"
import { Loader } from "@/components/ui/loader"
import type { ChatMessage, ChatSource } from "@/hooks/use-rag"
import { cn } from "@/lib/utils"

interface RagChatProps {
  deploymentId: string
  collectionId: string
  collectionName: string
}

export function RagChat({
  deploymentId,
  collectionId,
  collectionName,
}: RagChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isStreaming: true,
      sources: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    // Build history from previous messages (last 10)
    const history = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch(
        `/api/v1/deployments/${deploymentId}/rag/chat`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            collectionId,
            history,
          }),
          signal: controller.signal,
        }
      )

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string }
        throw new Error(errData.error ?? "Chat request failed")
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let sources: ChatSource[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const event = line.slice(7).trim()
            // Read next data line
            const dataLineIndex = lines.indexOf(line) + 1
            const dataLine = lines[dataLineIndex]
            if (!dataLine?.startsWith("data: ")) continue

            const data = dataLine.slice(6).trim()

            if (event === "sources" && data) {
              try {
                sources = JSON.parse(data) as ChatSource[]
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, sources } : m
                  )
                )
              } catch {
                // skip
              }
            }

            if (event === "content" && data) {
              try {
                const parsed = JSON.parse(data) as { content: string }
                fullContent += parsed.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: fullContent }
                      : m
                  )
                )
              } catch {
                // skip
              }
            }

            if (event === "error" && data) {
              try {
                const parsed = JSON.parse(data) as { error: string }
                fullContent = `Error: ${parsed.error}`
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: fullContent, isStreaming: false }
                      : m
                  )
                )
              } catch {
                // skip
              }
            }

            if (event === "done") {
              break
            }
          }

          // Also handle simple SSE format: "data: {...}"
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim()
            if (!data || data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                fullContent += parsed.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: fullContent }
                      : m
                  )
                )
              }
            } catch {
              // skip
            }
          }
        }
      }

      // Finalize
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: fullContent || "No response generated.", isStreaming: false, sources }
            : m
        )
      )
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: `Error: ${(error as Error).message}`,
                  isStreaming: false,
                }
              : m
          )
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, messages, deploymentId, collectionId])

  const handleStop = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat area */}
      <ChatContainerRoot className="flex-1 min-h-0">
        <ChatContainerContent className="gap-4 p-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10">
                <Sparkles className="size-6 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Chat with {collectionName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask questions about your documents
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <Message
                className={cn(
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <MessageAvatar
                  src={
                    msg.role === "user"
                      ? "/user-avatar.png"
                      : "/ai-avatar.png"
                  }
                  alt={msg.role}
                  fallback={msg.role === "user" ? "U" : "AI"}
                  className={cn(
                    "size-7",
                    msg.role === "assistant" &&
                      "bg-violet-500/10 text-violet-600"
                  )}
                />
                <div
                  className={cn(
                    "flex flex-col gap-1.5 max-w-[80%]",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <MessageContent
                    markdown={msg.role === "assistant"}
                    className={cn(
                      "text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary"
                    )}
                  >
                    {msg.content || (msg.isStreaming ? " " : "")}
                  </MessageContent>

                  {/* Streaming indicator */}
                  {msg.isStreaming && !msg.content && (
                    <div className="px-2">
                      <Loader variant="typing" size="sm" />
                    </div>
                  )}

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <FileSearch className="size-3 text-muted-foreground" />
                      {msg.sources.map((s, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 cursor-default"
                          title={s.content}
                        >
                          Source {i + 1} · {(s.score * 100).toFixed(0)}%
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Message>
            </div>
          ))}

          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Input */}
      <div className="border-t p-3 bg-background">
        <PromptInput
          value={input}
          onValueChange={setInput}
          isLoading={isStreaming}
          onSubmit={() => void sendMessage()}
          className="shadow-none"
        >
          <PromptInputTextarea
            placeholder="Ask a question about your documents..."
            className="text-sm min-h-[40px]"
          />
          <PromptInputActions className="justify-end px-2 pb-1">
            {isStreaming ? (
              <PromptInputAction tooltip="Stop">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={handleStop}
                >
                  <StopCircle className="size-4 text-destructive" />
                </Button>
              </PromptInputAction>
            ) : (
              <PromptInputAction tooltip="Send">
                <Button
                  variant="default"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim()}
                >
                  <Send className="size-3.5" />
                </Button>
              </PromptInputAction>
            )}
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  )
}

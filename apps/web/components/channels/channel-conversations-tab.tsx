"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MessagesSquare, User } from "lucide-react"
import {
  useChannelConversations,
  getConversationMessages,
  type ChannelConversation,
  type ChannelMessage,
} from "@/hooks/use-channels"
import { relativeTime } from "./channel-shared"

interface ChannelConversationsTabProps {
  deploymentId: string
  channelId: string
}

function ConversationListItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ChannelConversation
  selected: boolean
  onSelect: () => void
}) {
  const displayName =
    conversation.platformUsername ?? conversation.platformUserId

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/50",
      ].join(" ")}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary uppercase">
        {displayName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate">{displayName}</p>
          <p className="text-[10px] text-muted-foreground shrink-0">
            {relativeTime(conversation.lastMessageAt)}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {conversation.lastMessagePreview ?? "No messages"}
        </p>
      </div>
    </button>
  )
}

function MessageBubble({ message }: { message: ChannelMessage }) {
  if (message.direction === "system") {
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          context cleared
        </p>
        <div className="h-px flex-1 bg-border" />
      </div>
    )
  }

  const isInbound = message.direction === "inbound"
  return (
    <div className={["flex", isInbound ? "justify-start" : "justify-end"].join(" ")}>
      <div
        className={[
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
          isInbound
            ? "bg-muted rounded-bl-sm"
            : "bg-primary text-primary-foreground rounded-br-sm",
        ].join(" ")}
      >
        {message.content}
        <p
          className={[
            "text-[10px] mt-1",
            isInbound ? "text-muted-foreground" : "text-primary-foreground/70",
          ].join(" ")}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {message.tokenCount != null && ` · ${message.tokenCount} tok`}
        </p>
      </div>
    </div>
  )
}

export function ChannelConversationsTab({
  deploymentId,
  channelId,
}: ChannelConversationsTabProps) {
  const { conversations, isLoading } = useChannelConversations(
    deploymentId,
    channelId,
    { pollMs: 10_000 }
  )

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-select the most recent conversation
  useEffect(() => {
    if (!selectedUserId && conversations.length > 0) {
      setSelectedUserId(conversations[0].platformUserId)
    }
  }, [conversations, selectedUserId])

  const loadMessages = useCallback(
    async (userId: string, showSpinner: boolean) => {
      if (showSpinner) setMessagesLoading(true)
      try {
        const msgs = await getConversationMessages(
          deploymentId,
          channelId,
          userId,
          { limit: 100 }
        )
        setMessages(msgs.slice().reverse()) // newest-first from API → ascending
      } catch {
        // polling failure is non-fatal; keep the last good state
      } finally {
        if (showSpinner) setMessagesLoading(false)
      }
    },
    [deploymentId, channelId]
  )

  // Load + poll the selected conversation
  useEffect(() => {
    if (!selectedUserId) return
    void loadMessages(selectedUserId, true)
    const interval = setInterval(() => void loadMessages(selectedUserId, false), 10_000)
    return () => clearInterval(interval)
  }, [selectedUserId, loadMessages])

  // Stick to the bottom when messages change
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <MessagesSquare className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Messages people send to this channel will show up here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Conversation list */}
      <div className="rounded-xl border bg-card p-2 space-y-1 max-h-[560px] overflow-y-auto">
        {conversations.map((conv) => (
          <ConversationListItem
            key={conv.platformUserId}
            conversation={conv}
            selected={conv.platformUserId === selectedUserId}
            onSelect={() => setSelectedUserId(conv.platformUserId)}
          />
        ))}
      </div>

      {/* Thread */}
      <div className="rounded-xl border bg-card flex flex-col max-h-[560px]">
        {selectedUserId ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <User className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-medium">
                {conversations.find((c) => c.platformUserId === selectedUserId)
                  ?.platformUsername ?? selectedUserId}
              </p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
                </div>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} />)
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-xs text-muted-foreground">
              Select a conversation to view messages.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

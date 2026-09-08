"use client"

import { useState } from "react"
import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/components/agents/agent-shared"
import type { AgentThread } from "@/hooks/use-agent-threads"

interface AgentTestSidebarProps {
  threads: AgentThread[]
  isLoading: boolean
  activeThreadId: string | null
  disabled: boolean
  onSelect: (threadId: string) => void
  onNew: () => void
  onDelete: (threadId: string) => void
}

export function AgentTestSidebar({
  threads,
  isLoading,
  activeThreadId,
  disabled,
  onSelect,
  onNew,
  onDelete,
}: AgentTestSidebarProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
          disabled={disabled}
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && threads.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId
              const confirming = confirmId === thread.id
              return (
                <li key={thread.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md text-sm transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(thread.id)}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left"
                    >
                      <span className="truncate font-medium">
                        {thread.title || "New conversation"}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {relativeTime(thread.updatedAt)}
                      </span>
                    </button>
                    {confirming ? (
                      <div className="flex shrink-0 items-center gap-0.5 pr-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            onDelete(thread.id)
                            setConfirmId(null)
                          }}
                          title="Confirm delete"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() => setConfirmId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => setConfirmId(thread.id)}
                        title="Delete conversation"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

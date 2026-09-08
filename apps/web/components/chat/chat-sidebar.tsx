"use client"

import { useState } from "react"
import {
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ChatSession } from "@/lib/chat"

function dayDiff(iso: string): number {
  const today = new Date()
  return Math.floor(
    (today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) /
      86_400_000,
  )
}

function relativeDay(iso: string): string {
  const d = new Date(iso)
  const diffDays = dayDiff(iso)
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return "Previous 7 days"
  if (diffDays < 30) return "Previous 30 days"
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

// Compact per-row stamp: time-of-day for today/yesterday, short date otherwise.
function rowStamp(iso: string): string {
  const d = new Date(iso)
  if (dayDiff(iso) <= 1) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function IconAction({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-100 active:scale-90 disabled:opacity-40",
        primary
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

interface ChatSidebarProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  onSelect: (session: ChatSession) => void
  onDelete: (id: string) => void
  onNew: () => void
  onClearAll: () => void
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onDelete,
  onNew,
  onClearAll,
}: ChatSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const sorted = [...sessions].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
  )

  // group by relative day bucket, preserving order
  const groups: { label: string; items: ChatSession[] }[] = []
  for (const s of sorted) {
    const label = relativeDay(s.updatedAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(s)
    else groups.push({ label, items: [s] })
  }

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 bg-muted/30 p-2 shadow-[1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_rgba(255,255,255,0.06)]">
        <IconAction label="Expand history" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen className="size-4" />
        </IconAction>
        <IconAction label="New chat" onClick={onNew} primary>
          <MessageSquarePlus className="size-4" />
        </IconAction>
      </aside>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-muted/30 shadow-[1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <h2 className="flex-1 text-[20px] font-semibold leading-none tracking-[-0.02em]">Chats</h2>
        <IconAction label="Clear history" onClick={() => setConfirmClear(true)} disabled={sorted.length === 0}>
          <Trash2 className="size-4" />
        </IconAction>
        <IconAction label="Collapse history" onClick={() => setCollapsed(true)}>
          <PanelLeftClose className="size-4" />
        </IconAction>
        <IconAction label="New chat" onClick={onNew} primary>
          <MessageSquarePlus className="size-4" />
        </IconAction>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-3 pt-1">
        {sorted.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((session) => {
                const active = session.id === currentSessionId
                const count = session.messages.filter(
                  (m) => m.role !== "system",
                ).length
                return (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(session)}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(session)}
                    className={cn(
                      "group flex min-h-[3.25rem] cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-[background-color,transform] duration-100 active:scale-[0.99]",
                      active ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06)]" : "hover:bg-background/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="line-clamp-1 flex-1 text-[13px] font-medium">
                          {session.title}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                          {rowStamp(session.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {count} message{count === 1 ? "" : "s"}
                      </p>
                    </div>
                    {/* Fixed-width slot so the row never reflows on hover (no CLS) */}
                    <div className="flex w-4 shrink-0 justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(session.id)
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all conversations?</DialogTitle>
            <DialogDescription>
              This permanently deletes all {sorted.length} conversation
              {sorted.length === 1 ? "" : "s"} in this chat. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="sr-only">Confirm clearing history.</DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onClearAll()
                setConfirmClear(false)
              }}
            >
              <Trash2 className="size-4" />
              Yes, delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

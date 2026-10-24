"use client"

import { useState } from "react"
import { motion } from "motion/react"
import {
  Brain,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Gauge,
  Hash,
  Pencil,
  RefreshCw,
  Timer,
  X,
} from "lucide-react"

import { MessageContent } from "@/components/ui/message"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  formatCompact,
  formatDuration,
  splitThinking,
  type ChatMessage,
} from "@/lib/chat"

// Bubbles arrive from the edge they're anchored to — a sent message grows out
// of the composer on the right, a reply out of the left — with a damped spring.
const enter = {
  initial: { opacity: 0, y: 10, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: "spring", bounce: 0, duration: 0.4 },
} as const

function StatPill({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  title: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground">
          <Icon className="size-3 opacity-60" />
          {value}
          {label && <span className="opacity-60">{label}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-100 hover:bg-muted hover:text-foreground active:scale-90"
        >
          <Icon className={cn("size-3.5", active && "text-success")} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-muted-foreground/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

// A thinking model's reasoning, folded away above its answer. Open it to read
// along; while the model is still thinking the label says so.
function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex max-w-[85%] flex-col items-start">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-[transform,background-color,color] duration-100 hover:bg-muted hover:text-foreground active:scale-95"
      >
        <Brain className={cn("size-3.5", active && "animate-pulse")} />
        {active ? "Thinking…" : "Thought process"}
        <ChevronRight
          className={cn("size-3 transition-transform duration-150", open && "rotate-90")}
        />
      </button>
      {open && text && (
        <MessageContent
          markdown
          className="ml-4 mt-1 rounded-none border-l border-border bg-transparent py-0 pl-3 pr-0 text-[13px] leading-[1.5] text-muted-foreground prose-p:my-1 prose-pre:my-2 prose-strong:text-muted-foreground"
        >
          {text}
        </MessageContent>
      )}
    </div>
  )
}

interface ChatMessageItemProps {
  message: ChatMessage
  isStreaming: boolean
  canRegenerate: boolean
  onRegenerate: () => void
  onEdit: (id: string, content: string) => void
}

export function ChatMessageItem({
  message,
  isStreaming,
  canRegenerate,
  onRegenerate,
  onEdit,
}: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  const copy = () => {
    // A reply copies as its answer, without the reasoning above it.
    const text =
      message.role === "assistant"
        ? splitThinking(message.content).answer || message.content
        : message.content
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const stats = message.stats

  // ── user message ────────────────────────────────────────────────────────
  if (message.role === "user") {
    if (editing) {
      return (
        <div className="flex flex-col items-end">
          <div className="w-full max-w-[78%] rounded-[20px] bg-muted p-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60px] resize-none border-none bg-transparent text-[15px] shadow-none focus-visible:ring-0"
              autoFocus
            />
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-transform active:scale-95"
                onClick={() => {
                  setEditing(false)
                  setDraft(message.content)
                }}
              >
                <X className="size-3.5" /> Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-transform active:scale-95"
                onClick={() => {
                  setEditing(false)
                  onEdit(message.id, draft)
                }}
              >
                <Check className="size-3.5" /> Send
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <motion.div {...enter} style={{ transformOrigin: "bottom right" }} className="group flex flex-col items-end gap-1">
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-[6px] bg-primary px-4 py-2.5 text-[15px] leading-[1.4] text-primary-foreground">
          {message.content}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} onClick={copy} active={copied} />
          {!isStreaming && (
            <IconButton
              icon={Pencil}
              label="Edit & resend"
              onClick={() => {
                setDraft(message.content)
                setEditing(true)
              }}
            />
          )}
        </div>
      </motion.div>
    )
  }

  // ── assistant message ─────────────────────────────────────────────────────
  const isEmpty = !message.content
  const { thinking, stillThinking, answer } = splitThinking(message.content)
  // An empty <think></think> (thinking switched off) gets no toggle.
  const showThinking = !isEmpty && (stillThinking || Boolean(thinking))
  // Out of tokens (or stopped) before the closing tag: there is no answer to show.
  const cutOffWhileThinking = stillThinking && !isStreaming
  return (
    <motion.div {...enter} style={{ transformOrigin: "bottom left" }} className="group flex flex-col items-start gap-1">
      {message.model && (
        <span className="px-3 text-[11px] font-medium text-muted-foreground">{message.model}</span>
      )}
      {showThinking && (
        <ThinkingBlock text={thinking ?? ""} active={stillThinking && isStreaming} />
      )}
      {isEmpty ? (
        <div className="rounded-[20px] rounded-bl-[6px] bg-muted px-3 py-2">
          <TypingDots />
        </div>
      ) : answer ? (
        <MessageContent
          markdown
          className={cn(
            "max-w-[85%] rounded-[20px] rounded-bl-[6px] bg-muted px-4 py-2.5 text-[15px] leading-[1.5] prose-p:my-1.5 prose-pre:my-2",
            message.error && "bg-destructive/10 text-destructive",
          )}
        >
          {answer}
        </MessageContent>
      ) : cutOffWhileThinking ? (
        <p className="px-3 text-[13px] text-muted-foreground">
          The model stopped before it finished thinking. Raise Max tokens to get an answer.
        </p>
      ) : null}

      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          {stats && (
            <>
              {stats.tokensPerSec != null && stats.tokensPerSec > 0 && (
                <StatPill icon={Gauge} value={stats.tokensPerSec.toFixed(1)} label="tok/s" title="Decode throughput" />
              )}
              {stats.tokens != null && (
                <StatPill icon={Hash} value={formatCompact(stats.tokens)} label="tok" title={`Output tokens${stats.estimated ? " (estimated)" : ""}`} />
              )}
              {stats.ttftMs != null && (
                <StatPill icon={Timer} value={formatDuration(stats.ttftMs)} label="TTFT" title="Time to first token" />
              )}
              {stats.totalMs != null && (
                <StatPill icon={Clock} value={formatDuration(stats.totalMs)} label="" title="Total latency" />
              )}
            </>
          )}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} onClick={copy} active={copied} />
            {canRegenerate && !isStreaming && (
              <IconButton icon={RefreshCw} label="Regenerate" onClick={onRegenerate} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

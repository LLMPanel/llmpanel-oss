"use client"

import { useState } from "react"
import { AlertCircle, ChevronRight, RotateCcw, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import { AgentAvatar } from "@/components/agents/agent-shared"
import type { AgentStepEvent, AgentThreadMessage } from "@/hooks/use-agent-threads"

/** Normalised shape for both live `step` events and persisted `tool` messages. */
export interface ToolStep {
  tool: string
  arguments: string
  result: string
  durationMs: number | null
}

/** Metadata attached to a finished assistant turn (from the `done` event). */
export interface AssistantMeta {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  toolsDegraded: boolean
  steps: number
}

export function stepFromEvent(event: AgentStepEvent): ToolStep {
  return {
    tool: event.tool,
    arguments: event.arguments,
    result: event.result,
    durationMs: event.durationMs,
  }
}

/** Parse a persisted `role: "tool"` message into a ToolStep. */
export function stepFromMessage(message: AgentThreadMessage): ToolStep {
  let args = ""
  let durationMs: number | null = null
  if (message.toolCalls) {
    try {
      const parsed = JSON.parse(message.toolCalls) as {
        arguments?: unknown
        durationMs?: unknown
      }
      if (typeof parsed.arguments === "string") {
        args = parsed.arguments
      } else if (parsed.arguments != null) {
        args = JSON.stringify(parsed.arguments, null, 2)
      }
      if (typeof parsed.durationMs === "number") durationMs = parsed.durationMs
    } catch {
      // fall back to the raw payload if it isn't the expected JSON
      args = message.toolCalls
    }
  }
  return {
    tool: message.toolName ?? "tool",
    arguments: args,
    result: message.content ?? "",
    durationMs,
  }
}

function formatMs(ms: number | null): string {
  if (ms == null) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ToolStepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false)
  const duration = formatMs(step.durationMs)
  return (
    <div className="rounded-lg border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        <Wrench className="size-3 shrink-0 opacity-70" />
        <span className="font-mono font-medium text-foreground/80">{step.tool}</span>
        {duration && (
          <>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{duration}</span>
          </>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide opacity-50">
          tool call
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2">
          {step.arguments && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Arguments
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                {step.arguments}
              </pre>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Result
            </p>
            <pre className="max-h-56 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {step.result || "—"}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  )
}

export function AssistantBubble({
  emoji,
  content,
  meta,
}: {
  emoji: string | null
  content: string
  meta?: AssistantMeta
}) {
  return (
    <div className="flex gap-3">
      <AgentAvatar emoji={emoji} className="size-8 text-lg" iconClassName="size-4" />
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5">
        <Markdown className="prose prose-sm dark:prose-invert max-w-none break-words rounded-2xl bg-muted/50 px-3.5 py-2 text-sm">
          {content}
        </Markdown>
        {meta && <AssistantMetaLine meta={meta} />}
      </div>
    </div>
  )
}

export function AssistantMetaLine({ meta }: { meta: AssistantMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[11px] text-muted-foreground">
      <span className="tabular-nums">
        {meta.promptTokens + meta.completionTokens} tokens
      </span>
      {meta.steps > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span>
            {meta.steps} tool {meta.steps === 1 ? "step" : "steps"}
          </span>
        </>
      )}
      {meta.toolsDegraded && (
        <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-warning">
          <AlertCircle className="size-3" />
          model rejected tools — answered without them
        </span>
      )}
    </div>
  )
}

export function ThinkingIndicator({ emoji }: { emoji: string | null }) {
  return (
    <div className="flex gap-3">
      <AgentAvatar emoji={emoji} className="size-8 text-lg" iconClassName="size-4" />
      <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3">
        <span className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
        </span>
        <span className="text-xs text-muted-foreground">Thinking…</span>
      </div>
    </div>
  )
}

export function ErrorBubble({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10">
        <AlertCircle className="size-4 text-destructive" />
      </div>
      <div className="flex max-w-[85%] flex-col gap-2 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
        <span className="break-words">{message}</span>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-fit border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRetry}
          >
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}

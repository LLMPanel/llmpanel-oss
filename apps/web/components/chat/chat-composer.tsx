"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Square } from "lucide-react"

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { formatDuration } from "@/lib/chat"
import type { LiveStats } from "@/hooks/use-chat"
import { cn } from "@/lib/utils"

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const

function LiveGenerationBar({ live }: { live: LiveStats }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const tick = () => {
      const nowT = typeof performance !== "undefined" ? performance.now() : Date.now()
      setElapsed(nowT - live.startedAt)
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [live.startedAt])

  const decodeSec = live.ttftMs != null ? Math.max(0.001, (elapsed - live.ttftMs) / 1000) : 0
  const tps = decodeSec > 0 ? live.tokens / decodeSec : 0

  return (
    <div className="mb-2 flex items-center gap-4 px-3 text-[11px] font-medium tabular-nums text-muted-foreground">
      <span className="flex items-center gap-1.5 text-primary">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        Generating
      </span>
      <Metric value={live.ttftMs != null ? formatDuration(live.ttftMs) : "…"} label="TTFT" />
      <Metric value={String(live.tokens)} label="tok" />
      <Metric value={tps > 0 ? tps.toFixed(1) : "…"} label="tok/s" />
      <span className="ml-auto">{formatDuration(elapsed)}</span>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span className="text-foreground">{value}</span>{" "}
      <span className="opacity-70">{label}</span>
    </span>
  )
}

interface ChatComposerProps {
  input: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onStop: () => void
  isStreaming: boolean
  disabled: boolean
  placeholder: string
  live: LiveStats | null
}

/**
 * Messages-style composer: a soft pill field with the send control living
 * inside it, floating on a translucent material that the thread scrolls under.
 */
export function ChatComposer({
  input,
  onInputChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  live,
}: ChatComposerProps) {
  const canSend = isStreaming || (!!input.trim() && !disabled)

  return (
    <div className="relative shrink-0">
      {/* Scroll-edge: thread fades into the material instead of a hard border. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent" />
      <div
        className={cn(
          "bg-background/80 px-4 pb-3 pt-2 backdrop-blur-xl backdrop-saturate-150",
          "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
        )}
      >
        <div className="mx-auto max-w-3xl">
          <AnimatePresence initial={false}>
            {live && (
              <motion.div
                key="live"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring}
                className="overflow-hidden"
              >
                <LiveGenerationBar live={live} />
              </motion.div>
            )}
          </AnimatePresence>

          <PromptInput
            value={input}
            onValueChange={onInputChange}
            isLoading={isStreaming}
            onSubmit={onSubmit}
            disabled={disabled && !isStreaming}
            className="flex w-full items-end gap-2 rounded-[24px] border-0 bg-muted py-1.5 pl-4 pr-1.5 shadow-none focus-within:ring-2 focus-within:ring-ring/30"
          >
            <PromptInputTextarea
              placeholder={placeholder}
              autoFocus
              className="flex-1 px-0 py-2 text-[15px] leading-[1.4] text-foreground placeholder:text-muted-foreground"
            />
            <PromptInputActions className="pb-0.5">
              <PromptInputAction tooltip={isStreaming ? "Stop" : "Send"}>
                <button
                  type="button"
                  aria-label={isStreaming ? "Stop generation" : "Send message"}
                  onClick={isStreaming ? onStop : onSubmit}
                  disabled={!canSend}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-[transform,background-color,opacity] duration-150 ease-out active:scale-90",
                    isStreaming
                      ? "bg-foreground text-background"
                      : "bg-primary text-primary-foreground",
                    !canSend && "opacity-30"
                  )}
                >
                  {isStreaming ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" strokeWidth={2.5} />
                  )}
                </button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>

          <p className="mt-2 text-center text-[11px] text-muted-foreground/80">
            Stored locally in your browser · Return to send · Shift‑Return for a new line
          </p>
        </div>
      </div>
    </div>
  )
}

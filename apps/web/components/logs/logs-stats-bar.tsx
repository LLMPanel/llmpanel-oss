"use client"

import { AnimatePresence, motion } from "motion/react"
import type { LogSummary } from "@/hooks/use-logs"
import { cn } from "@/lib/utils"

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * One inset-grouped cell. The value cross-fades when it changes — a number
 * that silently jumps reads as a glitch; a brief fade reads as an update.
 */
function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <div className="relative mt-1 h-7 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p
            key={value}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className={cn(
              "text-[22px] font-semibold leading-7 tracking-[-0.02em] tabular-nums",
              valueClass
            )}
          >
            {value}
          </motion.p>
        </AnimatePresence>
      </div>
      {sub && (
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}

export function LogsStatsBar({ summary }: { summary: LogSummary }) {
  const successColor =
    summary.successRate >= 99
      ? "text-success"
      : summary.successRate >= 95
      ? "text-warning"
      : "text-destructive"

  return (
    <section
      aria-label="Summary"
      className="grid grid-cols-2 overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] sm:grid-cols-4 sm:divide-x sm:divide-black/[0.06] dark:ring-white/[0.06] dark:sm:divide-white/[0.06]"
    >
      <Stat label="Requests" value={formatNum(summary.totalRequests)} />
      <Stat
        label="Success rate"
        value={`${summary.successRate}%`}
        valueClass={successColor}
      />
      <Stat
        label="Avg. latency"
        value={summary.avgLatencyMs > 0 ? `${summary.avgLatencyMs} ms` : "—"}
      />
      <Stat
        label="Tokens"
        value={formatNum(summary.totalTokens)}
        sub={`${formatNum(summary.totalPromptTokens)} in · ${formatNum(summary.totalCompletionTokens)} out`}
      />
    </section>
  )
}

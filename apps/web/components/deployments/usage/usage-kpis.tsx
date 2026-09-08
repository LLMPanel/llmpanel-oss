"use client"

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { UsagePeriod, UsageTotals } from "@/hooks/use-deployment-usage"
import {
  formatCompact,
  formatLatency,
  relativeDelta,
  pointsDelta,
  PERIOD_LABELS,
  type Delta,
} from "./format"

// Whether an increase in the metric is good, bad, or just informational —
// controls the delta color so a latency spike reads red, not green.
type DeltaSentiment = "neutral" | "up-is-bad"

function DeltaBadge({ delta, sentiment }: { delta: Delta; sentiment: DeltaSentiment }) {
  if (!delta.label) return null

  const Icon =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus

  const tone =
    delta.direction === "flat" || sentiment === "neutral"
      ? "text-muted-foreground"
      : (delta.direction === "up") === (sentiment === "up-is-bad")
        ? "text-destructive"
        : "text-success"

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", tone)}>
      <Icon className="size-3" />
      {delta.label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  sentiment = "neutral",
}: {
  label: string
  value: string
  sub: string
  delta: Delta
  sentiment?: DeltaSentiment
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-4 py-4 space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
          <DeltaBadge delta={delta} sentiment={sentiment} />
        </div>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

export function UsageKpiRow({
  totals,
  previous,
  period,
}: {
  totals: UsageTotals
  previous: UsageTotals
  period: UsagePeriod
}) {
  const errorCount = totals.clientErrors + totals.serverErrors
  const errorRate = totals.totalRequests > 0 ? (errorCount / totals.totalRequests) * 100 : 0
  const previousErrorCount = previous.clientErrors + previous.serverErrors
  const previousErrorRate =
    previous.totalRequests > 0 ? (previousErrorCount / previous.totalRequests) * 100 : 0

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <KpiCard
        label="Requests"
        value={formatCompact(totals.totalRequests)}
        sub={`vs previous ${PERIOD_LABELS[period]}`}
        delta={relativeDelta(totals.totalRequests, previous.totalRequests)}
      />
      <KpiCard
        label="Tokens"
        value={formatCompact(totals.totalTokens)}
        sub={`${formatCompact(totals.promptTokens)} in · ${formatCompact(totals.completionTokens)} out`}
        delta={relativeDelta(totals.totalTokens, previous.totalTokens)}
      />
      <KpiCard
        label="Throughput"
        value={`${formatCompact(totals.tokensPerSecond ?? 0)} tok/s`}
        sub="avg generation speed"
        delta={
          previous.totalRequests > 0
            ? relativeDelta(totals.tokensPerSecond ?? 0, previous.tokensPerSecond ?? 0)
            : { label: null, direction: "flat" }
        }
      />
      <KpiCard
        label="Error rate"
        value={`${errorRate.toFixed(1)}%`}
        sub={
          errorCount > 0
            ? `${formatCompact(totals.clientErrors)} client · ${formatCompact(totals.serverErrors)} server`
            : "no errors in this period"
        }
        delta={pointsDelta(errorRate, previousErrorRate, previous.totalRequests > 0)}
        sentiment="up-is-bad"
      />
      <KpiCard
        label="Latency p95"
        value={formatLatency(totals.latency.p95)}
        sub={`p50 ${formatLatency(totals.latency.p50)} · p99 ${formatLatency(totals.latency.p99)}`}
        delta={
          previous.totalRequests > 0
            ? relativeDelta(totals.latency.p95, previous.latency.p95)
            : { label: null, direction: "flat" }
        }
        sentiment="up-is-bad"
      />
    </div>
  )
}

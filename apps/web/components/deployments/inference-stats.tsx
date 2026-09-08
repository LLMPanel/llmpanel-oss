import { MetricStrip, type Metric } from "./metric-strip"
import type { InferenceMetrics } from "@/hooks/use-inference-metrics"

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

interface InferenceStatsProps {
  metrics: InferenceMetrics
}

export function InferenceStats({ metrics: m }: InferenceStatsProps) {
  const stats: Metric[] = [
    {
      label: "Requests",
      value: formatNum(m.totalRequests),
      sub: "total",
    },
    {
      label: "Error rate",
      value: `${m.errorRate.toFixed(2)}%`,
      // Only colour it once it actually matters.
      tone: m.errorRate > 5 ? "destructive" : "default",
      sub: `${formatNum(m.successfulRequests)} ok · ${formatNum(m.failedRequests)} err`,
    },
    {
      label: "Rate",
      value: m.requestsPerMinute.toFixed(1),
      unit: "req/min",
      sub: `${m.requestsPerSecond.toFixed(2)} req/sec`,
    },
    {
      label: "Latency",
      value: `${m.averageLatencyMs.toFixed(0)}ms`,
      sub: "average",
    },
    {
      label: "Input tokens",
      value: formatNum(m.inputTokens),
      sub: "prompt",
    },
    {
      label: "Output tokens",
      value: formatNum(m.outputTokens),
      sub: "completion",
    },
    {
      label: "Total tokens",
      value: formatNum(m.totalTokens),
      sub: "input + output",
    },
    {
      label: "Throughput",
      value: formatNum(m.tokensPerSecond),
      unit: "tok/sec",
    },
  ]

  return <MetricStrip metrics={stats} />
}

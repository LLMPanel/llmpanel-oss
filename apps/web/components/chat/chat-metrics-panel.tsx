"use client"

import { motion } from "motion/react"

import { useGpuMetrics } from "@/hooks/use-gpu-metrics"
import { useInferenceMetrics } from "@/hooks/use-inference-metrics"
import { cn } from "@/lib/utils"
import { contextWindowFor, formatCompact } from "@/lib/chat"

const spring = { type: "spring", bounce: 0, duration: 0.5 } as const

function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
      <motion.div
        className={cn("h-full rounded-full", className ?? "bg-primary")}
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={spring}
      />
    </div>
  )
}

/** One cell of an inset group: quiet label above, value below. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold leading-tight tracking-[-0.01em] tabular-nums">
        {value}
        {sub && <span className="ml-1 text-[12px] font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  )
}

/** Label + meter row, Settings-style. */
function MeterRow({
  label,
  value,
  pct,
  className,
}: {
  label: string
  value: string
  pct: number
  className?: string
}) {
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between text-[13px]">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Meter value={pct} className={className} />
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="px-3 text-[12px] font-medium text-muted-foreground">{title}</h4>
      <div className="overflow-hidden rounded-xl bg-muted/50 dark:bg-muted/30">{children}</div>
    </section>
  )
}

// Grid of cells with hairlines between them, no nested borders.
const cells = "grid divide-x divide-y divide-black/[0.05] dark:divide-white/[0.06] [&>*:nth-child(-n+2)]:border-t-0"

interface ChatMetricsPanelProps {
  deploymentId: string | null
  isRunning: boolean
  modelFamily?: string | null
  contextTokens: number
}

export function ChatMetricsPanel({
  deploymentId,
  isRunning,
  modelFamily,
  contextTokens,
}: ChatMetricsPanelProps) {
  const inference = useInferenceMetrics(deploymentId ?? "", isRunning)
  const { metrics: gpu } = useGpuMetrics(deploymentId ?? "", isRunning ? "running" : "idle")

  const window = contextWindowFor(modelFamily)
  const ctxPct = (contextTokens / window) * 100
  const ctxTone =
    ctxPct > 90
      ? { text: "text-destructive", bar: "bg-destructive" }
      : ctxPct > 70
        ? { text: "text-warning", bar: "bg-warning" }
        : { text: "text-muted-foreground", bar: "bg-primary" }

  if (!deploymentId) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
        Select a running model to see live metrics.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-3">
      <Group title="Context window">
        <div className="space-y-2 px-3 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[17px] font-semibold leading-none tracking-[-0.01em] tabular-nums">
              {formatCompact(contextTokens)}
              <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                / {formatCompact(window)} tok
              </span>
            </span>
            <span className={cn("text-[13px] tabular-nums", ctxTone.text)}>
              {ctxPct.toFixed(0)}%
            </span>
          </div>
          <Meter value={ctxPct} className={ctxTone.bar} />
          <p className="text-[11px] leading-[1.4] text-muted-foreground">
            Estimated conversation size against the model’s context window.
          </p>
        </div>
      </Group>

      <Group title="Live throughput">
        {inference ? (
          <div className={cn(cells, "grid-cols-2")}>
            <Stat label="Tokens / s" value={formatCompact(inference.tokensPerSecond)} />
            <Stat
              label="Avg. latency"
              value={
                inference.averageLatencyMs >= 1000
                  ? (inference.averageLatencyMs / 1000).toFixed(1)
                  : Math.round(inference.averageLatencyMs).toString()
              }
              sub={inference.averageLatencyMs >= 1000 ? "s" : "ms"}
            />
            <Stat label="Requests / min" value={inference.requestsPerMinute.toFixed(1)} />
            <Stat label="Total requests" value={formatCompact(inference.totalRequests)} />
          </div>
        ) : (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">Waiting for traffic…</p>
        )}
      </Group>

      {inference && (
        <Group title="Tokens, deployment total">
          <div className={cn(cells, "grid-cols-3 [&>*:nth-child(-n+3)]:border-t-0")}>
            <Stat label="Input" value={formatCompact(inference.inputTokens)} />
            <Stat label="Output" value={formatCompact(inference.outputTokens)} />
            <Stat label="Total" value={formatCompact(inference.totalTokens)} />
          </div>
        </Group>
      )}

      {gpu && gpu.gpuCount > 0 && (
        <Group title={`GPU${gpu.gpuCount > 1 ? ` × ${gpu.gpuCount}` : ""}`}>
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            <MeterRow
              label="Utilization"
              value={`${gpu.gpuUtilization.toFixed(0)}%`}
              pct={gpu.gpuUtilization}
              className="bg-success"
            />
            <MeterRow
              label="VRAM"
              value={`${gpu.vramUsedGb.toFixed(1)} / ${gpu.vramTotalGb.toFixed(0)} GB`}
              pct={gpu.vramUsedPercent}
              className="bg-chart-2"
            />
            {(gpu.temperatureCelsius != null || gpu.powerDrawWatts != null) && (
              <div className="grid grid-cols-2 divide-x divide-black/[0.05] dark:divide-white/[0.06]">
                {gpu.temperatureCelsius != null && (
                  <Stat label="Temperature" value={gpu.temperatureCelsius.toFixed(0)} sub="°C" />
                )}
                {gpu.powerDrawWatts != null && (
                  <Stat label="Power" value={gpu.powerDrawWatts.toFixed(0)} sub="W" />
                )}
              </div>
            )}
          </div>
        </Group>
      )}
    </div>
  )
}

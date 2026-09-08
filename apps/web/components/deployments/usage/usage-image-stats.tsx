"use client"

import { useEffect, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import type { UsagePeriod } from "@/hooks/use-deployment-usage"
import {
  CHART_COLORS as COLORS,
  CHART_HEIGHT,
  CHART_MARGIN,
  CURSOR,
  ChartCard,
  ChartTooltip,
  TICK,
  Y_AXIS,
} from "../charts/chart-primitives"
import { formatBucketLabel, formatBucketTick, formatCompact, formatLatency } from "./format"

interface ImageStatsSeriesPoint {
  bucket: string
  images: number
  avgLatencyMs: number
}

export interface ImageStats {
  period: string
  bucket: "hour" | "day"
  totalImages: number
  viaApiKey: number
  viaPlayground: number
  averageLatencyMs: number
  series: ImageStatsSeriesPoint[]
}

export function useImageStats(deploymentId: string, period: UsagePeriod) {
  const [stats, setStats] = useState<ImageStats | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          `/api/v1/deployments/${deploymentId}/images/stats?period=${period}`,
          { credentials: "include" },
        )
        if (!res.ok) return
        const json = (await res.json()) as { stats: ImageStats }
        if (!cancelled) setStats(json.stats)
      } catch {
        /* non-fatal — section simply stays hidden */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [deploymentId, period])

  return stats
}

/**
 * Image-deployment usage section: generation KPIs + per-bucket chart, sourced
 * from image_generations (covers both API-key and dashboard playground calls,
 * unlike request_logs which only sees the gateway).
 */
export function UsageImageStats({
  deploymentId,
  period,
}: {
  deploymentId: string
  period: UsagePeriod
}) {
  const stats = useImageStats(deploymentId, period)

  if (!stats || stats.totalImages === 0) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <ImageKpi label="Images generated" value={formatCompact(stats.totalImages)} />
        <ImageKpi label="Avg generation time" value={formatLatency(stats.averageLatencyMs)} />
        <ImageKpi label="Via API keys" value={formatCompact(stats.viaApiKey)} />
        <ImageKpi label="Via playground" value={formatCompact(stats.viaPlayground)} />
      </div>

      <ChartCard title="Images generated" legend={[{ color: COLORS.input, label: "Images" }]}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={stats.series} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="bucket"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickFormatter={(iso: string) => formatBucketTick(iso, stats.bucket)}
            />
            <YAxis {...Y_AXIS} tickFormatter={formatCompact} allowDecimals={false} />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTooltip
                  formatLabel={(label) => formatBucketLabel(String(label), stats.bucket)}
                />
              }
            />
            <Bar
              dataKey="images"
              name="Images"
              fill={COLORS.input}
              radius={[2, 2, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function ImageKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-1 px-4 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}

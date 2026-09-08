"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Panel } from "./panel"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SpendSnapshotPoint } from "@/hooks/use-spend-history"
import { formatUsd, providerMeta } from "./provider-meta"

const THIRTY_MIN_MS = 30 * 60_000
const TARGET_BUCKETS = 96

interface BucketPoint {
  time: number
  [providerType: string]: number
}

// Snapshots arrive as one row per provider connection per collector run
// (~30min cadence). To chart them: bucket runs into ~96 time slots, sum each
// run's $/hr per provider type, then average the runs inside a bucket.
function bucketSnapshots(
  snapshots: SpendSnapshotPoint[],
  days: number,
): { points: BucketPoint[]; providerTypes: string[] } {
  if (snapshots.length === 0) return { points: [], providerTypes: [] }

  const rangeMs = days * 24 * 60 * 60_000
  const bucketMs = Math.max(
    THIRTY_MIN_MS,
    Math.round(rangeMs / TARGET_BUCKETS / THIRTY_MIN_MS) * THIRTY_MIN_MS,
  )

  const providerTypes = [...new Set(snapshots.map((s) => s.providerType))].sort()

  // bucket -> run timestamp -> providerType -> summed $/hr for that run
  const buckets = new Map<number, Map<string, Map<string, number>>>()
  for (const snap of snapshots) {
    const ts = new Date(snap.timestamp).getTime()
    const bucket = Math.floor(ts / bucketMs) * bucketMs
    const runs = buckets.get(bucket) ?? new Map<string, Map<string, number>>()
    const run = runs.get(snap.timestamp) ?? new Map<string, number>()
    run.set(snap.providerType, (run.get(snap.providerType) ?? 0) + snap.costPerHour)
    runs.set(snap.timestamp, run)
    buckets.set(bucket, runs)
  }

  const points: BucketPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, runs]) => {
      const point: BucketPoint = { time }
      for (const type of providerTypes) {
        let sum = 0
        for (const run of runs.values()) sum += run.get(type) ?? 0
        point[type] = sum / runs.size
      }
      return point
    })

  return { points, providerTypes }
}

function formatTick(time: number, days: number): string {
  const d = new Date(time)
  if (days <= 1) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }
  if (days <= 7) {
    return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" })
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function SpendHistoryChart({
  snapshots,
  days,
  isLoading,
}: {
  snapshots: SpendSnapshotPoint[]
  days: number
  isLoading: boolean
}) {
  const { points, providerTypes } = React.useMemo(
    () => bucketSnapshots(snapshots, days),
    [snapshots, days],
  )

  const chartConfig = providerTypes.reduce<ChartConfig>((acc, type) => {
    const meta = providerMeta(type)
    acc[type] = { label: meta.label, color: meta.color }
    return acc
  }, {})

  return (
    <Panel title="Spend over time" description="Hourly burn rate recorded every 30 minutes, stacked by provider">
      <div className="px-5 pb-4 pt-4">
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : points.length < 2 ? (
          <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
            Spend history is still being recorded.
            <br />
            The first data points appear within the hour — check back soon.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <AreaChart data={points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={(value: number) => formatTick(value, days)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={56}
                tickFormatter={(value: number) => `${formatUsd(value)}/h`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const time = (payload?.[0]?.payload as BucketPoint | undefined)?.time
                      if (!time) return null
                      return new Date(time).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    }}
                    formatter={(value, name, item) => {
                      const cost = typeof value === "number" ? value : Number(value)
                      return (
                        <div className="flex w-full items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="flex-1 text-muted-foreground">
                            {providerMeta(String(name)).label}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatUsd(cost, { decimals: 3 })}/hr
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />
              {providerTypes.map((type) => (
                <Area
                  key={type}
                  dataKey={type}
                  type="monotone"
                  stackId="spend"
                  stroke={`var(--color-${type})`}
                  fill={`var(--color-${type})`}
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              ))}
              {providerTypes.length > 1 && (
                <ChartLegend content={<ChartLegendContent />} />
              )}
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  )
}

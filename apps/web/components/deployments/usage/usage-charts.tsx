"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { UsageBucket, UsageSeriesPoint } from "@/hooks/use-deployment-usage"
import {
  CHART_COLORS as COLORS,
  CHART_HEIGHT,
  CHART_MARGIN,
  CURSOR,
  ChartCard,
  ChartTooltip as BaseChartTooltip,
  TICK,
  Y_AXIS,
} from "../charts/chart-primitives"
import { formatBucketLabel, formatBucketTick, formatCompact, formatExact, formatLatency } from "./format"

export { ChartCard }

// Usage charts key the X axis on ISO-string buckets; wrap the shared
// tooltip with the bucket-aware label formatter.
function ChartTooltip({
  bucket,
  formatValue = formatExact,
  ...rest
}: Omit<React.ComponentProps<typeof BaseChartTooltip>, "formatLabel"> & {
  bucket: UsageBucket
}) {
  return (
    <BaseChartTooltip
      {...rest}
      formatValue={formatValue}
      formatLabel={(label) => formatBucketLabel(String(label), bucket)}
    />
  )
}

interface SeriesChartProps {
  data: UsageSeriesPoint[]
  bucket: UsageBucket
}

function xAxisProps(bucket: UsageBucket) {
  return {
    dataKey: "bucket",
    tick: TICK,
    tickLine: false,
    axisLine: false,
    minTickGap: 32,
    tickFormatter: (iso: string) => formatBucketTick(iso, bucket),
  } as const
}

// ── Requests ─────────────────────────────────────────────────────────

export function UsageRequestsChart({ data, bucket }: SeriesChartProps) {
  const chartData = data.map((d) => ({
    bucket: d.bucket,
    successful: d.successful,
    failed: d.clientErrors + d.serverErrors,
  }))
  return (
    <ChartCard
      title="Requests"
      legend={[
        { color: COLORS.success, label: "Successful" },
        { color: COLORS.failed, label: "Failed" },
      ]}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...xAxisProps(bucket)} />
          <YAxis {...Y_AXIS} tickFormatter={formatCompact} />
          <Tooltip cursor={CURSOR} content={<ChartTooltip bucket={bucket} />} />
          <Bar dataKey="successful" name="Successful" stackId="requests" fill={COLORS.success} maxBarSize={36} />
          <Bar
            dataKey="failed"
            name="Failed"
            stackId="requests"
            fill={COLORS.failed}
            radius={[2, 2, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ── Tokens ───────────────────────────────────────────────────────────

export function UsageTokensChart({ data, bucket }: SeriesChartProps) {
  return (
    <ChartCard
      title="Tokens"
      legend={[
        { color: COLORS.input, label: "Input" },
        { color: COLORS.output, label: "Output" },
      ]}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...xAxisProps(bucket)} />
          <YAxis {...Y_AXIS} tickFormatter={formatCompact} />
          <Tooltip
            cursor={CURSOR}
            content={<ChartTooltip bucket={bucket} formatValue={formatExact} />}
          />
          <Bar dataKey="promptTokens" name="Input" stackId="tokens" fill={COLORS.input} maxBarSize={36} />
          <Bar
            dataKey="completionTokens"
            name="Output"
            stackId="tokens"
            fill={COLORS.output}
            radius={[2, 2, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ── Latency ──────────────────────────────────────────────────────────

export function UsageLatencyChart({ data, bucket }: SeriesChartProps) {
  // Buckets with no traffic have no latency — break the line instead of
  // plotting a misleading 0ms dip.
  const chartData = data.map((d) => ({
    bucket: d.bucket,
    avgLatencyMs: d.requests > 0 ? d.avgLatencyMs : null,
  }))
  return (
    <ChartCard title="Latency" legend={[{ color: COLORS.latency, label: "Average" }]}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...xAxisProps(bucket)} />
          <YAxis {...Y_AXIS} width={48} tickFormatter={(v: number) => formatLatency(v)} />
          <Tooltip
            content={<ChartTooltip bucket={bucket} formatValue={(v) => formatLatency(v)} />}
          />
          <Line
            type="monotone"
            dataKey="avgLatencyMs"
            name="Average"
            stroke={COLORS.latency}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ── Errors ───────────────────────────────────────────────────────────

export function UsageErrorsChart({ data, bucket }: SeriesChartProps) {
  return (
    <ChartCard
      title="Errors"
      legend={[
        { color: COLORS.clientError, label: "4xx" },
        { color: COLORS.serverError, label: "5xx" },
      ]}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...xAxisProps(bucket)} />
          <YAxis {...Y_AXIS} tickFormatter={formatCompact} />
          <Tooltip cursor={CURSOR} content={<ChartTooltip bucket={bucket} />} />
          <Bar dataKey="clientErrors" name="4xx" stackId="errors" fill={COLORS.clientError} maxBarSize={36} />
          <Bar
            dataKey="serverErrors"
            name="5xx"
            stackId="errors"
            fill={COLORS.serverError}
            radius={[2, 2, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

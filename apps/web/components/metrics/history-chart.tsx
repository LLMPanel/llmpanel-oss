"use client"

// Time-series charts for the metrics page, fed by /metrics/:id/history.
// X axis is numeric epoch ms; gap buckets carry null values and are drawn
// as real gaps (connectNulls={false}) — a stopped collector should look
// like missing data, not a flatline.
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { MetricsHistoryPoint } from "@/hooks/use-metrics-history"
import {
  CHART_COLORS,
  CHART_HEIGHT,
  CHART_MARGIN,
  ChartCard,
  ChartTooltip,
  TICK,
  Y_AXIS,
} from "@/components/deployments/charts/chart-primitives"
import {
  formatCelsius,
  formatGb,
  formatPercent,
  formatTimeLabel,
  formatTimeTick,
  formatWatts,
} from "@/components/deployments/charts/format"

interface HistoryChartProps {
  data: MetricsHistoryPoint[]
}

// Distinct series colors for per-GPU overlays, cycling the theme palette.
const GPU_SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const gpuSeriesColor = (i: number): string => GPU_SERIES_COLORS[i % GPU_SERIES_COLORS.length]

/** Sorted GPU indices present anywhere in the per-GPU history. */
function gpuIndices(data: MetricsHistoryPoint[]): number[] {
  const indices = new Set<number>()
  for (const p of data) for (const g of p.gpus ?? []) indices.add(g.index)
  return [...indices].sort((a, b) => a - b)
}

const X_AXIS = {
  dataKey: "t",
  type: "number" as const,
  scale: "time" as const,
  domain: ["dataMin", "dataMax"] as const,
  tick: TICK,
  tickLine: false,
  axisLine: false,
  minTickGap: 48,
  tickFormatter: (ms: number) => formatTimeTick(ms),
}

function Gradient({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.25} />
        <stop offset="100%" stopColor={color} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  )
}

export function GpuUtilHistoryChart({ data }: HistoryChartProps) {
  // Multi-GPU deployments get one line per device; single GPU keeps the
  // aggregate area fill.
  const indices = gpuIndices(data)
  const perGpu = indices.length > 1

  if (perGpu) {
    return (
      <ChartCard
        title="GPU Utilization"
        legend={indices.map((i) => ({ color: gpuSeriesColor(i), label: `GPU ${i}` }))}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis {...X_AXIS} />
            <YAxis {...Y_AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              content={
                <ChartTooltip
                  formatLabel={(l) => formatTimeLabel(Number(l))}
                  formatValue={formatPercent}
                />
              }
            />
            {indices.map((i) => (
              <Line
                key={i}
                type="monotone"
                dataKey={(p: MetricsHistoryPoint) =>
                  p.gpus?.find((g) => g.index === i)?.gpuUtilization ?? null
                }
                name={`GPU ${i}`}
                stroke={gpuSeriesColor(i)}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  return (
    <ChartCard title="GPU Utilization" legend={[{ color: CHART_COLORS.gpu, label: "Utilization" }]}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <Gradient id="gpu-util-fill" color={CHART_COLORS.gpu} />
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis {...Y_AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={formatPercent}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="gpuUtilization"
            name="Utilization"
            stroke={CHART_COLORS.gpu}
            strokeWidth={1.5}
            fill="url(#gpu-util-fill)"
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// SM clock history from the per-GPU series (agent-equipped deployments).
// Renders nothing when no clock data exists in the window.
export function ClocksHistoryChart({ data }: HistoryChartProps) {
  const indices = gpuIndices(data)
  const hasClockData = data.some((p) => p.gpus?.some((g) => g.clockSmMhz != null))
  if (indices.length === 0 || !hasClockData) return null

  return (
    <ChartCard
      title="SM Clock"
      legend={indices.map((i) => ({
        color: gpuSeriesColor(i),
        label: indices.length > 1 ? `GPU ${i}` : "Clock",
      }))}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis {...Y_AXIS} width={56} tickFormatter={(v: number) => `${v} MHz`} />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={(v) => `${Math.round(v)} MHz`}
              />
            }
          />
          {indices.map((i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={(p: MetricsHistoryPoint) =>
                p.gpus?.find((g) => g.index === i)?.clockSmMhz ?? null
              }
              name={indices.length > 1 ? `GPU ${i}` : "Clock"}
              stroke={gpuSeriesColor(i)}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function VramHistoryChart({ data }: HistoryChartProps) {
  const totalGb = data.reduce((max, p) => Math.max(max, p.vramTotalGb ?? 0), 0)
  return (
    <ChartCard title="VRAM" legend={[{ color: CHART_COLORS.vram, label: "Used" }]}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <Gradient id="vram-fill" color={CHART_COLORS.vram} />
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis
            {...Y_AXIS}
            width={52}
            domain={[0, totalGb > 0 ? Math.ceil(totalGb) : "auto"]}
            tickFormatter={(v: number) => `${v} GB`}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={formatGb}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="vramUsedGb"
            name="Used"
            stroke={CHART_COLORS.vram}
            strokeWidth={1.5}
            fill="url(#vram-fill)"
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function TemperatureHistoryChart({ data }: HistoryChartProps) {
  return (
    <ChartCard
      title="Temperature"
      legend={[{ color: CHART_COLORS.temperature, label: "GPU" }]}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis {...Y_AXIS} tickFormatter={(v: number) => `${v}°`} />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={formatCelsius}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="temperatureCelsius"
            name="GPU"
            stroke={CHART_COLORS.temperature}
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

export function PowerHistoryChart({ data }: HistoryChartProps) {
  return (
    <ChartCard title="Power Draw" legend={[{ color: CHART_COLORS.power, label: "Draw" }]}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <Gradient id="power-fill" color={CHART_COLORS.power} />
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis {...Y_AXIS} width={48} tickFormatter={(v: number) => `${v} W`} />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={formatWatts}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="powerDrawWatts"
            name="Draw"
            stroke={CHART_COLORS.power}
            strokeWidth={1.5}
            fill="url(#power-fill)"
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function ContainerHistoryChart({ data }: HistoryChartProps) {
  return (
    <ChartCard
      title="Container"
      legend={[
        { color: CHART_COLORS.cpu, label: "CPU" },
        { color: CHART_COLORS.memory, label: "RAM" },
      ]}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis {...X_AXIS} />
          <YAxis {...Y_AXIS} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            content={
              <ChartTooltip
                formatLabel={(l) => formatTimeLabel(Number(l))}
                formatValue={formatPercent}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="containerCpuPercent"
            name="CPU"
            stroke={CHART_COLORS.cpu}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="containerMemoryPercent"
            name="RAM"
            stroke={CHART_COLORS.memory}
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

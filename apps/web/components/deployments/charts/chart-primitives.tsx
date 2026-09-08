"use client"

// Shared recharts building blocks for the deployment observability pages
// (usage, metrics, overview). Colors come from the theme's --chart-N tokens
// so charts follow light/dark mode without hardcoded hex values.
import type { TooltipPayloadEntry } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const CHART_COLORS = {
  success: "var(--chart-2)",
  input: "var(--chart-1)",
  output: "var(--chart-3)",
  latency: "var(--chart-1)",
  clientError: "var(--chart-4)",
  serverError: "var(--destructive)",
  failed: "var(--destructive)",
  gpu: "var(--chart-1)",
  vram: "var(--chart-2)",
  temperature: "var(--chart-4)",
  power: "var(--chart-5)",
  cpu: "var(--chart-3)",
  memory: "var(--chart-2)",
} as const

export const TICK = { fontSize: 11, fill: "var(--muted-foreground)" }
export const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }
export const CHART_HEIGHT = 240
export const CURSOR = { fill: "var(--accent)", opacity: 0.4 }

export const Y_AXIS = {
  tick: TICK,
  tickLine: false,
  axisLine: false,
  width: 42,
  allowDecimals: false,
} as const

export type ValueFormatter = (value: number) => string
export type LabelFormatter = (label: string | number) => string

// Recharts injects active/payload/label when rendering the tooltip content
// element, so those props are optional on our side.
export interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
  formatLabel: LabelFormatter
  formatValue?: ValueFormatter
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue = (v) => v.toLocaleString("en-US"),
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">
        {label == null ? "" : formatLabel(label)}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums text-popover-foreground">
              {entry.value == null ? "—" : formatValue(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function ChartCard({
  title,
  legend,
  action,
  children,
}: {
  title: string
  legend?: { color: string; label: string }[]
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between px-5 pb-3 pt-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-3">
          {legend?.map((l) => (
            <LegendDot key={l.label} color={l.color} label={l.label} />
          ))}
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">{children}</CardContent>
    </Card>
  )
}

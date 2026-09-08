"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  RequestHistoryPoint,
  TokenHistoryPoint,
} from "@/hooks/use-inference-metrics"

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  fontSize: "12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "8px 12px",
}

const TICK_STYLE = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
}

export function RequestsChart({ data }: { data: RequestHistoryPoint[] }) {
  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Requests</CardTitle>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-chart-1" />
              Success
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-destructive" />
              Failed
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            barGap={1}
            barCategoryGap="30%"
            margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="time"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "var(--accent)", opacity: 0.3, radius: 4 }}
            />
            <Bar
              dataKey="successful"
              name="Successful"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="failed"
              name="Failed"
              fill="var(--destructive)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function TokensChart({ data }: { data: TokenHistoryPoint[] }) {
  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Token Usage</CardTitle>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-chart-1" />
              Input
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-chart-3" />
              Output
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="time"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              width={42}
              tickFormatter={(v: number) => formatNum(v)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [formatNum(Number(v))]}
            />
            <Area
              type="monotone"
              dataKey="input"
              name="Input"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#inputGrad)"
            />
            <Area
              type="monotone"
              dataKey="output"
              name="Output"
              stroke="var(--chart-3)"
              strokeWidth={2}
              fill="url(#outputGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

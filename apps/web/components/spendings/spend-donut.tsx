"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
import { Panel } from "./panel"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatUsd, providerMeta } from "./provider-meta"

export interface ProviderSpendSlice {
  providerType: string
  costPerHour: number
}

// Donut of the current burn rate's split across providers. Zero-cost
// providers (e.g. Hot Aisle, which exposes no pricing) are left out of the
// donut but still appear elsewhere on the page.
export function SpendDonut({
  slices,
  isLoading,
}: {
  slices: ProviderSpendSlice[]
  isLoading: boolean
}) {
  const active = slices.filter((s) => s.costPerHour > 0)
  const total = active.reduce((sum, s) => sum + s.costPerHour, 0)

  const chartData = active.map((s) => ({
    provider: s.providerType,
    costPerHour: s.costPerHour,
    fill: `var(--color-${s.providerType})`,
  }))

  const chartConfig = active.reduce<ChartConfig>(
    (acc, s) => {
      const meta = providerMeta(s.providerType)
      acc[s.providerType] = { label: meta.label, color: meta.color }
      return acc
    },
    { costPerHour: { label: "Cost / hr" } },
  )

  return (
    <Panel title="Spend by provider" description="Share of the current hourly burn rate">
      <div className="flex flex-1 flex-col px-5 pb-4 pt-4">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <Skeleton className="size-44 rounded-full" />
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
            No active spend right now
          </div>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[230px] flex-1"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      nameKey="provider"
                      formatter={(value, name, item) => {
                        const type = String(
                          (item.payload as { provider?: string } | undefined)?.provider ?? name,
                        )
                        const cost = typeof value === "number" ? value : Number(value)
                        return (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">
                              {providerMeta(type).label}
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
                <Pie
                  data={chartData}
                  dataKey="costPerHour"
                  nameKey="provider"
                  innerRadius={62}
                  strokeWidth={2}
                  stroke="var(--card)"
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-xl font-semibold tabular-nums"
                            >
                              {formatUsd(total, { decimals: 3 })}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 20}
                              className="fill-muted-foreground text-xs"
                            >
                              per hour
                            </tspan>
                          </text>
                        )
                      }
                      return null
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="mt-2 space-y-1.5">
              {active
                .slice()
                .sort((a, b) => b.costPerHour - a.costPerHour)
                .map((s) => {
                  const meta = providerMeta(s.providerType)
                  const pct = total > 0 ? (s.costPerHour / total) * 100 : 0
                  return (
                    <div
                      key={s.providerType}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="flex-1 truncate">{meta.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                      <span className="w-24 text-right font-mono text-xs tabular-nums">
                        {formatUsd(s.costPerHour, { decimals: 3 })}/hr
                      </span>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

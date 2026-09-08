"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts"
import { Panel } from "./panel"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatUsd, providerMeta } from "./provider-meta"

export interface InstanceCostEntry {
  id: string
  name: string
  gpuName: string
  gpuCount: number
  status: string
  costPerHour: number
  uptimeMinutes: number | null
  providerType: string
  /** Deployment backing this instance, when one matches its provider id. */
  deploymentId: string | null
  deploymentName: string | null
}

const MAX_BARS = 10
const ROW_HEIGHT = 36

// Horizontal bars: $/hr per instance, colored by provider. Only instances
// that actually cost money are shown, most expensive first. Bars backed by a
// deployment navigate to it on click.
export function InstanceCostBars({
  instances,
  isLoading,
}: {
  instances: InstanceCostEntry[]
  isLoading: boolean
}) {
  const router = useRouter()

  const billed = instances
    .filter((i) => i.costPerHour > 0)
    .sort((a, b) => b.costPerHour - a.costPerHour)
  const shown = billed.slice(0, MAX_BARS)
  const hidden = billed.length - shown.length
  const hasDeploymentLinks = shown.some((i) => i.deploymentId != null)

  const chartData = shown.map((i) => ({
    ...i,
    label: i.name.length > 22 ? `${i.name.slice(0, 21)}…` : i.name,
  }))

  const chartConfig = shown.reduce<ChartConfig>(
    (acc, i) => {
      if (!acc[i.providerType]) {
        const meta = providerMeta(i.providerType)
        acc[i.providerType] = { label: meta.label, color: meta.color }
      }
      return acc
    },
    { costPerHour: { label: "Cost / hr" } },
  )

  return (
    <Panel
      title="Cost per instance"
      description={
        <>
          Hourly rate of billed instances{hidden > 0 ? ` (top ${MAX_BARS} of ${billed.length})` : ""}
          {hasDeploymentLinks ? " — click a bar to open its deployment" : ""}
        </>
      }
    >
      <div className="px-5 pb-4 pt-4">
        {isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            No billed instances running
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            style={{ height: shown.length * ROW_HEIGHT + 16 }}
            className="aspect-auto w-full"
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 56, top: 4, bottom: 4 }}
            >
              <XAxis type="number" dataKey="costPerHour" hide />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={150}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item.payload as unknown as InstanceCostEntry
                      const cost = typeof value === "number" ? value : Number(value)
                      const runTotal =
                        row.uptimeMinutes != null && row.uptimeMinutes > 0
                          ? cost * (row.uptimeMinutes / 60)
                          : null
                      return (
                        <div className="grid gap-1">
                          <span className="font-medium">{row.name}</span>
                          <span className="text-muted-foreground">
                            {row.gpuCount}× {row.gpuName} · {providerMeta(row.providerType).label}
                          </span>
                          {row.deploymentName && (
                            <span className="text-muted-foreground">
                              Deployment: {row.deploymentName}
                            </span>
                          )}
                          <span className="font-mono font-medium tabular-nums">
                            {formatUsd(cost, { decimals: 3 })}/hr · {row.status}
                          </span>
                          {runTotal != null && (
                            <span className="font-mono tabular-nums text-muted-foreground">
                              ≈ {formatUsd(runTotal)} this run
                            </span>
                          )}
                        </div>
                      )
                    }}
                  />
                }
              />
              <Bar
                dataKey="costPerHour"
                radius={4}
                className={hasDeploymentLinks ? "cursor-pointer" : undefined}
                onClick={(data) => {
                  const row = (data as { payload?: InstanceCostEntry }).payload
                  if (row?.deploymentId) {
                    router.push(`/dashboard/deployments/${row.deploymentId}`)
                  }
                }}
                label={{
                  position: "right",
                  formatter: (v: React.ReactNode) =>
                    typeof v === "number" ? formatUsd(v, { decimals: 3 }) : "",
                  fontSize: 11,
                  className: "fill-muted-foreground",
                }}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.id} fill={providerMeta(entry.providerType).color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  )
}

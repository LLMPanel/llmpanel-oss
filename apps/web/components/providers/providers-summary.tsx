import { MetricStrip, type Metric } from "@/components/deployments/metric-strip"
import type { ProvidersAggregate } from "@/hooks/use-providers-overview"

/**
 * Workspace totals across every connected provider. One surface rather than
 * four cards, and no per-tile icon chip or colour: these are four plain
 * numbers, not four categories that need telling apart by hue.
 */
export function ProvidersSummary({
  aggregate: a,
  loading,
}: {
  aggregate: ProvidersAggregate
  loading?: boolean
}) {
  const stats: Metric[] = [
    {
      label: "Providers",
      value: String(a.providerCount),
      sub: a.cloudCount > 0 ? `${a.healthyCount}/${a.cloudCount} live` : undefined,
    },
    {
      label: "Instances",
      value: (
        <>
          {a.runningInstances}
          <span className="text-muted-foreground">/{a.totalInstances}</span>
        </>
      ),
      sub: "running / total",
    },
    {
      label: "Spend",
      value: `$${a.totalCostPerHour.toFixed(2)}`,
      unit: "/hr",
      sub: "running instances",
    },
    {
      label: "Balance",
      value: a.hasBalance ? `$${a.totalBalance.toFixed(2)}` : "—",
      sub: a.hasBalance ? "across providers" : "not exposed",
    },
  ]

  return <MetricStrip metrics={stats} loading={loading} />
}

"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { Cloud, RefreshCw, AlertTriangle } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useProvidersOverview } from "@/hooks/use-providers-overview"
import { useSpendHistory } from "@/hooks/use-spend-history"
import { useDeployments } from "@/hooks/use-deployments"
import { SpendStatCards } from "@/components/spendings/spend-stat-cards"
import { SpendDonut, type ProviderSpendSlice } from "@/components/spendings/spend-donut"
import { SpendHistoryChart } from "@/components/spendings/spend-history-chart"
import { InstanceCostBars, type InstanceCostEntry } from "@/components/spendings/instance-cost-bars"
import { providerMeta } from "@/components/spendings/provider-meta"
import { integrateSpend } from "@/components/spendings/spend-math"

type RangeDays = "1" | "7" | "30"

const RANGES = [
  { value: "1", label: "24h" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
] as const satisfies readonly { value: RangeDays; label: string }[]

function formatRelative(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

/** Live "updated Xs ago" label that ticks without a full page re-fetch. */
function LastUpdated({ ts }: { ts: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), 10_000)
    return () => globalThis.clearInterval(id)
  }, [])
  if (ts == null) return null
  return (
    <span className="text-[12px] tabular-nums text-muted-foreground">
      Updated {formatRelative(ts, now)}
    </span>
  )
}

export default function SpendingsPage() {
  const { entries, aggregate, isLoading, isRefreshing, error, lastUpdated, refresh } =
    useProvidersOverview({ refreshIntervalMs: 30_000 })

  // The range drives both the "Spent" stat card and the history chart.
  const [rangeDays, setRangeDays] = useState<RangeDays>("7")
  const rangeLabel = RANGES.find((r) => r.value === rangeDays)?.label ?? `${rangeDays}d`
  const history = useSpendHistory(Number(rangeDays))

  const { deployments } = useDeployments()

  // Local providers cost nothing and are deliberately excluded — this page
  // is about cloud burn rate only.
  const cloudEntries = useMemo(
    () => entries.filter((e) => e.provider.providerType !== "local"),
    [entries],
  )

  // Accumulated $ over the selected range, integrated from the snapshots the
  // chart already fetches.
  const totalSpend = useMemo(() => integrateSpend(history.snapshots), [history.snapshots])

  // Provider instance id -> deployment, so instance bars can link through.
  const deploymentByExternalId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const d of deployments) {
      if (!d.externalId) continue
      map.set(d.externalId, {
        id: d.id,
        name: d.name ?? d.model?.name ?? d.huggingfaceId,
      })
    }
    return map
  }, [deployments])

  const slices = useMemo<ProviderSpendSlice[]>(() => {
    const byType = new Map<string, number>()
    for (const e of cloudEntries) {
      if (!e.stats) continue
      byType.set(
        e.provider.providerType,
        (byType.get(e.provider.providerType) ?? 0) + e.stats.totalCostPerHour,
      )
    }
    return [...byType.entries()].map(([providerType, costPerHour]) => ({
      providerType,
      costPerHour,
    }))
  }, [cloudEntries])

  const instances = useMemo<InstanceCostEntry[]>(
    () =>
      cloudEntries.flatMap((e) =>
        (e.stats?.instances ?? []).map((i) => {
          const deployment = deploymentByExternalId.get(i.id) ?? null
          return {
            id: `${e.provider.id}-${i.id}`,
            name: i.name,
            gpuName: i.gpuName,
            gpuCount: i.gpuCount,
            status: i.status,
            costPerHour: i.costPerHour,
            uptimeMinutes: i.uptimeMinutes,
            providerType: e.provider.providerType,
            deploymentId: deployment?.id ?? null,
            deploymentName: deployment?.name ?? null,
          }
        }),
      ),
    [cloudEntries, deploymentByExternalId],
  )

  const unreachable = cloudEntries.filter((e) => e.health === "error")
  const hasCloudProviders = cloudEntries.length > 0

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Spendings</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Live burn rate and balances across your cloud GPU providers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastUpdated ts={lastUpdated} />
          <SegmentedControl<RangeDays> label="Range" value={rangeDays} options={RANGES} onChange={setRangeDays} />
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-[12px] font-medium transition-transform active:scale-[0.96]"
            onClick={() => {
              void refresh()
              void history.refetch()
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {unreachable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-warning/10 px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Stats unavailable for{" "}
            {unreachable
              .map((e) => `${e.provider.name} (${providerMeta(e.provider.providerType).label})`)
              .join(", ")}
            {" — "}totals below exclude them.
          </span>
        </div>
      )}

      {!isLoading && !hasCloudProviders ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="flex flex-col items-center gap-5 px-6 py-20 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <Cloud className="size-6 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">No cloud providers yet</h3>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Connect RunPod or Vast.ai to start tracking spend.
            </p>
          </div>
          <Button asChild className="h-9 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[0.96]">
            <Link href="/dashboard/providers">Connect a Provider</Link>
          </Button>
        </motion.div>
      ) : (
        <>
          <SpendStatCards
            totalSpend={totalSpend}
            rangeLabel={rangeLabel}
            spendLoading={history.isLoading}
            totalCostPerHour={aggregate.totalCostPerHour}
            totalBalance={aggregate.totalBalance}
            hasBalance={aggregate.hasBalance}
            runningInstances={aggregate.runningInstances}
            totalInstances={aggregate.totalInstances}
            isLoading={isLoading}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <SpendDonut slices={slices} isLoading={isLoading} />
            <div className="lg:col-span-2">
              <SpendHistoryChart
                snapshots={history.snapshots}
                days={Number(rangeDays)}
                isLoading={history.isLoading}
              />
            </div>
          </div>

          <InstanceCostBars instances={instances} isLoading={isLoading} />
        </>
      )}
    </div>
    </MotionConfig>
  )
}

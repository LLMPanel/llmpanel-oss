"use client"

import { AnimatePresence, motion } from "motion/react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatUsd } from "./provider-meta"

// Average hours in a month (365.25 / 12 * 24) — matches how cloud GPU
// providers quote monthly pricing from hourly rates.
const HOURS_PER_MONTH = 730

interface StatCardProps {
  label: string
  value: string
  hint: string
  isLoading: boolean
}

/** One inset-grouped cell; the value cross-fades when it changes. */
function StatCard({ label, value, hint, isLoading }: StatCardProps) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <div className="relative mt-1 h-7 overflow-hidden">
        {isLoading ? (
          <Skeleton className="mt-1 h-5 w-24 rounded-md" />
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="truncate text-[22px] font-semibold leading-7 tracking-[-0.02em] tabular-nums"
            >
              {value}
            </motion.p>
          </AnimatePresence>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

export function SpendStatCards({
  totalSpend,
  rangeLabel,
  spendLoading,
  totalCostPerHour,
  totalBalance,
  hasBalance,
  runningInstances,
  totalInstances,
  isLoading,
}: {
  /** Accumulated spend over the selected range, integrated from snapshots. */
  totalSpend: number
  /** Human label of the selected range ("24h" | "7d" | "30d"). */
  rangeLabel: string
  spendLoading: boolean
  totalCostPerHour: number
  totalBalance: number
  hasBalance: boolean
  runningInstances: number
  totalInstances: number
  isLoading: boolean
}) {
  return (
    <section
      aria-label="Spend summary"
      className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] xl:grid-cols-4 xl:divide-y-0 dark:divide-white/[0.06] dark:ring-white/[0.06] [&>*:nth-child(-n+2)]:border-t-0"
    >
      <StatCard
        label={`Spent · ${rangeLabel}`}
        value={formatUsd(totalSpend)}
        hint="From 30‑min burn snapshots"
        isLoading={spendLoading}
      />
      <StatCard
        label="Current burn rate"
        value={`${formatUsd(totalCostPerHour, { decimals: 3 })}/hr`}
        hint={`${runningInstances} running · ${totalInstances} cloud instances`}
        isLoading={isLoading}
      />
      <StatCard
        label="Projected cost"
        value={`${formatUsd(totalCostPerHour * 24)}/day`}
        hint={`≈ ${formatUsd(totalCostPerHour * HOURS_PER_MONTH)}/month at current rate`}
        isLoading={isLoading}
      />
      <StatCard
        label="Remaining balance"
        value={hasBalance ? formatUsd(totalBalance) : "—"}
        hint={
          hasBalance
            ? totalCostPerHour > 0
              ? `≈ ${Math.floor(totalBalance / totalCostPerHour)}h of runtime left`
              : "No active spend drawing it down"
            : "No connected provider reports a balance"
        }
        isLoading={isLoading}
      />
    </section>
  )
}

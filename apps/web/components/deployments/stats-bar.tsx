"use client"

import { MetricStrip, type Metric } from "./metric-strip"
import type { Deployment } from "@/hooks/use-deployments"

const IN_PROGRESS = ["provisioning", "downloading", "loading", "health_check"]

/**
 * Counts by status above the project grid. One surface rather than four cards,
 * and each state is expressed once — a dot — instead of the icon chip, the
 * separate dot and the label all repeating it. A count of zero stands its dot
 * down to muted, so "Failed" only shows red when something has actually failed.
 */
export function StatsBar({ deployments }: { deployments: Deployment[] }) {
  const count = (match: (d: Deployment) => boolean) =>
    deployments.filter(match).length

  const stats: Metric[] = (
    [
      { label: "Running", value: count((d) => d.status === "running"), dot: "success" },
      {
        label: "Deploying",
        value: count((d) => IN_PROGRESS.includes(d.status)),
        dot: "primary",
      },
      { label: "Failed", value: count((d) => d.status === "failed"), dot: "destructive" },
      { label: "Stopped", value: count((d) => d.status === "stopped"), dot: "muted" },
    ] as const
  ).map(({ label, value, dot }) => ({
    label,
    value: String(value),
    dot: value === 0 ? "muted" : dot,
  }))

  return <MetricStrip metrics={stats} />
}

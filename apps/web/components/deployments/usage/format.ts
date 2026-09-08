import type { UsageBucket } from "@/hooks/use-deployment-usage"

/** Compact display: 1234 → "1.2K", 2_500_000 → "2.5M". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

/** Exact display with thousands separators, for tooltips and tables. */
export function formatExact(n: number): string {
  return n.toLocaleString("en-US")
}

export function formatLatency(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms >= 1_000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

/** Short axis tick for a series bucket: "14:00" for hours, "Jul 4" for days. */
export function formatBucketTick(iso: string, bucket: UsageBucket): string {
  const d = new Date(iso)
  if (bucket === "hour") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

/** Full tooltip label: "Jul 4, 14:00" for hours, "Jul 4, 2026" for days. */
export function formatBucketLabel(iso: string, bucket: UsageBucket): string {
  const d = new Date(iso)
  if (bucket === "hour") {
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

export const PERIOD_LABELS = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
} as const

// ── Period-over-period deltas ────────────────────────────────────────

export interface Delta {
  /** Signed display string, e.g. "+12.4%" or "−0.8 pp". Null when not comparable. */
  label: string | null
  direction: "up" | "down" | "flat"
}

/** Relative change between two counts. Returns null label when the previous window is empty. */
export function relativeDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    return current === 0
      ? { label: null, direction: "flat" }
      : { label: "new", direction: "up" }
  }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) return { label: "±0%", direction: "flat" }
  const sign = pct > 0 ? "+" : "−"
  return {
    label: `${sign}${Math.abs(pct).toFixed(1)}%`,
    direction: pct > 0 ? "up" : "down",
  }
}

/** Percentage-point change between two rates given as fractions of 0–100. */
export function pointsDelta(currentRate: number, previousRate: number, hadPrevious: boolean): Delta {
  if (!hadPrevious) return { label: null, direction: "flat" }
  const diff = currentRate - previousRate
  if (Math.abs(diff) < 0.05) return { label: "±0 pp", direction: "flat" }
  const sign = diff > 0 ? "+" : "−"
  return {
    label: `${sign}${Math.abs(diff).toFixed(1)} pp`,
    direction: diff > 0 ? "up" : "down",
  }
}

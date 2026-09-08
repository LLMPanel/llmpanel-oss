// Formatters for the metrics history charts (numeric epoch-ms X axis).
// Usage-page formatters (ISO-string buckets) live in ../usage/format.ts.
export { formatCompact, formatExact, formatLatency } from "../usage/format"

export type MetricsWindow = "1h" | "6h" | "24h"

/** Axis tick for an epoch-ms point: time-of-day ("14:23"). */
export function formatTimeTick(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Full tooltip label: "Jul 4, 14:23". */
export function formatTimeLabel(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function formatGb(gb: number): string {
  if (gb >= 100) return `${Math.round(gb)} GB`
  return `${(Math.round(gb * 10) / 10).toLocaleString("en-US")} GB`
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

export function formatWatts(w: number): string {
  return `${Math.round(w)} W`
}

export function formatCelsius(c: number): string {
  return `${Math.round(c)}°C`
}

/** "2d 4h", "3h 12m", "45m", "30s" */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

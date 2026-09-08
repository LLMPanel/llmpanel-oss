"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type MetricsWindow = "1h" | "6h" | "24h"

export interface MetricsCapabilities {
  gpuUtilization: boolean
  vram: boolean
  temperature: boolean
  power: boolean
  clocks: boolean
  perGpu: boolean
  container: boolean
  uptime: boolean
  costPerHour: boolean
}

export interface PerGpuHistoryPoint {
  index: number
  gpuUtilization: number | null
  vramUsedGb: number | null
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  clockSmMhz: number | null
}

export interface MetricsHistoryPoint {
  /** Bucket start, epoch ms. */
  t: number
  gpuUtilization: number | null
  vramUsedGb: number | null
  vramTotalGb: number | null
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  containerCpuPercent: number | null
  containerMemoryPercent: number | null
  /** Collector samples in this bucket — 0 marks a gap. */
  samples: number
  /** Per-GPU bucket averages — present only when requested with perGpu. */
  gpus?: PerGpuHistoryPoint[]
}

export interface MetricsHistory {
  window: MetricsWindow
  bucketSeconds: number
  since: string
  until: string
  capabilities: MetricsCapabilities | null
  points: MetricsHistoryPoint[]
}

const DEFAULT_REFRESH_MS = 30_000

export function useMetricsHistory(
  deploymentId: string,
  window: MetricsWindow,
  opts?: { refreshIntervalMs?: number | false; perGpu?: boolean },
) {
  const [history, setHistory] = useState<MetricsHistory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Track the requested window so a stale slow response can't overwrite
  // the data for a newer selection.
  const requestedWindow = useRef(window)

  const perGpu = opts?.perGpu ?? false

  const fetchHistory = useCallback(async () => {
    requestedWindow.current = window
    try {
      const res = await globalThis.fetch(
        `/api/v1/metrics/deployments/${deploymentId}/history?window=${window}${perGpu ? "&perGpu=1" : ""}`,
        { credentials: "include" },
      )
      if (requestedWindow.current !== window) return
      if (!res.ok) {
        setError("Failed to load metrics history")
        return
      }
      const data = (await res.json()) as { history: MetricsHistory }
      if (requestedWindow.current !== window) return
      setHistory(data.history)
      setError(null)
    } catch {
      if (requestedWindow.current === window) setError("Failed to load metrics history")
    } finally {
      if (requestedWindow.current === window) setIsLoading(false)
    }
  }, [deploymentId, window, perGpu])

  useEffect(() => {
    setIsLoading(true)
    void fetchHistory()

    const refreshMs = opts?.refreshIntervalMs ?? DEFAULT_REFRESH_MS
    if (refreshMs === false) return

    const interval = setInterval(() => void fetchHistory(), refreshMs)
    return () => clearInterval(interval)
  }, [fetchHistory, opts?.refreshIntervalMs])

  return { history, isLoading, error, refetch: fetchHistory }
}

"use client"

import { useState, useEffect, useRef } from "react"
import type { MetricsCapabilities } from "./use-metrics-history"

export type { MetricsCapabilities }

// Nullable fields mean "this provider cannot report it", never zero —
// the UI hides those cards/rows via `capabilities`.
export interface SingleGpuMetrics {
  index: number
  name: string
  uuid: string
  gpuUtilization: number
  memoryUtilization: number
  vramUsedGb: number
  vramTotalGb: number
  vramFreeGb: number
  temperatureCelsius: number | null
  temperatureMemoryCelsius: number | null
  fanSpeedPercent: number | null
  powerDrawWatts: number | null
  powerLimitWatts: number | null
  clockGraphicsMhz: number | null
  clockMemoryMhz: number | null
  clockSmMhz: number | null
  pcieGen: number | null
  pcieLinkWidth: number | null
  eccErrors: number | null
}

export interface GpuMetrics {
  gpuCount: number
  gpuUtilization: number
  vramUsedGb: number
  vramTotalGb: number
  vramUsedPercent: number
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  containerCpuPercent: number | null
  containerMemoryPercent: number | null
  uptimeSeconds: number | null
  costPerHour: number | null
  gpus: SingleGpuMetrics[]
  requestsPerMinute: number
  averageLatencyMs: number
  tokensLastFiveMinutes: number
}

export function useGpuMetrics(deploymentId: string, status: string) {
  const [metrics, setMetrics] = useState<GpuMetrics | null>(null)
  const [capabilities, setCapabilities] = useState<MetricsCapabilities | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status !== "running") {
      setMetrics(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const fetchMetrics = async () => {
      try {
        const res = await globalThis.fetch(`/api/v1/metrics/deployments/${deploymentId}`, {
          credentials: "include",
        })
        if (!res.ok) {
          setIsLoading(false)
          return
        }
        const data = (await res.json()) as {
          metrics: GpuMetrics
          capabilities: MetricsCapabilities | null
        }
        setMetrics(data.metrics)
        setCapabilities(data.capabilities ?? null)
        setIsLoading(false)
      } catch {
        // silently fail — metrics are best-effort
      }
    }

    setIsLoading(true)
    void fetchMetrics()
    intervalRef.current = setInterval(fetchMetrics, 5000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [deploymentId, status])

  return { metrics, capabilities, isLoading }
}

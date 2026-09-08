"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export type UsagePeriod = "24h" | "7d" | "30d" | "90d"
export type UsageBucket = "hour" | "day"

export interface UsageSeriesPoint {
  /** Bucket start as UTC ISO string. */
  bucket: string
  requests: number
  successful: number
  clientErrors: number
  serverErrors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

export interface UsageTotals {
  totalRequests: number
  successfulRequests: number
  clientErrors: number
  serverErrors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageLatencyMs: number
  /** Generation throughput: completion tokens ÷ wall time of the requests that produced them. */
  tokensPerSecond: number
  latency: {
    p50: number
    p95: number
    p99: number
  }
}

export type UsagePreviousTotals = UsageTotals

export interface ModelUsageBreakdown {
  model: string
  requests: number
  errors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

export interface ApiKeyUsageBreakdown {
  apiKeyId: string | null
  name: string | null
  prefix: string | null
  requests: number
  errors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

export interface DeploymentUsage {
  period: UsagePeriod
  bucket: UsageBucket
  since: string
  until: string
  previousSince: string
  totals: UsageTotals
  previousTotals: UsagePreviousTotals
  series: UsageSeriesPoint[]
  byModel: ModelUsageBreakdown[]
  byApiKey: ApiKeyUsageBreakdown[]
}

interface UseDeploymentUsageOptions {
  /** Poll interval in ms. 0 or undefined disables polling. */
  refreshIntervalMs?: number
}

export function useDeploymentUsage(
  deploymentId: string,
  period: UsagePeriod = "7d",
  apiKeyId?: string,
  { refreshIntervalMs }: UseDeploymentUsageOptions = {},
) {
  const [data, setData] = useState<DeploymentUsage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // Distinguishes the initial load / filter change (skeleton) from a
  // background refresh (keep the current charts on screen).
  const hasDataRef = useRef(false)

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const silent = opts.silent && hasDataRef.current
      if (silent) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError(null)
      try {
        const params = new URLSearchParams({ period, deploymentId })
        if (apiKeyId) params.set("apiKeyId", apiKeyId)
        const res = await globalThis.fetch(`/api/v1/analytics/usage?${params}`, {
          credentials: "include",
        })
        if (!res.ok) throw new Error(`Failed to fetch usage data (${res.status})`)
        const json = (await res.json()) as { usage: DeploymentUsage }
        setData(json.usage)
        setUpdatedAt(new Date())
        hasDataRef.current = true
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error")
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [deploymentId, period, apiKeyId],
  )

  // Filter change → full reload with skeleton.
  useEffect(() => {
    hasDataRef.current = false
    void load()
  }, [load])

  // Optional background polling.
  useEffect(() => {
    if (!refreshIntervalMs) return
    const timer = setInterval(() => void load({ silent: true }), refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refreshIntervalMs, load])

  const refetch = useCallback(() => load({ silent: true }), [load])

  return { data, isLoading, isRefreshing, error, updatedAt, refetch }
}

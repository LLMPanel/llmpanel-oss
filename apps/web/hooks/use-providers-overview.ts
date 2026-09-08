"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Provider } from "@/hooks/use-providers"
import type { ProviderStats } from "@/hooks/use-provider-stats"
import { isCloudProviderType } from "@/lib/provider-registry"

/**
 * Per-provider live health, derived from whether its `/stats` call succeeds.
 * - `ok`      — stats fetched cleanly (or a local provider that needs none)
 * - `error`   — the provider API was unreachable / returned an error
 * - `loading` — first fetch still in flight
 */
export type ProviderHealth = "ok" | "error" | "loading"

export interface ProviderEntry {
  provider: Provider
  stats: ProviderStats | null
  health: ProviderHealth
  error: string | null
}

export interface ProvidersAggregate {
  /** Sum of exposed balances (only some APIs expose one, e.g. Vast.ai). */
  totalBalance: number
  /** Whether *any* connected provider exposed a balance figure. */
  hasBalance: boolean
  totalInstances: number
  runningInstances: number
  totalCostPerHour: number
  providerCount: number
  cloudCount: number
  /** Cloud providers whose live stats resolved without error. */
  healthyCount: number
}

function isCloud(p: Provider): boolean {
  return isCloudProviderType(p.providerType)
}

async function fetchProviders(signal: AbortSignal): Promise<Provider[]> {
  const res = await globalThis.fetch("/api/v1/providers", {
    credentials: "include",
    signal,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  const data = (await res.json()) as { providers: Provider[] }
  return data.providers
}

async function fetchStats(
  id: string,
  signal: AbortSignal,
): Promise<{ stats: ProviderStats | null; error: string | null }> {
  try {
    const res = await globalThis.fetch(`/api/v1/providers/${id}/stats`, {
      credentials: "include",
      signal,
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { stats: null, error: body.error ?? `Request failed (${res.status})` }
    }
    const data = (await res.json()) as { stats: ProviderStats }
    return { stats: data.stats, error: null }
  } catch (e) {
    if (signal.aborted) return { stats: null, error: null }
    return {
      stats: null,
      error: e instanceof Error ? e.message : "Failed to fetch stats",
    }
  }
}

function aggregate(entries: ProviderEntry[]): ProvidersAggregate {
  let totalBalance = 0
  let hasBalance = false
  let totalInstances = 0
  let runningInstances = 0
  let totalCostPerHour = 0
  let cloudCount = 0
  let healthyCount = 0

  for (const e of entries) {
    if (isCloud(e.provider)) {
      cloudCount += 1
      if (e.health === "ok") healthyCount += 1
    }
    const s = e.stats
    if (!s) continue
    if (s.balance != null) {
      totalBalance += s.balance
      hasBalance = true
    }
    totalInstances += s.totalInstances
    runningInstances += s.runningInstances
    totalCostPerHour += s.totalCostPerHour
  }

  return {
    totalBalance,
    hasBalance,
    totalInstances,
    runningInstances,
    totalCostPerHour,
    providerCount: entries.length,
    cloudCount,
    healthyCount,
  }
}

/**
 * The providers dashboard's single source of truth.
 *
 * Fetches the provider list, then fans out one `/stats` request per cloud
 * provider in parallel — the API exposes no aggregate endpoint, so the summing
 * happens here. Preloading stats (rather than lazily on card-expand) is what
 * lets the page show a live KPI bar and inline per-card figures.
 *
 * Auto-refreshes on an interval; `refresh()` forces an immediate reload.
 */
export function useProvidersOverview(options?: { refreshIntervalMs?: number }) {
  const refreshIntervalMs = options?.refreshIntervalMs ?? 30_000

  const [entries, setEntries] = useState<ProviderEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  // Track the in-flight load so a manual refresh can cancel a stale one.
  const abortRef = useRef<AbortController | null>(null)
  const didInitialLoad = useRef(false)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    if (didInitialLoad.current) setIsRefreshing(true)
    else setIsLoading(true)
    setError(null)

    try {
      const providers = await fetchProviders(signal)
      if (signal.aborted) return

      // Seed entries immediately so the list paints before stats resolve.
      setEntries(
        providers.map((provider) => ({
          provider,
          stats: null,
          health: isCloud(provider) ? "loading" : "ok",
          error: null,
        })),
      )

      const cloud = providers.filter(isCloud)
      const statsList = await Promise.all(
        cloud.map((p) => fetchStats(p.id, signal)),
      )
      if (signal.aborted) return

      const statsById = new Map(cloud.map((p, i) => [p.id, statsList[i]]))
      setEntries(
        providers.map((provider) => {
          if (!isCloud(provider)) {
            return { provider, stats: null, health: "ok", error: null }
          }
          const r = statsById.get(provider.id)
          return {
            provider,
            stats: r?.stats ?? null,
            health: r?.error ? "error" : "ok",
            error: r?.error ?? null,
          }
        }),
      )
      setLastUpdated(Date.now())
    } catch (e) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e.message : "Failed to load providers")
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false)
        setIsRefreshing(false)
        didInitialLoad.current = true
      }
    }
  }, [])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  // Background auto-refresh. Skipped when the tab is hidden to avoid wasted
  // calls; a fresh reload fires as soon as it becomes visible again.
  useEffect(() => {
    if (refreshIntervalMs <= 0) return
    const id = globalThis.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      void load()
    }, refreshIntervalMs)
    return () => globalThis.clearInterval(id)
  }, [refreshIntervalMs, load])

  return {
    entries,
    aggregate: aggregate(entries),
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh: load,
  }
}

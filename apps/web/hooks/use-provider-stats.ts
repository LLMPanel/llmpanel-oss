"use client"

import { useState, useEffect, useCallback } from "react"

export interface ProviderInstance {
  id: string
  name: string
  gpuName: string
  gpuCount: number
  status: string
  costPerHour: number
  uptimeMinutes: number | null
  publicIp: string | null
  datacenter: string | null
}

export interface ProviderStats {
  providerType:
    | "runpod"
    | "vastai"
    | "hotaisle"
    | "lambdalabs"
    | "tensordock"
    | "datacrunch"
    | "hyperstack"
  balance: number | null
  balanceCurrency: string
  totalInstances: number
  runningInstances: number
  totalCostPerHour: number
  instances: ProviderInstance[]
}

export function useProviderStats(
  providerId: string | null,
  options?: { refreshIntervalMs?: number },
) {
  const refreshIntervalMs = options?.refreshIntervalMs
  const [stats, setStats] = useState<ProviderStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!providerId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(`/api/v1/providers/${providerId}/stats`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const data = (await res.json()) as { stats: ProviderStats }
      setStats(data.stats)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch stats")
    } finally {
      setIsLoading(false)
    }
  }, [providerId])

  useEffect(() => { void load() }, [load])

  // Optional background polling — off unless a positive interval is supplied.
  useEffect(() => {
    if (!providerId || !refreshIntervalMs || refreshIntervalMs <= 0) return
    const id = globalThis.setInterval(() => { void load() }, refreshIntervalMs)
    return () => globalThis.clearInterval(id)
  }, [providerId, refreshIntervalMs, load])

  return { stats, isLoading, error, refetch: load }
}

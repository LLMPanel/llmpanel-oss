"use client"

import { useState, useEffect, useCallback } from "react"

export interface SpendSnapshotPoint {
  providerConnectionId: string
  providerType: string
  timestamp: string // ISO
  costPerHour: number
  balance: number | null
  runningInstances: number
  totalInstances: number
}

export function useSpendHistory(days: number) {
  const [snapshots, setSnapshots] = useState<SpendSnapshotPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(`/api/v1/spendings/history?days=${days}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const data = (await res.json()) as { snapshots: SpendSnapshotPoint[] }
      setSnapshots(data.snapshots)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch spend history")
    } finally {
      setIsLoading(false)
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  return { snapshots, isLoading, error, refetch: load }
}

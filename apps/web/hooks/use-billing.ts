"use client"

import { useCallback, useEffect, useState } from "react"

export interface BillingQuota {
  planId: string
  planName: string
  priceUsd: number
  used: number
  included: number
  overage: number
  canCreate: boolean
  nextDeploymentUsd: number
  status: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

export interface BillingPlan {
  id: string
  name: string
  slug: string
  description: string
  priceUsd: number
  includedDeployments: number
  overageUsd: number | null
}

export interface BillingSeats {
  members: number
  pendingInvitations: number
  used: number
  /** null = unlimited. */
  max: number | null
  canAddMember: boolean
  denialReason: string | null
}

interface BillingSummary {
  enabled: boolean
  quota: BillingQuota | null
  seats: BillingSeats | null
  plans: BillingPlan[]
}

/**
 * Billing state for the active workspace.
 *
 * `enabled` is false on self-hosted installs — the endpoint answers 200 with
 * empty data rather than erroring, so callers hide billing UI on that flag
 * instead of on a failed request.
 */
export function useBilling() {
  const [data, setData] = useState<BillingSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await globalThis.fetch("/api/v1/billing/summary", {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to load billing")
      setData((await res.json()) as BillingSummary)
      setError(null)
    } catch {
      setError("Could not load billing information.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return {
    enabled: data?.enabled ?? false,
    quota: data?.quota ?? null,
    seats: data?.seats ?? null,
    plans: data?.plans ?? [],
    isLoading,
    error,
    refetch,
  }
}

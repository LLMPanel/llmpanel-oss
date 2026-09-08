"use client"

import { useCallback, useEffect, useState } from "react"

export type RunpodCloudType = "secure" | "community"

export type AvailabilityLevel = "high" | "medium" | "low" | "none" | "unknown"

export interface OfferAvailability {
  level: AvailabilityLevel
  /** Machine count when the provider reports one; null for coarse stock levels (RunPod). */
  availableCount: number | null
  /** Human-readable raw detail, e.g. "Secure: High · Community: Low". */
  detail: string | null
}

export interface ProviderCatalogOffer {
  id: string
  gpuType: string
  displayName: string
  gpuCount: number
  vramGb: number
  /** Secure-cloud price for RunPod; the single price for other providers. */
  pricePerHour: number | null
  tflops: number | null
  datacenter: string | null
  /** Normalized availability — optional so local/synthetic offers can omit it. */
  availability?: OfferAvailability
  // RunPod only — null/undefined elsewhere. A null price means the GPU
  // isn't offered in that cloud.
  communityPricePerHour?: number | null
  secureStock?: string | null
  communityStock?: string | null
}

interface ProviderCatalogResponse {
  offers: ProviderCatalogOffer[]
}

export function useProviderCatalog(providerId: string | null, gpuCount?: number) {
  const [offers, setOffers] = useState<ProviderCatalogOffer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!providerId) {
      setOffers([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      // Stock/offers are per machine size — refetch when the count changes.
      const params = gpuCount ? `?gpuCount=${gpuCount}` : ""
      const res = await globalThis.fetch(`/api/v1/providers/${providerId}/catalog${params}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? `Request failed (${res.status})`)
      }
      const payload = (await res.json()) as ProviderCatalogResponse
      setOffers(payload.offers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch provider catalog")
      setOffers([])
    } finally {
      setIsLoading(false)
    }
  }, [providerId, gpuCount])

  useEffect(() => {
    void load()
  }, [load])

  return { offers, isLoading, error, refetch: load }
}

// Shared contract for provider GPU catalogs. Adding a new neocloud provider =
// one adapter file implementing CatalogAdapter + a registry entry in index.ts.

export type AvailabilityLevel = "high" | "medium" | "low" | "none" | "unknown"

export interface OfferAvailability {
  level: AvailabilityLevel
  /** Machine count when the provider reports one; null for coarse stock levels (RunPod). */
  availableCount: number | null
  /** Human-readable raw detail, e.g. "Secure: High · Community: Low" or "12 machines rentable". */
  detail: string | null
}

export interface CatalogOffer {
  id: string
  gpuType: string
  displayName: string
  gpuCount: number
  vramGb: number
  pricePerHour: number | null
  tflops: number | null
  datacenter: string | null
  availability: OfferAvailability
  // RunPod only: per-cloud pricing/stock. pricePerHour stays the Secure
  // price so existing sort/filter behavior is unchanged for other providers.
  communityPricePerHour?: number | null
  secureStock?: string | null
  communityStock?: string | null
}

export interface CatalogFetchOptions {
  /** Check stock/offers for this many GPUs per machine; adapters default to 1. */
  gpuCount?: number
}

export interface CatalogAdapter {
  fetchCatalog(apiKey: string, options?: CatalogFetchOptions): Promise<CatalogOffer[]>
}

/** Map a reported machine count to a coarse availability level. */
export function levelFromCount(count: number): AvailabilityLevel {
  if (count >= 10) return "high"
  if (count >= 4) return "medium"
  if (count >= 1) return "low"
  return "none"
}

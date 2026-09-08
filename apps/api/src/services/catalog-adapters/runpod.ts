import { runpodRestV2 } from "@llmpanel/providers"
import type {
  AvailabilityLevel,
  CatalogAdapter,
  CatalogFetchOptions,
  CatalogOffer,
} from "./types"

/**
 * RunPod GPU catalog, from REST v2 `GET /v2/catalog/gpus`.
 *
 * This replaces a GraphQL `gpuTypes { lowestPrice { stockStatus } }` query and
 * the hand-mirrored id allowlist it needed: v1 had no catalog endpoint, so the
 * deployable-id list lived in `gpu-types.ts` and drifted (it was missing 9 real
 * GPUs and listed 8 that no longer exist). The catalog reports deployability
 * directly.
 */

interface CatalogGpu {
  id: string
  name?: string | null
  memory?: number | null
  availability?: string | null
  price?: { secure?: number | null; community?: number | null } | null
  maxCount?: { secure?: number | null; community?: number | null } | null
  dataCenters?: Array<{ id?: string | null }> | null
}

// v2 reports stock as HIGH|MEDIUM|LOW|NONE where v1's GraphQL used
// High|Medium|Low with null for "none".
const STOCK_LEVEL: Record<string, AvailabilityLevel> = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none",
}

const LEVEL_RANK: Record<AvailabilityLevel, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
  none: 0,
}

/** Maps the raw catalog value (HIGH|MEDIUM|LOW|NONE), never the display label. */
function stockToLevel(availability: string | null | undefined): AvailabilityLevel {
  return availability ? STOCK_LEVEL[availability] ?? "unknown" : "unknown"
}

/**
 * The stock string the UI shows, and tests for null to grey an offer out.
 *
 * `NONE` becomes null so "out of stock" keeps reading as absent stock, exactly
 * as v1's null `stockStatus` did, and the level is title-cased so the badge
 * text doesn't change from "High" to "HIGH".
 */
function stockLabel(availability: string | null | undefined): string | null {
  if (!availability || availability === "NONE") return null
  return availability.charAt(0) + availability.slice(1).toLowerCase()
}

/** RunPod reports $0 for clouds where a GPU isn't offered — map to null. */
const price = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null)

function isDeployable(gpu: CatalogGpu): boolean {
  return (
    gpu.id !== "unknown" &&
    ((gpu.maxCount?.secure ?? 0) > 0 || (gpu.maxCount?.community ?? 0) > 0)
  )
}

function datacenterLabel(gpu: CatalogGpu): string | null {
  const ids = (gpu.dataCenters ?? []).flatMap((d) => (d.id ? [d.id] : []))
  if (ids.length === 0) return null
  // An offer spans every datacenter carrying that GPU, so naming one would be
  // misleading once there is more than one.
  return ids.length === 1 ? (ids[0] as string) : `${ids.length} datacenters`
}

export const runpodCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string, options?: CatalogFetchOptions): Promise<CatalogOffer[]> {
    // Stock is per GPU count — 8× machines are often out even when 1× is
    // plentiful — and per cloud, which the catalog only reports one at a time.
    // Two filtered calls keep the per-cloud fidelity the deploy flow shows.
    const gpuCount = Math.min(Math.max(Math.trunc(options?.gpuCount ?? 1), 1), 8)
    const path = (cloud: string) =>
      `/v2/catalog/gpus?include=AVAILABILITY&product=POD&count=${gpuCount}&cloud=${cloud}`

    const [secure, community] = await Promise.all([
      runpodRestV2<{ gpus?: CatalogGpu[] }>(apiKey, "GET", path("SECURE")),
      runpodRestV2<{ gpus?: CatalogGpu[] }>(apiKey, "GET", path("COMMUNITY")),
    ])

    const communityAvailability = new Map(
      (community.gpus ?? []).map((g) => [g.id, g.availability ?? null]),
    )

    return (secure.gpus ?? [])
      .filter(isDeployable)
      .map((gpu) => {
        const securePrice = price(gpu.price?.secure)
        const communityPrice = price(gpu.price?.community)
        const secureAvailability = gpu.availability ?? null
        const communityAvail = communityAvailability.get(gpu.id) ?? null
        const secureStock = stockLabel(secureAvailability)
        const communityStock = stockLabel(communityAvail)

        // Only clouds that actually offer the GPU count toward availability.
        const levels: AvailabilityLevel[] = []
        const details: string[] = []
        if (securePrice != null) {
          levels.push(stockToLevel(secureAvailability))
          if (secureStock) details.push(`Secure: ${secureStock}`)
        }
        if (communityPrice != null) {
          levels.push(stockToLevel(communityAvail))
          if (communityStock) details.push(`Community: ${communityStock}`)
        }

        const level: AvailabilityLevel =
          levels.length === 0
            ? "none"
            : levels.reduce((best, l) => (LEVEL_RANK[l] > LEVEL_RANK[best] ? l : best))

        return {
          id: gpu.id,
          gpuType: gpu.id,
          displayName: gpu.name ?? gpu.id,
          gpuCount: 1,
          vramGb: gpu.memory ?? 0,
          pricePerHour: securePrice,
          tflops: null,
          datacenter: datacenterLabel(gpu),
          availability: {
            level,
            availableCount: null,
            detail: details.length > 0 ? details.join(" · ") : null,
          },
          communityPricePerHour: communityPrice,
          secureStock,
          communityStock,
        }
      })
  },
}

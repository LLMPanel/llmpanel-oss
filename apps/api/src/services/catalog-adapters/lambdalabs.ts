import type { CatalogAdapter, CatalogOffer, AvailabilityLevel } from "./types"

interface LambdaInstanceTypeEntry {
  instance_type: {
    name: string
    description: string
    gpu_description: string
    price_cents_per_hour: number
    specs: { vcpus: number; memory_gib: number; storage_gib: number; gpus: number }
  }
  regions_with_capacity_available: Array<{ name: string; description: string }>
}

/** Per-GPU VRAM from a description like "H100 (80 GB SXM5)". */
function parseVramGb(gpuDescription: string): number {
  const m = /(\d+(?:\.\d+)?)\s*GB/i.exec(gpuDescription)
  return m ? Number(m[1]) : 0
}

/** Lambda reports capacity as regions-with-capacity, not machine counts. */
function levelFromRegions(regionCount: number): AvailabilityLevel {
  if (regionCount >= 4) return "high"
  if (regionCount >= 2) return "medium"
  if (regionCount >= 1) return "low"
  return "none"
}

export const lambdalabsCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string): Promise<CatalogOffer[]> {
    const res = await fetch("https://cloud.lambda.ai/api/v1/instance-types", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      throw new Error(`Lambda Cloud API error: ${res.status} ${res.statusText}`)
    }

    const body = (await res.json()) as { data: Record<string, LambdaInstanceTypeEntry> }

    return Object.values(body.data).map((entry) => {
      const t = entry.instance_type
      const regions = entry.regions_with_capacity_available
      return {
        // The instance-type name doubles as the deploy-time gpuType — the
        // provider resolves it back to a launchable type by exact match.
        id: t.name,
        gpuType: t.name,
        displayName: t.description,
        gpuCount: t.specs.gpus,
        vramGb: parseVramGb(t.gpu_description),
        pricePerHour: t.price_cents_per_hour / 100,
        tflops: null,
        datacenter: regions[0]?.name ?? null,
        availability: {
          level: levelFromRegions(regions.length),
          availableCount: regions.length,
          detail:
            regions.length > 0
              ? `Capacity in ${regions.length} region${regions.length === 1 ? "" : "s"}: ${regions
                  .map((r) => r.name)
                  .join(", ")}`
              : "No capacity in any region right now",
        },
      }
    })
  },
}

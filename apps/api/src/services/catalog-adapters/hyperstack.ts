import type { CatalogAdapter, CatalogOffer } from "./types"
import { hyperstackRequest } from "@llmpanel/providers"

interface HSFlavor {
  id: number
  name: string
  region_name: string
  cpu: number
  ram: number
  disk: number
  gpu: string
  gpu_count: number
  stock_available: boolean
}

interface HSFlavorGroup {
  gpu: string
  region_name: string
  flavors: HSFlavor[]
}

interface HSPricebookEntry {
  name: string
  value: string
}

/** Per-GPU VRAM parsed out of a model name like "H100-80G-PCIe". */
function parseGpuVram(gpuModel: string): number {
  const m = /-(\d+)G\b/i.exec(gpuModel)
  if (m) return Number(m[1])
  const known: Record<string, number> = {
    "RTX-A6000": 48,
    "RTX-A4000": 16,
    L40: 48,
    "RTX-PRO6000-SE": 96,
    "B200-SXM": 192,
  }
  return known[gpuModel] ?? 0
}

export const hyperstackCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string): Promise<CatalogOffer[]> {
    const flavorsRes = await hyperstackRequest<{ data: HSFlavorGroup[] }>(
      apiKey,
      "GET",
      "/core/flavors",
    )

    // The pricebook is a bare array (no {status,message} envelope) of per-GPU
    // hourly rates keyed by GPU model name.
    let prices = new Map<string, number>()
    try {
      const entries = await hyperstackRequest<HSPricebookEntry[]>(apiKey, "GET", "/pricebook")
      prices = new Map(
        entries
          .map((e) => [e.name, Number(e.value)] as const)
          .filter(([, v]) => Number.isFinite(v)),
      )
    } catch {
      // Pricing is informational — an offer without it is still selectable.
    }

    const flavors = flavorsRes.data.flatMap((group) =>
      group.flavors.map((f) => ({
        ...f,
        gpu: f.gpu || group.gpu,
        region_name: f.region_name || group.region_name,
      })),
    )

    return flavors
      .filter((f) => f.gpu_count > 0)
      .map((f) => {
        const perGpu = prices.get(f.gpu)
        return {
          id: f.name,
          gpuType: f.name,
          displayName: `${f.gpu} ×${f.gpu_count}`,
          gpuCount: f.gpu_count,
          vramGb: parseGpuVram(f.gpu),
          // Pricebook rates are per GPU, so an 8× flavor costs 8× the rate.
          pricePerHour: perGpu != null ? perGpu * f.gpu_count : null,
          tflops: null,
          datacenter: f.region_name,
          availability: f.stock_available
            ? { level: "high" as const, availableCount: null, detail: `In stock in ${f.region_name}` }
            : { level: "none" as const, availableCount: 0, detail: `Out of stock in ${f.region_name}` },
        }
      })
  },
}

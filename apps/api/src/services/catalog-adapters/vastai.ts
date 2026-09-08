import {
  levelFromCount,
  type CatalogAdapter,
  type CatalogFetchOptions,
  type CatalogOffer,
} from "./types"

interface VastBundleOffer {
  id: number
  gpu_name: string
  gpu_ram: number
  dph_total: number
  num_gpus?: number
  rentable?: boolean
  geolocation?: string
  datacenter?: string
  machine_id?: number
  dlperf?: number
  flops_per_dphtotal?: number
}

interface VastBundlesResponse {
  offers?: VastBundleOffer[]
}

export const vastaiCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string, options?: CatalogFetchOptions): Promise<CatalogOffer[]> {
    // When a GPU count is requested, only list machines with exactly that many
    // GPUs — the provisioner searches with num_gpus eq at deploy time, so
    // anything else in the list would fail to deploy.
    const gpuCount = options?.gpuCount
      ? Math.min(Math.max(Math.trunc(options.gpuCount), 1), 8)
      : null
    const searchQuery = JSON.stringify({
      rentable: { eq: true },
      ...(gpuCount != null ? { num_gpus: { eq: gpuCount } } : {}),
      order: [["dph_total", "asc"]],
      limit: 300,
    })
    const res = await fetch(
      `https://console.vast.ai/api/v0/bundles/?q=${encodeURIComponent(searchQuery)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    )

    if (!res.ok) {
      throw new Error(`Vast.ai API error: ${res.status} ${res.statusText}`)
    }

    const payload = (await res.json()) as VastBundlesResponse
    const rentable = (payload.offers ?? []).filter(
      (offer) => offer.rentable !== false
    )

    // Every Vast offer is a live rentable machine, so availability per GPU
    // model = how many such machines exist in the fetched catalog.
    const countsByGpu = new Map<string, number>()
    for (const offer of rentable) {
      countsByGpu.set(offer.gpu_name, (countsByGpu.get(offer.gpu_name) ?? 0) + 1)
    }

    return rentable.map((offer) => {
      const count = countsByGpu.get(offer.gpu_name) ?? 1
      return {
        id: String(offer.id),
        gpuType: offer.gpu_name,
        displayName: offer.gpu_name,
        gpuCount: offer.num_gpus ?? 1,
        vramGb: Math.max(1, Math.round((offer.gpu_ram ?? 0) / 1024)),
        pricePerHour: offer.dph_total ?? null,
        tflops: offer.dlperf ?? offer.flops_per_dphtotal ?? null,
        datacenter:
          offer.datacenter ??
          offer.geolocation ??
          (offer.machine_id ? `machine-${offer.machine_id}` : null),
        availability: {
          level: levelFromCount(count),
          availableCount: count,
          detail: `${count} machine${count === 1 ? "" : "s"} rentable`,
        },
      }
    })
  },
}

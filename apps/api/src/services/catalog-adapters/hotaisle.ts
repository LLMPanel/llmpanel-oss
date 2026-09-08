import { levelFromCount, type CatalogAdapter, type CatalogOffer } from "./types"

interface HotAisleAvailable {
  Quantity: number
  MinimumReservationMinutes: number
  OnDemandPrice?: number
  Specs: {
    cpu_cores: number
    ram_capacity: number
    disk_capacity: number
    gpus?: Array<{ count: number; manufacturer: string; model: string }>
  }
}

export const hotaisleCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string): Promise<CatalogOffer[]> {
    // Hot Aisle: API key format is "key:team"
    let actualKey = apiKey
    let teamHandle = "default"
    if (apiKey.includes(":")) {
      const parts = apiKey.split(":", 2)
      actualKey = parts[0]
      teamHandle = parts[1]
    }

    const res = await fetch(
      `https://admin.hotaisle.app/api/teams/${teamHandle}/virtual_machines/available/`,
      {
        headers: {
          Authorization: `Api-Key ${actualKey}`,
          Accept: "application/json",
        },
      }
    )

    if (!res.ok) {
      throw new Error(`Hot Aisle API error: ${res.status} ${res.statusText}`)
    }

    const available = (await res.json()) as HotAisleAvailable[]
    return available
      .filter((t) => t.Quantity > 0)
      .map((t, idx) => {
        const gpu = t.Specs.gpus?.[0]
        const gpuName = gpu ? `${gpu.manufacturer} ${gpu.model}` : "CPU Only"
        const gpuCount = t.Specs.gpus?.reduce((sum, g) => sum + g.count, 0) ?? 0
        const priceCents = t.OnDemandPrice ?? null

        return {
          id: `hotaisle-${idx}`,
          gpuType: gpuName,
          displayName: gpuName,
          gpuCount,
          vramGb: 0, // Hot Aisle doesn't expose VRAM in the API
          pricePerHour: priceCents != null ? priceCents / 100 : null,
          tflops: null,
          datacenter: null,
          availability: {
            level: levelFromCount(t.Quantity),
            availableCount: t.Quantity,
            detail: `${t.Quantity} machine${t.Quantity === 1 ? "" : "s"} available`,
          },
        }
      })
  },
}

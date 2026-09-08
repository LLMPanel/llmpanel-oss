import { levelFromCount, type CatalogAdapter, type CatalogOffer } from "./types"
import { DataCrunchClient, fetchDataCrunchInstanceTypes } from "@llmpanel/providers"

interface DCInstanceType {
  id: string
  instance_type: string
  name: string
  model: string
  cpu: { number_of_cores: number }
  gpu: { description: string; number_of_gpus: number }
  gpu_memory: { size_in_gigabytes: number }
  memory: { size_in_gigabytes: number }
  price_per_hour: string
  spot_price: string | null
}

interface DCAvailability {
  location_code: string
  availabilities: string[]
}

export const datacrunchCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string): Promise<CatalogOffer[]> {
    // Instance types (with pricing) are public; availability needs the token.
    const types = await fetchDataCrunchInstanceTypes<DCInstanceType[]>()

    let availability: DCAvailability[] = []
    try {
      const client = new DataCrunchClient(apiKey)
      availability = await client.request<DCAvailability[]>("GET", "/instance-availability")
    } catch {
      // Fall through with unknown availability rather than dropping the catalog.
    }

    return types
      .filter((t) => t.gpu.number_of_gpus > 0)
      .map((t) => {
        const locations = availability
          .filter((a) => a.availabilities.includes(t.instance_type))
          .map((a) => a.location_code)
        const known = availability.length > 0

        return {
          id: t.instance_type,
          gpuType: t.instance_type,
          displayName: t.name,
          gpuCount: t.gpu.number_of_gpus,
          vramGb: t.gpu_memory.size_in_gigabytes,
          pricePerHour: Number(t.price_per_hour),
          tflops: null,
          datacenter: locations[0] ?? null,
          availability: known
            ? {
                level: levelFromCount(locations.length),
                availableCount: locations.length,
                detail:
                  locations.length > 0
                    ? `Available in ${locations.join(", ")}`
                    : "No capacity in any location right now",
              }
            : { level: "unknown", availableCount: null, detail: null },
        }
      })
  },
}

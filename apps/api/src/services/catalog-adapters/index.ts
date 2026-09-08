// Catalog adapter registry. To add a new neocloud provider:
//   1. Create <provider>.ts implementing CatalogAdapter (normalize availability!)
//   2. Register it below
//   3. Add a matching entry to the frontend registry (apps/web/lib/provider-registry.ts)
import type { CatalogAdapter } from "./types"
import { runpodCatalogAdapter } from "./runpod"
import { vastaiCatalogAdapter } from "./vastai"
import { hotaisleCatalogAdapter } from "./hotaisle"
import { lambdalabsCatalogAdapter } from "./lambdalabs"
import { datacrunchCatalogAdapter } from "./datacrunch"
import { hyperstackCatalogAdapter } from "./hyperstack"
import { tensordockCatalogAdapter } from "./tensordock"

export type {
  AvailabilityLevel,
  CatalogAdapter,
  CatalogOffer,
  OfferAvailability,
} from "./types"

const catalogAdapters: Record<string, CatalogAdapter> = {
  runpod: runpodCatalogAdapter,
  vastai: vastaiCatalogAdapter,
  hotaisle: hotaisleCatalogAdapter,
  lambdalabs: lambdalabsCatalogAdapter,
  datacrunch: datacrunchCatalogAdapter,
  hyperstack: hyperstackCatalogAdapter,
  tensordock: tensordockCatalogAdapter,
}

export function getCatalogAdapter(providerType: string): CatalogAdapter | null {
  return catalogAdapters[providerType] ?? null
}

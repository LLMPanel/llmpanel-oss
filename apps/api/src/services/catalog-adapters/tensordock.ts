import { levelFromCount, type CatalogAdapter, type CatalogOffer } from "./types"
import { TensorDockProvider, parseTensorDockVram } from "@llmpanel/providers"

export const tensordockCatalogAdapter: CatalogAdapter = {
  async fetchCatalog(apiKey: string): Promise<CatalogOffer[]> {
    // The provider normalizes TensorDock's two inventory sources (the
    // documented v2 endpoint, which returns nothing, and the public v1 one
    // that actually carries stock), so reuse it rather than re-deriving.
    const provider = new TensorDockProvider(apiKey)
    const offers = await provider.listOffers()

    return offers.map((offer, idx) => ({
      // Deploys resolve the GPU by model name, so gpuType stays the bare key
      // while the id keeps offers from separate hosts distinct.
      id: offer.hostnodeId ? `${offer.gpuModel}@${offer.hostnodeId}` : `${offer.gpuModel}@${offer.locationId}-${idx}`,
      gpuType: offer.gpuModel,
      displayName: offer.displayName,
      gpuCount: 1,
      vramGb: parseTensorDockVram(offer.gpuModel),
      pricePerHour: offer.pricePerGpuHr,
      tflops: null,
      datacenter: offer.datacenter,
      availability: {
        level: levelFromCount(offer.availableCount),
        availableCount: offer.availableCount,
        detail:
          // A host with stock but no free ports can't publish the inference
          // port, so it is effectively undeployable.
          !offer.dedicatedIpAvailable && offer.freePorts < 3
            ? `${offer.availableCount} GPU(s), but no free ports to publish the endpoint`
            : `Up to ${offer.availableCount} GPU${offer.availableCount === 1 ? "" : "s"} available`,
      },
    }))
  },
}

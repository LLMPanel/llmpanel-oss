"use client"

import { useQuery } from "@tanstack/react-query"
import type { Provider } from "@/hooks/use-providers"
import type { ProviderCatalogOffer } from "@/hooks/use-provider-catalog"
import { isCloudProviderType } from "@/lib/provider-registry"

export interface CatalogOfferWithProvider extends ProviderCatalogOffer {
  providerId: string
  providerName: string
  providerType: string
}

async function fetchCatalog(providerId: string): Promise<{
  provider: { id: string; name: string; providerType: string }
  offers: ProviderCatalogOffer[]
}> {
  const res = await globalThis.fetch(`/api/v1/providers/${providerId}/catalog`, {
    credentials: "include",
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<{
    provider: { id: string; name: string; providerType: string }
    offers: ProviderCatalogOffer[]
  }>
}

export function useAllCatalog(providers: Provider[]) {
  const cloudProviders = providers.filter((p) =>
    isCloudProviderType(p.providerType)
  )

  const query = useQuery({
    queryKey: ["all-catalog", cloudProviders.map((p) => p.id).sort()],
    queryFn: async () => {
      const results = await Promise.allSettled(
        cloudProviders.map(async (provider) => {
          const data = await fetchCatalog(provider.id)
          return data.offers.map(
            (offer): CatalogOfferWithProvider => ({
              ...offer,
              providerId: provider.id,
              providerName: provider.name,
              providerType: provider.providerType,
            })
          )
        })
      )

      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    },
    enabled: cloudProviders.length > 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  return {
    offers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  }
}

"use client"

import { useQuery } from "@tanstack/react-query"
import type { Provider } from "@/hooks/use-providers"
import type { ProviderInstance, ProviderStats } from "@/hooks/use-provider-stats"
import { isCloudProviderType } from "@/lib/provider-registry"

export interface InstanceWithProvider extends ProviderInstance {
  providerId: string
  providerName: string
  providerType: string
}

export interface AllInstancesData {
  instances: InstanceWithProvider[]
  totalCostPerHour: number
  runningCount: number
  balances: Array<{
    providerId: string
    providerName: string
    providerType: string
    balance: number | null
    currency: string
  }>
}

async function fetchStats(providerId: string): Promise<ProviderStats> {
  const res = await globalThis.fetch(`/api/v1/providers/${providerId}/stats`, {
    credentials: "include",
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  const data = (await res.json()) as { stats: ProviderStats }
  return data.stats
}

export function useAllInstances(providers: Provider[]) {
  const cloudProviders = providers.filter((p) =>
    isCloudProviderType(p.providerType)
  )

  const query = useQuery({
    queryKey: ["all-instances", cloudProviders.map((p) => p.id).sort()],
    queryFn: async (): Promise<AllInstancesData> => {
      const results = await Promise.allSettled(
        cloudProviders.map(async (provider) => {
          const stats = await fetchStats(provider.id)
          return { provider, stats }
        })
      )

      const instances: InstanceWithProvider[] = []
      const balances: AllInstancesData["balances"] = []
      let totalCostPerHour = 0
      let runningCount = 0

      for (const result of results) {
        if (result.status !== "fulfilled") continue
        const { provider, stats } = result.value

        balances.push({
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.providerType,
          balance: stats.balance,
          currency: stats.balanceCurrency,
        })

        totalCostPerHour += stats.totalCostPerHour
        runningCount += stats.runningInstances

        for (const inst of stats.instances) {
          instances.push({
            ...inst,
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.providerType,
          })
        }
      }

      return { instances, totalCostPerHour, runningCount, balances }
    },
    enabled: cloudProviders.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  return {
    data: query.data ?? { instances: [], totalCostPerHour: 0, runningCount: 0, balances: [] },
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  }
}

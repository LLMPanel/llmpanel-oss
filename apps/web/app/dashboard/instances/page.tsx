"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  DollarSign,
  Layers,
  List,
  Loader2,
  Plug,
  RefreshCw,
  Server,
  ServerCrash,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useProviders } from "@/hooks/use-providers"
import { useAllCatalog } from "@/hooks/use-all-catalog"
import { useAllInstances } from "@/hooks/use-all-instances"
import type { CatalogOfferWithProvider } from "@/hooks/use-all-catalog"
import { detectGpuBrand } from "@/lib/gpu"
import {
  cloudProviderLabelList,
  isCloudProviderType,
  providerMeta,
} from "@/lib/provider-registry"
import {
  InstanceFiltersBar,
  defaultFilters,
  type InstanceFilters,
} from "@/components/instances/instance-filters"
import { CatalogTable } from "@/components/instances/catalog-table"
import { RunningInstancesTable } from "@/components/instances/running-instances-table"
import {
  GpuModelGrid,
  type GpuModelGroup,
} from "@/components/instances/gpu-model-grid"

function applyFilters(
  offers: CatalogOfferWithProvider[],
  filters: InstanceFilters
): CatalogOfferWithProvider[] {
  let result = offers

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (o) =>
        o.displayName.toLowerCase().includes(q) ||
        o.gpuType.toLowerCase().includes(q)
    )
  }

  if (filters.provider !== "all") {
    result = result.filter((o) => o.providerId === filters.provider)
  }

  if (filters.gpuBrand !== "all") {
    result = result.filter((o) => detectGpuBrand(o.displayName) === filters.gpuBrand)
  }

  if (filters.availability === "available") {
    result = result.filter((o) => {
      const level = o.availability?.level
      return level === "high" || level === "medium" || level === "low"
    })
  } else if (filters.availability === "high") {
    result = result.filter((o) => o.availability?.level === "high")
  }

  if (filters.minVram) {
    const min = Number(filters.minVram)
    if (!Number.isNaN(min)) result = result.filter((o) => o.vramGb >= min)
  }

  if (filters.maxVram) {
    const max = Number(filters.maxVram)
    if (!Number.isNaN(max)) result = result.filter((o) => o.vramGb <= max)
  }

  if (filters.minTflops) {
    const min = Number(filters.minTflops)
    if (!Number.isNaN(min))
      result = result.filter((o) => o.tflops != null && o.tflops >= min)
  }

  return result
}

function countActiveFilters(filters: InstanceFilters): number {
  let count = 0
  if (filters.search) count++
  if (filters.provider !== "all") count++
  if (filters.gpuBrand !== "all") count++
  if (filters.availability !== "all") count++
  if (filters.minVram) count++
  if (filters.maxVram) count++
  if (filters.minTflops) count++
  return count
}

export default function InstancesPage() {
  const router = useRouter()
  const { providers, isLoading: providersLoading } = useProviders()
  const {
    data: instancesData,
    isLoading: instancesLoading,
    error: instancesError,
    refetch: refetchInstances,
  } = useAllInstances(providers)
  const {
    offers,
    isLoading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useAllCatalog(providers)
  const [filters, setFilters] = useState<InstanceFilters>(defaultFilters)
  const [selectedGpuModel, setSelectedGpuModel] = useState<string | null>(null)

  const isLoading = providersLoading || instancesLoading || catalogLoading
  const error = instancesError ?? catalogError
  const activeFilterCount = countActiveFilters(filters)

  const filteredOffers = useMemo(
    () => applyFilters(offers, filters),
    [offers, filters]
  )

  // Detail table narrows to the selected GPU card (if any).
  const detailOffers = useMemo(
    () =>
      selectedGpuModel
        ? filteredOffers.filter((o) => o.displayName === selectedGpuModel)
        : filteredOffers,
    [filteredOffers, selectedGpuModel]
  )

  const cloudProviders = providers.filter((p) =>
    isCloudProviderType(p.providerType)
  )

  const uniqueGpuTypes = useMemo(
    () => new Set(offers.map((o) => o.displayName)).size,
    [offers]
  )

  const availableGpuTypes = useMemo(() => {
    const available = new Set<string>()
    for (const o of offers) {
      const level = o.availability?.level
      if (level === "high" || level === "medium" || level === "low") {
        available.add(o.displayName)
      }
    }
    return available.size
  }, [offers])

  const handleRefresh = () => {
    void refetchInstances()
    void refetchCatalog()
  }

  const handleDeployOffer = (offer: CatalogOfferWithProvider) => {
    const params = new URLSearchParams({
      deploy: "1",
      provider: offer.providerId,
      gpu: offer.displayName,
    })
    router.push(`/dashboard?${params.toString()}`)
  }

  const handleDeployGroup = (group: GpuModelGroup) => {
    handleDeployOffer(group.cheapestOffer)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Instances</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your running instances and GPU availability across providers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && instancesData.instances.length === 0 && offers.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error && instancesData.instances.length === 0 && offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <ServerCrash className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      ) : cloudProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Plug className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-medium">No cloud providers connected</h2>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-xs">
              Connect a {cloudProviderLabelList()} account to browse available GPU machines.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/dashboard/providers">Connect a provider</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="py-4">
              <CardContent className="px-4 py-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Running</p>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {instancesData.runningCount}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {instancesData.instances.length}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="px-4 py-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Cost/hr</p>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  ${instancesData.totalCostPerHour.toFixed(3)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="px-4 py-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">GPU Availability</p>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {availableGpuTypes}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {uniqueGpuTypes} types in stock
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="px-4 py-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Server className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Providers</p>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {cloudProviders.map((p) => (
                    <Badge
                      key={p.id}
                      variant={providerMeta(p.providerType).badgeVariant}
                    >
                      {p.name}
                    </Badge>
                  ))}
                </div>
                {instancesData.balances.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {instancesData.balances
                      .filter((b) => b.balance != null)
                      .map((b) => (
                        <span key={b.providerId} className="text-[11px] text-muted-foreground">
                          {b.providerName}: ${b.balance?.toFixed(2)}
                        </span>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Running Instances ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Running Instances
              </h2>
              {instancesData.instances.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {instancesData.instances.length}
                </Badge>
              )}
            </div>
            <Card className="py-0 overflow-hidden">
              {instancesLoading && instancesData.instances.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <RunningInstancesTable instances={instancesData.instances} />
              )}
            </Card>
          </section>

          {/* ── GPU Availability (grouped by model) ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="size-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GPU Availability
              </h2>
              {offers.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {uniqueGpuTypes} types
                </Badge>
              )}
            </div>

            {/* Filters */}
            <InstanceFiltersBar
              filters={filters}
              onChange={setFilters}
              providerOptions={cloudProviders.map((p) => ({
                id: p.id,
                name: p.name,
                type: p.providerType,
              }))}
              activeFilterCount={activeFilterCount}
            />

            {/* Results count */}
            {activeFilterCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {filteredOffers.length} of {offers.length} machines
              </p>
            )}

            {catalogLoading && offers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <GpuModelGrid
                offers={filteredOffers}
                selectedModel={selectedGpuModel}
                onSelectModel={setSelectedGpuModel}
                onDeploy={handleDeployGroup}
              />
            )}
          </section>

          {/* ── Offer Detail Table ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <List className="size-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedGpuModel ? `${selectedGpuModel} Offers` : "All Offers"}
              </h2>
              {detailOffers.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {detailOffers.length}
                </Badge>
              )}
              {selectedGpuModel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setSelectedGpuModel(null)}
                >
                  <X className="size-3" />
                  Show all
                </Button>
              )}
            </div>
            <Card className="py-0 overflow-hidden">
              {catalogLoading && offers.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <CatalogTable offers={detailOffers} onDeploy={handleDeployOffer} />
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  )
}

"use client"

import { useMemo } from "react"
import { Cpu, MemoryStick, Rocket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { detectGpuBrand } from "@/lib/gpu"
import { providerMeta } from "@/lib/provider-registry"
import type { CatalogOfferWithProvider } from "@/hooks/use-all-catalog"
import type { AvailabilityLevel } from "@/hooks/use-provider-catalog"
import {
  AvailabilityBadge,
  bestAvailability,
  LEVEL_RANK,
} from "./availability-badge"

export interface GpuModelGroup {
  /** GPU model display name — the grouping key. */
  model: string
  brand: ReturnType<typeof detectGpuBrand>
  vramGb: number
  offers: CatalogOfferWithProvider[]
  /** Lowest price across all offers of this model, null if none reported. */
  lowestPrice: number | null
  /** The offer behind lowestPrice (fallback: first offer) — used for Deploy. */
  cheapestOffer: CatalogOfferWithProvider
  availabilityLevel: AvailabilityLevel
  /** One summary row per provider offering this model. */
  providers: Array<{
    providerType: string
    lowestPrice: number | null
    availabilityLevel: AvailabilityLevel
  }>
}

export function groupOffersByGpuModel(
  offers: CatalogOfferWithProvider[]
): GpuModelGroup[] {
  const byModel = new Map<string, CatalogOfferWithProvider[]>()
  for (const offer of offers) {
    const list = byModel.get(offer.displayName)
    if (list) list.push(offer)
    else byModel.set(offer.displayName, [offer])
  }

  const groups: GpuModelGroup[] = []
  for (const [model, modelOffers] of byModel) {
    const priced = modelOffers.filter((o) => o.pricePerHour != null)
    const cheapestOffer = priced.reduce(
      (best, o) =>
        best == null || o.pricePerHour! < best.pricePerHour! ? o : best,
      null as CatalogOfferWithProvider | null
    )

    const byProvider = new Map<string, CatalogOfferWithProvider[]>()
    for (const offer of modelOffers) {
      const list = byProvider.get(offer.providerType)
      if (list) list.push(offer)
      else byProvider.set(offer.providerType, [offer])
    }

    groups.push({
      model,
      brand: detectGpuBrand(model),
      vramGb: Math.max(...modelOffers.map((o) => o.vramGb)),
      offers: modelOffers,
      lowestPrice: cheapestOffer?.pricePerHour ?? null,
      cheapestOffer: cheapestOffer ?? modelOffers[0],
      availabilityLevel: bestAvailability(modelOffers.map((o) => o.availability)),
      providers: [...byProvider.entries()].map(([providerType, provOffers]) => {
        const provPriced = provOffers
          .map((o) => o.pricePerHour)
          .filter((p): p is number => p != null)
        return {
          providerType,
          lowestPrice: provPriced.length > 0 ? Math.min(...provPriced) : null,
          availabilityLevel: bestAvailability(provOffers.map((o) => o.availability)),
        }
      }),
    })
  }

  // Available GPUs first, then by price.
  return groups.sort((a, b) => {
    const rankDiff = LEVEL_RANK[b.availabilityLevel] - LEVEL_RANK[a.availabilityLevel]
    if (rankDiff !== 0) return rankDiff
    return (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity)
  })
}

function BrandBadge({ brand }: { brand: ReturnType<typeof detectGpuBrand> }) {
  if (brand === "nvidia") return <Badge variant="success" className="text-[10px]">NVIDIA</Badge>
  if (brand === "amd") return <Badge variant="destructive" className="text-[10px]">AMD</Badge>
  if (brand === "intel") return <Badge variant="blue" className="text-[10px]">Intel</Badge>
  return null
}

const AVAILABILITY_LABEL: Record<AvailabilityLevel, string> = {
  high: "High availability",
  medium: "Medium availability",
  low: "Low availability",
  none: "Unavailable",
  unknown: "Availability unknown",
}

export function GpuModelGrid({
  offers,
  selectedModel,
  onSelectModel,
  onDeploy,
}: {
  offers: CatalogOfferWithProvider[]
  selectedModel: string | null
  onSelectModel: (model: string | null) => void
  onDeploy: (group: GpuModelGroup) => void
}) {
  const groups = useMemo(() => groupOffersByGpuModel(offers), [offers])

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground rounded-xl border border-dashed">
        <Cpu className="size-8 mb-2 opacity-30" />
        <p className="text-sm font-medium text-foreground">No GPUs match your filters</p>
        <p className="text-[13px] mt-1">Try adjusting your search or filter criteria</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map((group) => {
        const selected = selectedModel === group.model
        const unavailable = group.availabilityLevel === "none"
        return (
          <div
            key={group.model}
            role="button"
            tabIndex={0}
            onClick={() => onSelectModel(selected ? null : group.model)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelectModel(selected ? null : group.model)
              }
            }}
            aria-pressed={selected}
            className={cn(
              "group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors cursor-pointer",
              "hover:border-primary/40 hover:bg-muted/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary ring-1 ring-primary/30 bg-primary/[0.03]",
              unavailable && "opacity-60"
            )}
          >
            {/* Name row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{group.model}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <BrandBadge brand={group.brand} />
                  {group.vramGb > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MemoryStick className="size-3" />
                      <span className="tabular-nums font-medium">{group.vramGb} GB</span>
                    </span>
                  )}
                </div>
              </div>
              <AvailabilityBadge
                availability={{
                  level: group.availabilityLevel,
                  availableCount: null,
                  detail: AVAILABILITY_LABEL[group.availabilityLevel],
                }}
                showLabel={false}
                className="mt-1"
              />
            </div>

            {/* Per-provider rows */}
            <div className="space-y-1.5">
              {group.providers.map((p) => (
                <div
                  key={p.providerType}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <AvailabilityBadge
                      availability={{
                        level: p.availabilityLevel,
                        availableCount: null,
                        detail: null,
                      }}
                      showLabel={false}
                    />
                    <span className="text-muted-foreground truncate">
                      {providerMeta(p.providerType).label}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums shrink-0">
                    {p.lowestPrice != null ? `$${p.lowestPrice.toFixed(3)}/hr` : "--"}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-auto flex items-center justify-between gap-2 pt-1 border-t border-border/60">
              <span className="text-xs text-muted-foreground">
                {group.offers.length} offer{group.offers.length === 1 ? "" : "s"}
                {group.lowestPrice != null && (
                  <>
                    {" · from "}
                    <span className="font-semibold text-foreground tabular-nums">
                      ${group.lowestPrice.toFixed(3)}/hr
                    </span>
                  </>
                )}
              </span>
              <Button
                size="sm"
                variant={selected ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                disabled={unavailable}
                onClick={(e) => {
                  e.stopPropagation()
                  onDeploy(group)
                }}
              >
                <Rocket className="size-3" />
                Deploy
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

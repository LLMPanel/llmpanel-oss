"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Cpu, DollarSign, MapPin, MemoryStick, Rocket, Zap } from "lucide-react"
import type { CatalogOfferWithProvider } from "@/hooks/use-all-catalog"
import { cn } from "@/lib/utils"
import { detectGpuBrand } from "@/lib/gpu"
import { ProviderBadge } from "./provider-badge"
import { AvailabilityBadge } from "./availability-badge"

function gpuBrandBadge(gpuName: string) {
  const brand = detectGpuBrand(gpuName)
  if (brand === "nvidia") return <Badge variant="success" className="text-[10px]">NVIDIA</Badge>
  if (brand === "amd") return <Badge variant="destructive" className="text-[10px]">AMD</Badge>
  if (brand === "intel") return <Badge variant="blue" className="text-[10px]">Intel</Badge>
  return null
}

export function CatalogTable({
  offers,
  onDeploy,
}: {
  offers: CatalogOfferWithProvider[]
  onDeploy?: (offer: CatalogOfferWithProvider) => void
}) {
  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Cpu className="size-8 mb-2 opacity-30" />
        <p className="text-sm font-medium text-foreground">No machines match your filters</p>
        <p className="text-[13px] mt-1">Try adjusting your search or filter criteria</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left font-medium">GPU</th>
            <th className="px-4 py-2.5 text-left font-medium">Brand</th>
            <th className="px-4 py-2.5 text-left font-medium">VRAM</th>
            <th className="px-4 py-2.5 text-left font-medium">TFLOPS</th>
            <th className="px-4 py-2.5 text-left font-medium">GPUs</th>
            <th className="px-4 py-2.5 text-left font-medium">Price/hr</th>
            <th className="px-4 py-2.5 text-left font-medium">Availability</th>
            <th className="px-4 py-2.5 text-left font-medium">Provider</th>
            <th className="px-4 py-2.5 text-left font-medium">Location</th>
            {onDeploy && <th className="px-4 py-2.5 text-right font-medium" />}
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr
              key={`${offer.providerId}-${offer.id}`}
              className="border-b last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* GPU Name */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{offer.displayName}</span>
                </div>
              </td>

              {/* Brand */}
              <td className="px-4 py-3">
                {gpuBrandBadge(offer.displayName)}
              </td>

              {/* VRAM */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 text-xs">
                  <MemoryStick className="size-3 text-muted-foreground" />
                  <span className="font-medium tabular-nums">{offer.vramGb} GB</span>
                </div>
              </td>

              {/* TFLOPS */}
              <td className="px-4 py-3">
                {offer.tflops != null ? (
                  <div className="flex items-center gap-1 text-xs">
                    <Zap className="size-3 text-muted-foreground" />
                    <span className="font-medium tabular-nums">
                      {offer.tflops.toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>

              {/* GPU Count */}
              <td className="px-4 py-3">
                <span className={cn(
                  "text-xs font-medium tabular-nums",
                  offer.gpuCount > 1 && "text-primary"
                )}>
                  {offer.gpuCount}x
                </span>
              </td>

              {/* Price */}
              <td className="px-4 py-3">
                {offer.pricePerHour != null ? (
                  <div className="flex items-center gap-1 text-xs">
                    <DollarSign className="size-3 text-muted-foreground" />
                    <span className="font-medium tabular-nums">
                      {offer.pricePerHour.toFixed(3)}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>

              {/* Availability */}
              <td className="px-4 py-3">
                <AvailabilityBadge availability={offer.availability} />
              </td>

              {/* Provider */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <ProviderBadge type={offer.providerType} />
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                    {offer.providerName}
                  </span>
                </div>
              </td>

              {/* Location */}
              <td className="px-4 py-3">
                {offer.datacenter ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate max-w-[100px]">{offer.datacenter}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>

              {/* Deploy */}
              {onDeploy && (
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={offer.availability?.level === "none"}
                    onClick={() => onDeploy(offer)}
                  >
                    <Rocket className="size-3" />
                    Deploy
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

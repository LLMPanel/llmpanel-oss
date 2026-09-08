"use client"

import { useMemo } from "react"
import { motion } from "motion/react"
import { AlertTriangle, Check, CircleCheck, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ProviderCatalogOffer, RunpodCloudType } from "@/hooks/use-provider-catalog"
import type { Provider } from "@/hooks/use-providers"
import { stepContainer, stepItem } from "./motion"

// RunPod stock levels → badge styling. Anything unknown renders nothing.
const STOCK_BADGE: Record<string, { label: string; className: string }> = {
  High: {
    label: "High stock",
    className: "bg-success/10 text-success ring-success/20",
  },
  Medium: {
    label: "Medium stock",
    className: "bg-warning/10 text-warning ring-warning/20",
  },
  Low: {
    label: "Low stock",
    className: "bg-destructive/10 text-destructive ring-destructive/20",
  },
}

function StockBadge({ stock }: { stock: string | null | undefined }) {
  const badge = stock ? STOCK_BADGE[stock] : undefined
  if (!badge) return null
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide ring-1 ring-inset",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  )
}

/**
 * RunPod only: a GPU is unavailable in the selected cloud when it has no
 * price there (not offered) or no stock status (no machines right now) —
 * deploying it would fail with "no instances currently available".
 */
export function isOfferUnavailable(
  offer: ProviderCatalogOffer,
  providerType: string | null | undefined,
  cloudType: RunpodCloudType,
): boolean {
  if (providerType !== "runpod") return false
  const price =
    cloudType === "community" ? offer.communityPricePerHour ?? null : offer.pricePerHour
  const stock = cloudType === "community" ? offer.communityStock : offer.secureStock
  return price == null || stock == null
}

interface GpuStepProps {
  selectedProvider: Provider | null
  allOffers: ProviderCatalogOffer[]
  offersLoading: boolean
  offersError: string | null
  localGpuLoading: boolean
  localGpuDetected: boolean
  localGpuError: string | null
  selectedOfferId: string
  onSelectOffer: (id: string) => void
  requiredVram: number
  gpuCount: number
  onGpuCountChange: (count: number) => void
  gpuSearch: string
  onGpuSearchChange: (value: string) => void
  priceMin: string
  onPriceMinChange: (value: string) => void
  priceMax: string
  onPriceMaxChange: (value: string) => void
  minVram: string
  onMinVramChange: (value: string) => void
  minTflops: string
  onMinTflopsChange: (value: string) => void
  /** RunPod only: which cloud's offers are shown and deployed to. */
  cloudType: RunpodCloudType
  onCloudTypeChange: (cloud: RunpodCloudType) => void
}

function formatUsd(value: number | null): string {
  if (value == null) return "N/A"
  return `$${value.toFixed(3)}`
}

export function GpuStep({
  selectedProvider,
  allOffers,
  offersLoading,
  offersError,
  localGpuLoading,
  localGpuDetected,
  localGpuError,
  selectedOfferId,
  onSelectOffer,
  requiredVram,
  gpuCount,
  onGpuCountChange,
  gpuSearch,
  onGpuSearchChange,
  priceMin,
  onPriceMinChange,
  priceMax,
  onPriceMaxChange,
  minVram,
  onMinVramChange,
  minTflops,
  onMinTflopsChange,
  cloudType,
  onCloudTypeChange,
}: GpuStepProps) {
  const isRunpod = selectedProvider?.providerType === "runpod"

  // The price used for display, filtering, and sorting: RunPod offers are
  // priced per selected cloud; every other provider has one price.
  const activePrice = (offer: ProviderCatalogOffer): number | null =>
    isRunpod && cloudType === "community"
      ? offer.communityPricePerHour ?? null
      : offer.pricePerHour

  const activeStock = (offer: ProviderCatalogOffer): string | null | undefined =>
    cloudType === "community" ? offer.communityStock : offer.secureStock

  const filteredOffers = useMemo(() => {
    const q = gpuSearch.toLowerCase().trim()
    const minPrice = priceMin ? Number(priceMin) : null
    const maxPrice = priceMax ? Number(priceMax) : null
    const minVramVal = minVram ? Number(minVram) : null
    const minTflopsVal = minTflops ? Number(minTflops) : null
    const priceOf = (offer: ProviderCatalogOffer): number | null =>
      isRunpod && cloudType === "community"
        ? offer.communityPricePerHour ?? null
        : offer.pricePerHour

    return allOffers
      .filter((offer) => {
        // RunPod: hide GPUs the selected cloud doesn't offer at all.
        if (isRunpod && priceOf(offer) == null) return false
        if (
          q &&
          !offer.displayName.toLowerCase().includes(q) &&
          !offer.gpuType.toLowerCase().includes(q)
        ) {
          return false
        }
        const p = priceOf(offer)
        if (minPrice != null && p != null && p < minPrice) return false
        if (maxPrice != null && p != null && p > maxPrice) return false
        if (minVramVal != null && offer.vramGb < minVramVal) return false
        if (minTflopsVal != null) {
          if (offer.tflops == null) return true
          if (offer.tflops < minTflopsVal) return false
        }
        return true
      })
      .sort((a, b) => {
        // Out-of-stock GPUs sink to the bottom — they render disabled.
        const aUnavailable = isOfferUnavailable(a, selectedProvider?.providerType, cloudType) ? 1 : 0
        const bUnavailable = isOfferUnavailable(b, selectedProvider?.providerType, cloudType) ? 1 : 0
        if (aUnavailable !== bUnavailable) return aUnavailable - bUnavailable
        if (requiredVram > 0) {
          const aFits = a.vramGb * gpuCount >= requiredVram ? 1 : 0
          const bFits = b.vramGb * gpuCount >= requiredVram ? 1 : 0
          if (aFits !== bFits) return bFits - aFits
        }
        const pa = priceOf(a)
        const pb = priceOf(b)
        if (pa == null && pb == null) return 0
        if (pa == null) return 1
        if (pb == null) return -1
        return pa - pb
      })
  }, [allOffers, gpuSearch, priceMin, priceMax, minVram, minTflops, requiredVram, gpuCount, isRunpod, cloudType, selectedProvider?.providerType])

  const selectedOffer =
    filteredOffers.find((o) => o.id === selectedOfferId) ??
    allOffers.find((o) => o.id === selectedOfferId) ??
    null

  const vramFits = selectedOffer
    ? selectedOffer.vramGb * gpuCount >= requiredVram
    : false

  const fitPct = selectedOffer
    ? Math.min((requiredVram / (selectedOffer.vramGb * gpuCount)) * 100, 100)
    : 0

  const isLocal = selectedProvider?.providerType === "local"

  return (
    <motion.div variants={stepContainer} initial="hidden" animate="show" className="space-y-3.5">
      {/* Header + count */}
      <motion.div variants={stepItem} className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isLocal ? "Local GPUs" : "Marketplace GPUs"}
          </Label>
          {requiredVram > 0 && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              Model needs {requiredVram} GB VRAM
            </p>
          )}
        </div>
        <Select value={String(gpuCount)} onValueChange={(v) => onGpuCountChange(Number(v))}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder="GPU count" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 8].map((count) => (
              <SelectItem key={count} value={String(count)}>
                {count}× GPU
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* RunPod cloud selector: Secure (isolated, datacenter) vs Community
          (peer hosts, usually cheaper, often more stock) */}
      {isRunpod && (
        <motion.div variants={stepItem} className="flex items-center justify-between gap-3">
          <div
            role="radiogroup"
            aria-label="RunPod cloud type"
            className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5"
          >
            {(["secure", "community"] as const).map((cloud) => (
              <button
                key={cloud}
                type="button"
                role="radio"
                aria-checked={cloudType === cloud}
                onClick={() => onCloudTypeChange(cloud)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  cloudType === cloud
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {cloud} cloud
              </button>
            ))}
          </div>
          <p className="text-right text-[11px] leading-tight text-muted-foreground text-pretty">
            {cloudType === "secure"
              ? "Datacenter machines with isolation — most reliable."
              : "Vetted community hosts — usually cheaper, availability varies."}
          </p>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={stepItem} className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search GPU model…"
            value={gpuSearch}
            onChange={(e) => onGpuSearchChange(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="number" placeholder="Min $/hr" value={priceMin} onChange={(e) => onPriceMinChange(e.target.value)} />
          <Input type="number" placeholder="Max $/hr" value={priceMax} onChange={(e) => onPriceMaxChange(e.target.value)} />
          <Input type="number" placeholder="Min VRAM" value={minVram} onChange={(e) => onMinVramChange(e.target.value)} />
          <Input type="number" placeholder="Min TFLOPS" value={minTflops} onChange={(e) => onMinTflopsChange(e.target.value)} />
        </div>
      </motion.div>

      {/* VRAM fit panel */}
      {selectedOffer && requiredVram > 0 && (
        <motion.div
          variants={stepItem}
          className={cn(
            "space-y-2 rounded-xl border p-3",
            vramFits ? "border-success/25 bg-success/5" : "border-destructive/25 bg-destructive/5"
          )}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {vramFits ? (
                <CircleCheck className="size-4 text-success" />
              ) : (
                <AlertTriangle className="size-4 text-destructive" />
              )}
              VRAM fit
            </span>
            <span
              className={cn(
                "tabular-nums",
                vramFits ? "text-success" : "text-destructive"
              )}
            >
              {requiredVram} / {selectedOffer.vramGb * gpuCount} GB
            </span>
          </div>
          <Progress value={fitPct} />
          {!vramFits && (
            <p className="text-xs text-destructive text-pretty">
              This GPU can't fit the model. Pick one with more VRAM or increase the GPU count.
            </p>
          )}
        </motion.div>
      )}

      {/* Offer list */}
      <motion.div variants={stepItem}>
        {(isLocal && localGpuLoading) || offersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[3.75rem] w-full rounded-xl" />
            ))}
          </div>
        ) : offersError ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            {offersError}
          </div>
        ) : isLocal && !localGpuDetected ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            {localGpuError ?? "No local GPU detected"}
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-10 text-center">
            <p className="text-sm font-medium">No matching GPUs</p>
            <p className="text-xs text-muted-foreground">Adjust your filters and try again.</p>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="GPU offer"
            className="max-h-[17rem] space-y-2 overflow-y-auto pr-1"
          >
            {filteredOffers.map((offer) => {
              const unavailable = isOfferUnavailable(offer, selectedProvider?.providerType, cloudType)
              const isSelected = selectedOfferId === offer.id
              const fits = requiredVram === 0 || offer.vramGb * gpuCount >= requiredVram
              const price = activePrice(offer)
              const otherCloudPrice =
                cloudType === "secure" ? offer.communityPricePerHour ?? null : offer.pricePerHour
              return (
                <button
                  key={offer.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={unavailable}
                  onClick={() => onSelectOffer(offer.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-[color,background-color,border-color,box-shadow]",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    unavailable
                      ? "cursor-not-allowed border-border opacity-50"
                      : "active:scale-[0.99]",
                    isSelected
                      ? "border-primary bg-accent/60 shadow-sm ring-1 ring-primary"
                      : !unavailable &&
                          "border-border hover:border-foreground/25 hover:bg-accent/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input group-hover:border-foreground/40"
                    )}
                  >
                    {isSelected && <Check className="size-3" strokeWidth={3} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{offer.displayName}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide ring-1 ring-inset",
                          fits
                            ? "bg-success/10 text-success ring-success/20"
                            : "bg-destructive/10 text-destructive ring-destructive/20"
                        )}
                      >
                        {fits ? "Fits" : "Low VRAM"}
                      </span>
                      {isRunpod &&
                        (unavailable ? (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
                            Unavailable
                          </span>
                        ) : (
                          <StockBadge stock={activeStock(offer)} />
                        ))}
                    </div>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {offer.gpuCount}× GPU · {offer.vramGb} GB each
                      {offer.datacenter ? ` · ${offer.datacenter}` : ""}
                      {isRunpod && otherCloudPrice != null
                        ? ` · ${cloudType === "secure" ? "community" : "secure"} ${formatUsd(otherCloudPrice)}/hr`
                        : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">
                      {formatUsd(price)}
                      {price != null && (
                        <span className="text-xs font-normal text-muted-foreground">/hr</span>
                      )}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {isRunpod ? (
                        <span className="capitalize">{cloudType} cloud</span>
                      ) : offer.tflops != null ? (
                        `${offer.tflops.toFixed(1)} TFLOPS`
                      ) : (
                        "TFLOPS N/A"
                      )}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

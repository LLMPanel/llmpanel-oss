"use client"

import { cn } from "@/lib/utils"
import type { AvailabilityLevel, OfferAvailability } from "@/hooks/use-provider-catalog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const LEVEL_META: Record<
  AvailabilityLevel,
  { label: string; dotClass: string; textClass: string }
> = {
  high: {
    label: "High",
    dotClass: "bg-success",
    textClass: "text-success",
  },
  medium: {
    label: "Medium",
    dotClass: "bg-warning",
    textClass: "text-warning",
  },
  low: {
    label: "Low",
    dotClass: "bg-orange-500",
    textClass: "text-orange-700 dark:text-orange-400",
  },
  none: {
    label: "Unavailable",
    dotClass: "bg-destructive",
    textClass: "text-destructive",
  },
  unknown: {
    label: "Unknown",
    dotClass: "bg-muted-foreground/40",
    textClass: "text-muted-foreground",
  },
}

export const LEVEL_RANK: Record<AvailabilityLevel, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
  none: 0,
}

/** Best availability level across a set of offers (for GPU-model aggregation). */
export function bestAvailability(
  availabilities: Array<OfferAvailability | undefined>
): AvailabilityLevel {
  let best: AvailabilityLevel = "unknown"
  for (const a of availabilities) {
    const level = a?.level ?? "unknown"
    if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level
  }
  return best
}

/**
 * Colored availability dot + label. When `detail`/`availableCount` is present,
 * hovering reveals the provider's raw report (RunPod per-cloud stock, Vast.ai
 * machine count).
 */
export function AvailabilityBadge({
  availability,
  showLabel = true,
  className,
}: {
  availability: OfferAvailability | undefined
  showLabel?: boolean
  className?: string
}) {
  const level = availability?.level ?? "unknown"
  const meta = LEVEL_META[level]

  const badge = (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "size-2 rounded-full shrink-0",
          meta.dotClass,
          level === "high" && "animate-pulse"
        )}
      />
      {showLabel && (
        <span className={cn("text-xs font-medium", meta.textClass)}>
          {meta.label}
          {availability?.availableCount != null && (
            <span className="tabular-nums"> ({availability.availableCount})</span>
          )}
        </span>
      )}
    </span>
  )

  if (!availability?.detail) return badge

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>{availability.detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

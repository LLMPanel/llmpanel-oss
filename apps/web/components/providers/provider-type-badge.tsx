import { cn } from "@/lib/utils"
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDER_META,
} from "@/lib/provider-registry"

/**
 * Brand-tinted chip for a provider's type. Labels and tints come from the
 * provider registry — an unknown type falls back to a neutral chip rather
 * than rendering the raw type string.
 */
const FALLBACK = {
  label: "Provider",
  chip: "bg-muted text-muted-foreground ring-border",
}

export function ProviderTypeBadge({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  const cfg =
    type === "local"
      ? LOCAL_PROVIDER_META
      : (CLOUD_PROVIDERS[type] ?? { ...FALLBACK, label: type || FALLBACK.label })

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        cfg.chip,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  )
}

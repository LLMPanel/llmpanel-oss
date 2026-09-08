"use client"

import { Badge } from "@/components/ui/badge"
import { providerMeta } from "@/lib/provider-registry"

export function ProviderBadge({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  const meta = providerMeta(type)
  return (
    <Badge variant={meta.badgeVariant} className={className}>
      {meta.label}
    </Badge>
  )
}

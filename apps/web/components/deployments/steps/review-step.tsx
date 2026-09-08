"use client"

import { motion } from "motion/react"
import { resolveDflashDrafter } from "@llmpanel/shared"
import { Boxes, Cpu, Layers, Server, Zap, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provider } from "@/hooks/use-providers"
import type { ProviderCatalogOffer } from "@/hooks/use-provider-catalog"
import type { RegistryModel } from "@/hooks/use-registry-models"
import type { ProviderStats } from "@/hooks/use-provider-stats"
import { ProviderBalance } from "../provider-balance"
import { stepContainer, stepItem } from "./motion"

interface ReviewStepProps {
  projectName: string
  description: string
  selectedProvider: Provider | null
  selectedOffer: ProviderCatalogOffer | null
  selectedModel: RegistryModel | null
  selectedQuantization: string
  gpuCount: number
  kvCacheEnabled: boolean
  dflashEnabled: boolean
  stats: ProviderStats | null
  statsLoading: boolean
}

function formatUsd(value: number | null): string {
  if (value == null) return "N/A"
  return `$${value.toFixed(3)}/hr`
}

export function ReviewStep({
  projectName,
  description,
  selectedProvider,
  selectedOffer,
  selectedModel,
  selectedQuantization,
  gpuCount,
  kvCacheEnabled,
  dflashEnabled,
  stats,
  statsLoading,
}: ReviewStepProps) {
  const drafter = resolveDflashDrafter(selectedModel?.huggingfaceId)
  const gpuLabel = selectedOffer
    ? `${gpuCount > 1 ? `${gpuCount}× ` : ""}${selectedOffer.displayName}`
    : "—"

  const rows: Array<{ icon: LucideIcon; label: string; value: string; mono?: boolean }> = [
    { icon: Server, label: "Provider", value: selectedProvider?.name ?? "—" },
    { icon: Boxes, label: "Model", value: selectedModel?.name ?? "—" },
    { icon: Layers, label: "Quantization", value: selectedQuantization ? selectedQuantization.toUpperCase() : "—", mono: true },
    { icon: Cpu, label: "GPU", value: gpuLabel },
    { icon: Zap, label: "KV cache", value: kvCacheEnabled ? "Enabled" : "Disabled" },
    {
      icon: Zap,
      label: "DFlash 2",
      value: drafter ? (dflashEnabled ? drafter.model : "Disabled") : "No drafter",
      mono: !!drafter && dflashEnabled,
    },
  ]

  return (
    <motion.div variants={stepContainer} initial="hidden" animate="show" className="space-y-4">
      {/* Hero: project + cost */}
      <motion.div
        variants={stepItem}
        className="flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-4"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Project
          </p>
          <p className="mt-0.5 truncate text-base font-semibold text-balance">
            {projectName || "Untitled deployment"}
          </p>
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Est. cost
          </p>
          <p className="mt-0.5 text-base font-bold tabular-nums">
            {formatUsd(selectedOffer?.pricePerHour ?? null)}
          </p>
        </div>
      </motion.div>

      {/* Summary rows */}
      <motion.dl variants={stepItem} className="overflow-hidden rounded-xl border">
        {rows.map((row, i) => {
          const Icon = row.icon
          return (
            <div
              key={row.label}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i !== rows.length - 1 && "border-b"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  "ml-auto min-w-0 truncate text-sm font-semibold",
                  row.mono && "font-mono uppercase"
                )}
              >
                {row.value}
              </dd>
            </div>
          )
        })}
      </motion.dl>

      {selectedProvider && selectedProvider.providerType !== "local" && (
        <motion.div variants={stepItem}>
          <ProviderBalance provider={selectedProvider} stats={stats} statsLoading={statsLoading} />
        </motion.div>
      )}
    </motion.div>
  )
}

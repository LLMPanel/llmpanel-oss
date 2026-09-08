"use client"

import { motion } from "motion/react"
import { Check } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Provider } from "@/hooks/use-providers"
import type { ProviderStats } from "@/hooks/use-provider-stats"
import { ProviderTile } from "@/components/providers/provider-brand"
import { LOCAL_PROVIDER_META, providerMeta } from "@/lib/provider-registry"
import { ProviderBalance } from "../provider-balance"
import { stepContainer, stepItem } from "./motion"

interface ProviderStepProps {
  providers: Provider[]
  providersLoading: boolean
  selectedProviderId: string
  onSelectProvider: (id: string) => void
  selectedProvider: Provider | null
  stats: ProviderStats | null
  statsLoading: boolean
}

export function ProviderStep({
  providers,
  providersLoading,
  selectedProviderId,
  onSelectProvider,
  selectedProvider,
  stats,
  statsLoading,
}: ProviderStepProps) {
  return (
    <motion.div variants={stepContainer} initial="hidden" animate="show" className="space-y-3">
      <motion.div variants={stepItem}>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose provider
        </Label>
      </motion.div>

      {providersLoading ? (
        <motion.div variants={stepItem} className="grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="size-5 shrink-0 rounded-full" />
            </div>
          ))}
        </motion.div>
      ) : providers.length === 0 ? (
        <motion.div
          variants={stepItem}
          className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground text-pretty"
        >
          No providers connected yet. Add one to get started.
        </motion.div>
      ) : (
        <motion.div variants={stepItem} className="grid gap-2.5 sm:grid-cols-2">
          {providers.map((provider) => {
            const label =
              provider.providerType === "local"
                ? LOCAL_PROVIDER_META.label
                : providerMeta(provider.providerType).label
            const selected = selectedProviderId === provider.id
            return (
              <button
                key={provider.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectProvider(provider.id)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border p-3 text-left transition-[color,background-color,border-color,box-shadow] active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  selected
                    ? "border-primary bg-accent/60 shadow-sm ring-1 ring-primary"
                    : "border-border hover:border-foreground/25 hover:bg-accent/40"
                )}
              >
                <ProviderTile type={provider.providerType} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{provider.name}</p>
                    {provider.isDefault && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary-foreground">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                </div>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input group-hover:border-foreground/40"
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </motion.div>
      )}

      {selectedProvider && selectedProvider.providerType !== "local" && (
        <motion.div variants={stepItem}>
          <ProviderBalance provider={selectedProvider} stats={stats} statsLoading={statsLoading} />
        </motion.div>
      )}
    </motion.div>
  )
}

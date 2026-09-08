"use client"

import { Loader2, Wallet, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProviderStats } from "@/hooks/use-provider-stats"
import type { Provider } from "@/hooks/use-providers"

const RUNPOD_BILLING_URL = "https://www.runpod.io/console/user/billing"

interface ProviderBalanceProps {
  provider: Provider | null
  stats: ProviderStats | null
  statsLoading: boolean
  className?: string
}

/**
 * Shows the connected provider's account balance.
 * - Vast.ai exposes a balance via its API, so we render the live figure.
 * - RunPod's REST API has no balance endpoint, so we link the user to their
 *   RunPod billing console to check it there.
 */
export function ProviderBalance({ provider, stats, statsLoading, className }: ProviderBalanceProps) {
  if (!provider || provider.providerType === "local") return null

  const isRunpod = provider.providerType === "runpod"
  const hasLiveBalance = stats?.balance != null

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <Wallet className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Account balance
        </p>
        {statsLoading ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </span>
        ) : isRunpod && !hasLiveBalance ? (
          <a
            href={RUNPOD_BILLING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            Check on RunPod console <ExternalLink className="size-3" />
          </a>
        ) : hasLiveBalance ? (
          <span className="text-sm font-semibold tabular-nums">
            ${stats!.balance!.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {stats!.balanceCurrency}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Unavailable via API</span>
        )}
      </div>
    </div>
  )
}

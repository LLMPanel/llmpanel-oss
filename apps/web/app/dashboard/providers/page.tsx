"use client"

import { useState, useEffect } from "react"
import { Plus, ServerCrash, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { ProviderCard } from "@/components/providers/provider-card"
import { ProviderTile } from "@/components/providers/provider-brand"
import { ProvidersSummary } from "@/components/providers/providers-summary"
import { AddProviderDialog } from "@/components/providers/add-provider-dialog"
import { useProvidersOverview } from "@/hooks/use-providers-overview"
import { CLOUD_PROVIDERS, isProviderAvailable } from "@/lib/provider-registry"
import { cn } from "@/lib/utils"

async function apiFetch(path: string, init?: RequestInit) {
  const res = await globalThis.fetch(path, { credentials: "include", ...init })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

function formatRelative(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

/** Live "updated Xs ago" label that ticks without a full page re-fetch. */
function LastUpdated({ ts }: { ts: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), 10_000)
    return () => globalThis.clearInterval(id)
  }, [])
  if (ts == null) return null
  return (
    <span className="tabular-nums text-xs text-muted-foreground">
      Updated {formatRelative(ts, now)}
    </span>
  )
}

/** Matches the section headers on the deployment pages: small caps, no icon,
 *  the count as a plain number rather than a pill. */
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <span className="text-[10.5px] font-medium tabular-nums text-muted-foreground/60">
        {count}
      </span>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="h-0.5 w-full bg-border" />
      <div className="flex items-start gap-3 px-5 pt-4 pb-3.5">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x border-t">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 px-4 py-3">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProvidersPage() {
  const { entries, aggregate, isLoading, isRefreshing, error, lastUpdated, refresh } =
    useProvidersOverview()
  const [addOpen, setAddOpen] = useState(false)

  const handleSetDefault = async (id: string) => {
    try {
      await apiFetch(`/api/v1/providers/${id}/default`, { method: "POST" })
      refresh()
      toast.success("Default provider updated")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update default")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/v1/providers/${id}`, { method: "DELETE" })
      refresh()
      toast.success("Provider removed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove provider")
    }
  }

  const cloud = entries.filter((e) => e.provider.providerType !== "local")
  const local = entries.filter((e) => e.provider.providerType === "local")
  const hasProviders = entries.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 antialiased">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance">Providers</h1>
          <p className="max-w-xl text-sm text-muted-foreground text-pretty">
            Connect GPU cloud accounts to deploy models. Balance, running instances,
            and spend refresh automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasProviders && <LastUpdated ts={lastUpdated} />}
          <Button
            variant="outline"
            size="sm"
            className="transition-transform active:scale-[0.97]"
            onClick={refresh}
            disabled={isRefreshing || isLoading}
            title="Refresh"
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            className="transition-transform active:scale-[0.97]"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add provider
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <ServerCrash className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : !hasProviders ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed px-6 py-16 text-center">
          {/* Overlapping row of provider marks — the ones you can connect today
              lead at full strength, the rest trail behind, greyed. */}
          <div className="flex items-center -space-x-2">
            {Object.keys(CLOUD_PROVIDERS)
              .sort(
                (a, b) =>
                  Number(!isProviderAvailable(a)) - Number(!isProviderAvailable(b))
              )
              .map((type, i) => (
                <ProviderTile
                  key={type}
                  type={type}
                  className={cn(
                    "size-11 rounded-xl border-2 border-background shadow-sm",
                    !isProviderAvailable(type) && "opacity-35 saturate-0"
                  )}
                  markClassName="size-4.5"
                  style={{ zIndex: 10 - i }}
                />
              ))}
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-balance">No providers connected</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground text-pretty">
              Connect a GPU cloud account to start deploying models. Balance,
              instances, and spend show up here automatically.
            </p>
          </div>
          <Button
            className="transition-transform active:scale-[0.97]"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add your first provider
          </Button>
          <p className="text-xs text-muted-foreground">
            {Object.entries(CLOUD_PROVIDERS)
              .filter(([type]) => isProviderAvailable(type))
              .map(([, p]) => p.label)
              .join(" · ")}
            <span className="text-muted-foreground/60"> · more coming soon</span>
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <ProvidersSummary aggregate={aggregate} />

          {cloud.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Cloud providers" count={cloud.length} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {cloud.map((entry, i) => (
                  <div
                    key={entry.provider.id}
                    className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
                    style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                  >
                    <ProviderCard
                      entry={entry}
                      onSetDefault={handleSetDefault}
                      onDelete={handleDelete}
                      onRefresh={refresh}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {local.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Local" count={local.length} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {local.map((entry) => (
                  <ProviderCard
                    key={entry.provider.id}
                    entry={entry}
                    onSetDefault={handleSetDefault}
                    onDelete={handleDelete}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  )
}

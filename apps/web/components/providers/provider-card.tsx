"use client"

import { useState, type ReactNode } from "react"
import {
  ChevronDown,
  Star,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { providerLabel } from "@/lib/provider-registry"
import { ProviderTile } from "./provider-brand"
import { InstanceTable } from "./instance-table"
import type { ProviderEntry } from "@/hooks/use-providers-overview"
import { cn } from "@/lib/utils"

/** iOS sheet curve — matches every other transition in the app. */
const EASE = "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]"

interface ProviderCardProps {
  entry: ProviderEntry
  onSetDefault: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
}

function HealthChip({ entry }: { entry: ProviderEntry }) {
  const { provider, health } = entry
  if (provider.providerType === "local") {
    return <Meta dot="bg-success" label="Managed" />
  }
  if (health === "loading") {
    return (
      <Meta
        dot="bg-muted-foreground animate-pulse motion-reduce:animate-none"
        label="Checking…"
      />
    )
  }
  if (health === "error") {
    return <Meta dot="bg-destructive" label="Unreachable" tone="text-destructive" />
  }
  const running = (entry.stats?.runningInstances ?? 0) > 0
  return <Meta dot="bg-success" label={running ? "Live · active" : "Live"} />
}

function Meta({ dot, label, tone }: { dot: string; label: string; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11.5px]", tone ?? "text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  )
}

function KpiStat({
  label,
  value,
  loading,
  muted,
}: {
  label: string
  value: ReactNode
  loading?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-[15px] w-16" />
      ) : (
        <span
          className={cn(
            "text-[15px] font-semibold leading-none tracking-[-0.015em] tabular-nums",
            muted && "text-muted-foreground",
          )}
        >
          {value}
        </span>
      )}
    </div>
  )
}

export function ProviderCard({ entry, onSetDefault, onDelete, onRefresh }: ProviderCardProps) {
  const { provider, stats, health, error } = entry
  const [expanded, setExpanded] = useState(false)
  const [settingDefault, setSettingDefault] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isCloud = provider.providerType !== "local"
  const isLoadingStats = isCloud && health === "loading"

  const brandLabel = providerLabel(provider.providerType)
  const normalize = (v: string) => v.toLowerCase().replace(/[\s_-]/g, "")
  const nameRepeatsBrand = normalize(provider.name) === normalize(brandLabel)

  const handleSetDefault = async () => {
    setSettingDefault(true)
    try {
      await onSetDefault(provider.id)
    } finally {
      setSettingDefault(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(provider.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="relative gap-0 overflow-hidden py-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderTile
            type={provider.providerType}
            className="size-10"
            markClassName="size-4.5"
          />

          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold text-balance">{provider.name}</p>
              {provider.isDefault && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-primary ring-1 ring-inset ring-primary/20">
                  Default
                </span>
              )}
            </div>
            {/* The logo tile shows the brand; this names it in words for anyone
                who doesn't read logos — as text, not a second tinted pill. It's
                dropped when the connection is just named after its provider
                ("runpod" / "Local Docker"), which would only repeat the title. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
              {!nameRepeatsBrand && (
                <>
                  <span>{brandLabel}</span>
                  <span className="text-muted-foreground/40">·</span>
                </>
              )}
              <HealthChip entry={entry} />
              <span className="text-muted-foreground/40">·</span>
              <span className="whitespace-nowrap">
                Added{" "}
                {new Date(provider.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {!provider.isDefault && (
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 text-xs transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
              disabled={settingDefault}
              onClick={() => void handleSetDefault()}
            >
              {settingDefault ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Star className="size-3.5" />
              )}
              <span className="hidden sm:inline">Set default</span>
            </Button>
          )}

          {isCloud && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("text-muted-foreground transition-[transform,color] duration-100 hover:text-destructive active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
              disabled={deleting}
              title="Remove provider"
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          )}

          {isCloud && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("text-muted-foreground transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform duration-200",
                  EASE,
                  "motion-reduce:transition-none",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          )}
        </div>
      </div>

      {/* Local provider note */}
      {!isCloud && (
        <div className="border-t border-border/60 px-5 py-3 text-[11.5px] text-muted-foreground">
          Managed automatically — no API key required.
        </div>
      )}

      {/* Inline KPI strip (cloud only) */}
      {isCloud && (
        <>
          {error && health === "error" ? (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
              <span className="min-w-0 border-l-2 border-destructive/35 pl-3 text-[12.5px] leading-relaxed text-destructive/90">
                <span className="line-clamp-2">{error}</span>
              </span>
              <Button
                variant="outline"
                size="xs"
                className={cn("shrink-0 transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
                onClick={onRefresh}
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
              <KpiStat
                label="Balance"
                loading={isLoadingStats}
                muted={stats?.balance == null}
                value={
                  stats?.balance != null ? `$${stats.balance.toFixed(2)}` : "—"
                }
              />
              <KpiStat
                label="Instances"
                loading={isLoadingStats}
                value={
                  <span>
                    {stats?.runningInstances ?? 0}
                    <span className="text-muted-foreground">/{stats?.totalInstances ?? 0}</span>
                  </span>
                }
              />
              <KpiStat
                label="Cost / hr"
                loading={isLoadingStats}
                muted={(stats?.totalCostPerHour ?? 0) === 0}
                value={`$${(stats?.totalCostPerHour ?? 0).toFixed(3)}`}
              />
            </div>
          )}

          {/* Expandable instances */}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300",
              EASE,
              "motion-reduce:transition-none",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t">
                <div className="flex items-center justify-between px-5 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Instances{" "}
                    <span className="tabular-nums">({stats?.instances.length ?? 0})</span>
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn("text-muted-foreground transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
                    onClick={onRefresh}
                  >
                    <RefreshCw className="size-3" />
                    Refresh
                  </Button>
                </div>
                <div className="border-t">
                  {stats ? (
                    <InstanceTable instances={stats.instances} />
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading instances…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

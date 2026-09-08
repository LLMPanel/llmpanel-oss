"use client"

import { useState, useCallback } from "react"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Bell, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type {
  AlertChannel,
  AlertEvent,
} from "@/hooks/use-alerts"
import {
  createAlertChannel,
  deleteAlertChannel,
  testAlertChannel,
} from "@/hooks/use-alerts"
import { AddChannelDialog } from "@/components/alerts/add-channel-dialog"
import { ChannelCard } from "@/components/alerts/channel-card"
import { AlertPreferences } from "@/components/alerts/alert-preferences"
import { PlatformIcon, platformLabel } from "@/components/alerts/platform-icon"

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchChannels(): Promise<AlertChannel[]> {
  const res = await globalThis.fetch("/api/v1/alerts/channels", {
    credentials: "include",
  })
  if (!res.ok) throw new Error("Failed to fetch alert channels")
  const data = (await res.json()) as { channels: AlertChannel[] }
  return data.channels
}

// ── Query keys ──────────────────────────────────────────────────────────────

const channelsKey = ["alert-channels"] as const

// ── Empty states ────────────────────────────────────────────────────────────

function ChannelsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <Bell className="mb-1 size-6 text-muted-foreground/40" strokeWidth={1.75} />
      <p className="text-[15px] font-semibold tracking-[-0.01em]">No channels yet</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        Add Telegram, Discord, or Slack to start receiving deployment alerts.
      </p>
    </div>
  )
}

// ── Channel stats summary ──────────────────────────────────────────────────

function ChannelStats({ channels }: { channels: AlertChannel[] }) {
  const platforms = ["telegram", "discord", "slack"] as const
  return (
    <div className="grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:ring-white/[0.06]">
      {platforms.map((p) => {
        const count = channels.filter((c) => c.platform === p).length
        return (
          <div key={p} className="flex items-center gap-3 px-5 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <PlatformIcon platform={p} className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground">{platformLabel(p)}</p>
              <p className="text-[17px] font-semibold leading-tight tracking-[-0.01em] tabular-nums">{count}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

const DEFAULT_EVENTS: AlertEvent[] = [
  "deployment.started",
  "deployment.running",
  "deployment.failed",
  "deployment.stopped",
]

type AlertsTab = "channels" | "preferences"

const EVENT_REF = [
  { dot: "bg-primary", label: "deployment.started", desc: "Provisioning begins — resources are being allocated" },
  { dot: "bg-success", label: "deployment.running", desc: "Model is live and serving inference requests" },
  { dot: "bg-destructive", label: "deployment.failed", desc: "An error occurred during provisioning or runtime" },
  { dot: "bg-muted-foreground", label: "deployment.stopped", desc: "Deployment was manually stopped" },
]

export default function AlertsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<AlertsTab>("channels")

  // ── Channels query ──
  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: channelsKey,
    queryFn: fetchChannels,
  })

  // ── Default event preferences (stored in local state, persists via localStorage) ──
  const [enabledEvents, setEnabledEvents] = useState<Set<AlertEvent>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_EVENTS)
    try {
      const stored = localStorage.getItem("op:alert-preferences")
      if (stored) {
        const parsed = JSON.parse(stored) as AlertEvent[]
        return new Set(parsed)
      }
    } catch {
      // ignore
    }
    return new Set(DEFAULT_EVENTS)
  })

  const [globalEnabled, setGlobalEnabled] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("op:alerts-enabled") !== "false"
  })

  const toggleEvent = useCallback((event: AlertEvent) => {
    setEnabledEvents((prev) => {
      const next = new Set(prev)
      if (next.has(event)) next.delete(event)
      else next.add(event)
      const arr = Array.from(next)
      localStorage.setItem("op:alert-preferences", JSON.stringify(arr))
      return next
    })
  }, [])

  const toggleGlobal = useCallback(() => {
    setGlobalEnabled((prev) => {
      const next = !prev
      localStorage.setItem("op:alerts-enabled", String(next))
      toast.success(next ? "Alerts enabled" : "Alerts paused")
      return next
    })
  }, [])

  const handleChannelCreated = useCallback(
    (_channel: AlertChannel) => {
      void queryClient.invalidateQueries({ queryKey: channelsKey })
    },
    [queryClient]
  )

  const handleChannelDeleted = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: channelsKey })
  }, [queryClient])

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading alerts...</p>
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">Failed to load alert settings</p>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5 rounded-full"
        >
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Alerts</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Notification channels and default alert preferences.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3 text-[12px] font-medium transition-transform active:scale-[0.96]"
          onClick={() => void refetch()}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      {/* Master switch — one Settings row */}
      <Group index={0}>
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5">
              {globalEnabled && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              )}
              <span className={cn("relative inline-flex size-2.5 rounded-full", globalEnabled ? "bg-success" : "bg-muted-foreground/40")} />
            </span>
            <div>
              <p className="text-[14px] font-medium">{globalEnabled ? "Alerts are on" : "Alerts are paused"}</p>
              <p className="text-[12px] text-muted-foreground">
                {globalEnabled ? "You’ll be notified for enabled events." : "All notifications are paused until you turn this back on."}
              </p>
            </div>
          </div>
          <Switch checked={globalEnabled} onCheckedChange={toggleGlobal} aria-label="Alerts" />
        </div>
      </Group>

      <SegmentedControl<AlertsTab>
        label="Section"
        value={tab}
        options={[
          { value: "channels", label: "Channels" },
          { value: "preferences", label: "Preferences" },
        ]}
        onChange={setTab}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          className="space-y-6"
        >
          {tab === "channels" ? (
            <>
              {channels.length > 0 && <ChannelStats channels={channels} />}

              <Group
                index={0}
                title="Notification channels"
                hint="Shared across all your deployments. Use Test to verify a channel before relying on it."
                action={<AddChannelDialog onCreated={handleChannelCreated} />}
              >
                {channels.length === 0 ? (
                  <ChannelsEmptyState />
                ) : (
                  <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    {channels.map((ch) => (
                      <li key={ch.id}>
                        <ChannelCard channel={ch} onDeleted={handleChannelDeleted} />
                      </li>
                    ))}
                  </ul>
                )}
              </Group>
            </>
          ) : (
            <>
              <Group
                index={0}
                title="Default events"
                hint="Defaults for new alert rules. Override per deployment in its Alerts page."
              >
                <AlertPreferences enabledEvents={enabledEvents} onToggle={toggleEvent} disabled={!globalEnabled} />
                {!globalEnabled && (
                  <p className="border-t border-black/[0.05] px-5 py-3 text-[12px] text-warning dark:border-white/[0.06]">
                    Alerts are paused — turn the switch above back on to resume notifications.
                  </p>
                )}
              </Group>

              <Group index={0} title="Events">
                <ul className="grid grid-cols-1 divide-y divide-black/[0.05] sm:grid-cols-2 sm:divide-x dark:divide-white/[0.06] [&>li:nth-child(-n+2)]:sm:border-t-0">
                  {EVENT_REF.map((ev) => (
                    <li key={ev.label} className="flex items-start gap-3 px-5 py-3">
                      <span className={cn("mt-[5px] size-2 shrink-0 rounded-full", ev.dot)} />
                      <div className="min-w-0">
                        <code className="font-mono text-[12px]">{ev.label}</code>
                        <p className="text-[12px] leading-[1.4] text-muted-foreground">{ev.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Group>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}

/** Inset-grouped section with optional sentence-case title, hint, and right-aligned action. */
function Group({
  title,
  hint,
  action,
  index,
  children,
}: {
  title?: string
  hint?: string
  action?: React.ReactNode
  index: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4, delay: index * 0.04 }}
      className="space-y-1.5"
    >
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-3">
          <div>
            {title && <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>}
            {hint && <p className="text-[12px] text-muted-foreground/70">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}

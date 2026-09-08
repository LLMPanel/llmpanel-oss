"use client"

import type { ChannelStats } from "@/hooks/use-channels"
import { relativeTime } from "./channel-shared"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ChannelStatsRow({ stats }: { stats: ChannelStats | null }) {
  return (
    <section
      aria-label="Channel stats"
      className="grid grid-cols-2 overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] lg:grid-cols-4 lg:divide-x lg:divide-black/[0.06] dark:ring-white/[0.06] dark:lg:divide-white/[0.06]"
    >
      <Stat label="Messages" value={stats ? String(stats.totalMessages) : "—"} />
      <Stat
        label="Last 24 hours"
        value={stats ? String(stats.messages24h) : "—"}
        hint={stats?.lastMessageAt ? `Last ${relativeTime(stats.lastMessageAt)}` : undefined}
      />
      <Stat label="Unique users" value={stats ? String(stats.uniqueUsers) : "—"} />
      <Stat label="Connected" value={stats?.connectedAt ? relativeTime(stats.connectedAt) : "—"} />
    </section>
  )
}

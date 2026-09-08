"use client"

import { use, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useChannel, useChannelStats } from "@/hooks/use-channels"
import { useDeploymentAgents } from "@/hooks/use-deployment-agents"
import {
  ChannelPlatformIcon,
  channelPlatformLabel,
} from "@/components/channels/platform-icon"
import {
  StatusDot,
  AgentBadge,
  statusLabel,
  useChannelActions,
} from "@/components/channels/channel-shared"
import { ChannelStatsRow } from "@/components/channels/channel-stats-row"
import { ChannelConversationsTab } from "@/components/channels/channel-conversations-tab"
import { ChannelSettingsTab } from "@/components/channels/channel-settings-tab"

type ChannelTab = "conversations" | "settings"

export default function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string; channelId: string }>
}) {
  const { id: deploymentId, channelId } = use(params)
  const router = useRouter()
  const listHref = `/dashboard/deployments/${deploymentId}/channels`
  const [tab, setTab] = useState<ChannelTab>("conversations")

  const { channel, isLoading, error, refetch } = useChannel(deploymentId, channelId)
  const { stats } = useChannelStats(deploymentId, channelId, { pollMs: 15_000 })
  const { agents } = useDeploymentAgents(deploymentId)
  const actions = useChannelActions(deploymentId, channelId, () => void refetch())

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading channel...</p>
      </div>
    )
  }

  if (error || !channel) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{error ?? "Channel not found"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={listHref}>Back to channels</Link>
          </Button>
        </div>
      </div>
    )
  }

  const pill = "h-8 gap-1.5 rounded-full px-3.5 text-[12px] font-medium transition-transform active:scale-[0.96]"

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 px-1 text-[14px] text-primary transition-opacity active:opacity-60"
      >
        <ArrowLeft className="size-4" strokeWidth={2.25} />
        Channels
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-[18px] bg-muted text-foreground">
            <ChannelPlatformIcon platform={channel.platform} className="size-7" />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[28px] font-semibold leading-none tracking-[-0.025em]">
                {channel.name}
              </h1>
              <StatusDot status={channel.status} statusMessage={channel.statusMessage} showLabel />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                {channelPlatformLabel(channel.platform)}
              </span>
              <AgentBadge channel={channel} />
            </div>
            {channel.status === "error" && channel.statusMessage && (
              <p className="mt-2 text-[13px] text-destructive">{channel.statusMessage}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {channel.status === "active" ? (
            <>
              <Button variant="secondary" className={pill} onClick={actions.restart} disabled={actions.isBusy}>
                {actions.isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Restart
              </Button>
              <Button variant="secondary" className={pill} onClick={actions.stop} disabled={actions.isBusy}>
                <Square className="size-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <Button className={pill} onClick={actions.start} disabled={actions.isBusy}>
              {actions.isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Start
            </Button>
          )}
        </div>
      </header>

      <ChannelStatsRow stats={stats} />

      <SegmentedControl<ChannelTab>
        label="Section"
        value={tab}
        options={[
          { value: "conversations", label: "Conversations" },
          { value: "settings", label: "Settings" },
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
        >
          {tab === "conversations" ? (
            <ChannelConversationsTab deploymentId={deploymentId} channelId={channelId} />
          ) : (
            <ChannelSettingsTab
              deploymentId={deploymentId}
              channel={channel}
              agents={agents}
              onSaved={() => void refetch()}
              onDeleted={() => router.push(listHref)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}

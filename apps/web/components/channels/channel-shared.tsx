"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Channel, ChannelStatus } from "@/hooks/use-channels"
import {
  startChannel,
  stopChannel,
  restartChannel,
  disconnectChannel,
} from "@/hooks/use-channels"

export function statusColor(status: ChannelStatus): string {
  switch (status) {
    case "active": return "bg-success"
    case "error": return "bg-destructive"
    default: return "bg-warning"
  }
}

export function statusLabel(status: ChannelStatus): string {
  switch (status) {
    case "active": return "Connected"
    case "error": return "Error"
    default: return "Stopped"
  }
}

export function StatusDot({
  status,
  statusMessage,
  showLabel = false,
}: {
  status: ChannelStatus
  statusMessage?: string | null
  showLabel?: boolean
}) {
  const dot = (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${statusColor(status)}`} />
      {showLabel && (
        <span className="text-[13px] text-muted-foreground">{statusLabel(status)}</span>
      )}
    </span>
  )
  if (!statusMessage) return dot
  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {statusMessage}
      </TooltipContent>
    </Tooltip>
  )
}

export function AgentBadge({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
      {channel.agent ? (
        <>
          <span>{channel.agent.emoji ?? "🤖"}</span>
          <span className="max-w-[120px] truncate">{channel.agent.name}</span>
        </>
      ) : (
        "Direct"
      )}
    </span>
  )
}

export function relativeTime(value: string | null): string {
  if (!value) return "—"
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return "—"
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

/** Start/stop/restart/delete handlers shared by the card and the detail page. */
export function useChannelActions(
  deploymentId: string,
  channelId: string,
  onChanged: () => void
) {
  const [isBusy, setIsBusy] = useState(false)

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setIsBusy(true)
    try {
      await action()
      toast.success(successMessage)
      // Give the backend a moment to update the adapter status before refetch
      setTimeout(onChanged, 1200)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setIsBusy(false)
    }
  }

  return {
    isBusy,
    start: () => run(() => startChannel(deploymentId, channelId), "Channel starting"),
    stop: () => run(() => stopChannel(deploymentId, channelId), "Channel stopped"),
    restart: () => run(() => restartChannel(deploymentId, channelId), "Channel restarting"),
    remove: () => run(() => disconnectChannel(deploymentId, channelId), "Channel disconnected"),
  }
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { Trash2, Play, Square, RefreshCw, Loader2 } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Channel } from "@/hooks/use-channels"
import { ChannelPlatformIcon, channelPlatformLabel } from "./platform-icon"
import { StatusDot, AgentBadge, relativeTime, useChannelActions } from "./channel-shared"

/** iOS sheet curve — matches every other transition in the app. */
const EASE = "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]"

interface ChannelCardProps {
  channel: Channel
  deploymentId: string
  onChanged: () => void
  index?: number
}

export function ChannelCard({ channel, deploymentId, onChanged, index = 0 }: ChannelCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const actions = useChannelActions(deploymentId, channel.id, onChanged)

  const statusLine =
    channel.status === "active" && channel.connectedAt
      ? `Connected ${relativeTime(channel.connectedAt)}`
      : channel.status === "error"
        ? (channel.statusMessage ?? "Connection error")
        : "Not running"

  return (
    <>
      {/*
        The card used to be one big <Link> with the action buttons inside it.
        Buttons nested in an <a> are invalid HTML — and they only worked because
        every handler called preventDefault on the anchor. The link is now a
        stretched sibling that covers the card, so the whole surface still
        navigates while the buttons are real, top-level buttons.
      */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4, delay: Math.min(index, 8) * 0.03 }}
        className={cn(
          "group relative flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-black/[0.06] dark:ring-white/[0.06]",
          "transition-[box-shadow,transform] duration-150",
          EASE,
          "motion-reduce:transition-none",
          "hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] active:scale-[0.99] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
          "motion-reduce:active:scale-100"
        )}
      >
        <Link
          href={`/dashboard/deployments/${deploymentId}/channels/${channel.id}`}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="sr-only">Open {channel.name}</span>
        </Link>

        {/* Content sits above the link but lets clicks fall through to it;
            anything with its own behaviour opts back in below. */}
        <div className="pointer-events-none relative flex items-start gap-3">
          {/* One neutral tile. The platform used to be tinted here *and* on a
              brand-coloured badge below — the same fact, twice, in colour. */}
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <ChannelPlatformIcon platform={channel.platform} className="size-[18px]" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{channel.name}</p>
              <span className="pointer-events-auto shrink-0">
                <StatusDot
                  status={channel.status}
                  statusMessage={channel.statusMessage}
                />
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <AgentBadge channel={channel} />
              {channel.memoryEnabled && (
                <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                  Memory
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
          {/* Platform moved here as plain text — the tile shows it, this names
              it, and it shares the line with the status it belongs to. */}
          <p className="pointer-events-none min-w-0 truncate text-[12px] text-muted-foreground">
            {channelPlatformLabel(channel.platform)}
            <span className="text-muted-foreground/40"> · </span>
            {statusLine}
          </p>

          {/* Always visible. These were opacity-0 until hover, which put every
              action out of reach on touch and made a keyboard-focused button
              invisible. */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {channel.status === "active" ? (
              <>
                <ActionButton
                  onClick={actions.restart}
                  disabled={actions.isBusy}
                  busy={actions.isBusy}
                  icon={RefreshCw}
                  label="Restart"
                />
                <ActionButton
                  onClick={actions.stop}
                  disabled={actions.isBusy}
                  icon={Square}
                  label="Stop"
                />
              </>
            ) : (
              <ActionButton
                onClick={actions.start}
                disabled={actions.isBusy}
                busy={actions.isBusy}
                icon={Play}
                label="Start"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Disconnect ${channel.name}`}
              className={cn(
                "size-7 rounded-full p-0 text-muted-foreground/60 hover:text-destructive",
                "transition-[color,transform] duration-100 active:scale-[0.9]",
                EASE,
                "motion-reduce:transition-none"
              )}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </motion.div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect channel?</DialogTitle>
            <DialogDescription>
              <strong>{channel.name}</strong> will be disconnected and the
              adapter will stop receiving messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setDeleteOpen(false)}
              disabled={actions.isBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                actions.remove()
                setDeleteOpen(false)
              }}
              disabled={actions.isBusy}
              className="gap-1.5 rounded-full px-4"
            >
              {actions.isBusy && <Loader2 className="size-3.5 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ActionButton({
  onClick,
  disabled,
  busy,
  icon: Icon,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 gap-1 rounded-full bg-muted px-2.5 text-[12px] font-medium text-foreground",
        "hover:bg-accent",
        "transition-[background-color,transform] duration-100 active:scale-[0.95]",
        EASE,
        "motion-reduce:transition-none"
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Icon className="size-3" />
      )}
      {label}
    </Button>
  )
}

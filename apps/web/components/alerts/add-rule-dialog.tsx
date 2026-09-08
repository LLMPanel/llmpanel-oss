"use client"

import { useState } from "react"
import { Plus, Loader2, Bell } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { AlertChannel, AlertEvent, AlertRule } from "@/hooks/use-alerts"
import { createAlertRule } from "@/hooks/use-alerts"
import { PlatformIcon, platformLabel, platformColor } from "./platform-icon"

// ── Event options ──────────────────────────────────────────────────────────

const ALL_EVENTS: Array<{
  id: AlertEvent
  label: string
  description: string
  dotClass: string
}> = [
  {
    id: "deployment.started",
    label: "Deployment started",
    description: "When provisioning begins",
    dotClass: "bg-primary",
  },
  {
    id: "deployment.running",
    label: "Deployment running",
    description: "When the model goes live",
    dotClass: "bg-success",
  },
  {
    id: "deployment.failed",
    label: "Deployment failed",
    description: "When an error occurs",
    dotClass: "bg-destructive",
  },
  {
    id: "deployment.stopped",
    label: "Deployment stopped",
    description: "When manually stopped",
    dotClass: "bg-muted-foreground",
  },
]

// ── Channel picker tile ──────────────────────────────────────────────────────

function ChannelTile({
  channel,
  selected,
  onSelect,
}: {
  channel: AlertChannel
  selected: boolean
  onSelect: () => void
}) {
  const accentClass = platformColor(channel.platform)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left w-full transition-all",
        "hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          accentClass,
        ].join(" ")}
      >
        <PlatformIcon platform={channel.platform} className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{channel.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {platformLabel(channel.platform)}
        </p>
      </div>
      {selected && (
        <div className="size-2 rounded-full bg-primary shrink-0" />
      )}
    </button>
  )
}

// ── Main dialog ──────────────────────────────────────────────────────────────

interface AddRuleDialogProps {
  deploymentId: string
  channels: AlertChannel[]
  onCreated: (rule: AlertRule) => void
}

export function AddRuleDialog({
  deploymentId,
  channels,
  onCreated,
}: AddRuleDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<Set<AlertEvent>>(
    new Set(["deployment.failed", "deployment.running"])
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setSelectedChannel(null)
    setSelectedEvents(new Set(["deployment.failed", "deployment.running"]))
    setIsSubmitting(false)
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (!v) reset()
  }

  const toggleEvent = (event: AlertEvent) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(event)) next.delete(event)
      else next.add(event)
      return next
    })
  }

  const isValid = selectedChannel !== null && selectedEvents.size > 0

  const handleSubmit = async () => {
    if (!selectedChannel || selectedEvents.size === 0) return
    setIsSubmitting(true)
    try {
      const rule = await createAlertRule(deploymentId, {
        channelId: selectedChannel,
        events: Array.from(selectedEvents),
      })
      onCreated(rule)
      toast.success("Alert rule created", {
        description: `Notifications will be sent for ${selectedEvents.size} event${selectedEvents.size > 1 ? "s" : ""}.`,
      })
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create alert rule")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]"
          disabled={channels.length === 0}
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          Add Rule
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">New alert rule</DialogTitle>
          <DialogDescription className="text-xs">
            Choose a channel and which events should trigger a notification.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Channel selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Send to channel</Label>
            <div className="space-y-2">
              {channels.map((ch) => (
                <ChannelTile
                  key={ch.id}
                  channel={ch}
                  selected={selectedChannel === ch.id}
                  onSelect={() => setSelectedChannel(ch.id)}
                />
              ))}
            </div>
          </div>

          {/* Event selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Trigger on events</Label>
            <div className="rounded-xl border overflow-hidden divide-y">
              {ALL_EVENTS.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => toggleEvent(event.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={[
                        "size-2 rounded-full shrink-0",
                        event.dotClass,
                      ].join(" ")}
                    />
                    <div>
                      <p className="text-sm">{event.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {event.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={selectedEvents.has(event.id)}
                    onCheckedChange={() => toggleEvent(event.id)}
                    className="pointer-events-none"
                  />
                </div>
              ))}
            </div>
            {selectedEvents.size === 0 && (
              <p className="text-xs text-destructive">
                Select at least one event.
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!isValid || isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            <Bell className="size-3.5" />
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState } from "react"
import { Trash2, FlaskConical, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AlertChannel } from "@/hooks/use-alerts"
import { deleteAlertChannel, testAlertChannel } from "@/hooks/use-alerts"
import { PlatformIcon, platformLabel } from "./platform-icon"

interface ChannelCardProps {
  channel: AlertChannel
  onDeleted: () => void
}

export function ChannelCard({ channel, onDeleted }: ChannelCardProps) {
  const [isTesting, setIsTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleTest = async () => {
    setIsTesting(true)
    setTestSuccess(false)
    try {
      await testAlertChannel(channel.id)
      setTestSuccess(true)
      toast.success("Test alert sent!", {
        description: "Check your notification channel for the test message.",
      })
      setTimeout(() => setTestSuccess(false), 3000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send test alert")
    } finally {
      setIsTesting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteAlertChannel(channel.id)
      toast.success("Channel removed")
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove channel")
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <PlatformIcon platform={channel.platform} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{channel.name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {platformLabel(channel.platform)}
            <span className="text-muted-foreground/40"> · </span>
            Added {new Date(channel.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>

        {/* Always visible — hover-only actions are unreachable on touch. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1 rounded-full bg-muted px-2.5 text-[12px] font-medium transition-[transform,background-color] hover:bg-accent active:scale-[0.95]",
              testSuccess && "text-success"
            )}
            onClick={() => void handleTest()}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : testSuccess ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <FlaskConical className="size-3.5" />
            )}
            {testSuccess ? "Sent" : "Test"}
          </Button>
          <button
            type="button"
            aria-label={`Remove ${channel.name}`}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground/60 transition-[transform,color,background-color] duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-90"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em]">Remove &ldquo;{channel.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Any alert rules using this channel will stop sending notifications.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="gap-1.5 rounded-full px-4"
            >
              {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

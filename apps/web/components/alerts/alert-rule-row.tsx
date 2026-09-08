"use client"

import { useState } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AlertRule } from "@/hooks/use-alerts"
import { updateAlertRule, deleteAlertRule } from "@/hooks/use-alerts"
import { PlatformIcon } from "./platform-icon"

const EVENT_LABELS: Record<string, { label: string; dotClass: string }> = {
  "deployment.started": { label: "Started",  dotClass: "bg-primary" },
  "deployment.running": { label: "Running",  dotClass: "bg-success" },
  "deployment.failed":  { label: "Failed",   dotClass: "bg-destructive" },
  "deployment.stopped": { label: "Stopped",  dotClass: "bg-muted-foreground" },
}

interface AlertRuleRowProps {
  rule: AlertRule
  deploymentId: string
  onDeleted: () => void
  onUpdated: () => void
}

export function AlertRuleRow({
  rule,
  deploymentId,
  onDeleted,
  onUpdated,
}: AlertRuleRowProps) {
  const [isActive, setIsActive] = useState(rule.isActive)
  const [isToggling, setIsToggling] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggle = async () => {
    const next = !isActive
    setIsActive(next)
    setIsToggling(true)
    try {
      await updateAlertRule(deploymentId, rule.id, { isActive: next })
      onUpdated()
      toast.success(next ? "Rule enabled" : "Rule paused")
    } catch (e) {
      setIsActive(!next) // revert
      toast.error(e instanceof Error ? e.message : "Failed to update rule")
    } finally {
      setIsToggling(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteAlertRule(deploymentId, rule.id)
      toast.success("Alert rule removed")
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove rule")
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className={cn("flex items-center gap-4 px-5 py-3.5 transition-opacity", !isActive && "opacity-50")}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <PlatformIcon platform={rule.channel.platform} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{rule.channel.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {rule.events.map((event) => {
              const meta = EVENT_LABELS[event]
              if (!meta) return null
              return (
                <span key={event} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span className={cn("size-1.5 shrink-0 rounded-full", meta.dotClass)} />
                  {meta.label}
                </span>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={() => void handleToggle()}
            disabled={isToggling}
            aria-label={isActive ? "Pause rule" : "Enable rule"}
          />
          <button
            type="button"
            aria-label="Remove rule"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground/60 transition-[transform,color,background-color] duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-90"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em]">Remove this rule?</DialogTitle>
            <DialogDescription>
              {rule.channel.name} will stop receiving notifications for this deployment.
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

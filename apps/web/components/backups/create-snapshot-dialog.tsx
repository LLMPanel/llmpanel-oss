"use client"

import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  createSnapshot,
  type DeploymentBackup,
} from "@/hooks/use-deployment-backups"

// ── Optional-data toggle row ────────────────────────────────────────

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ── Dialog ──────────────────────────────────────────────────────────

interface CreateSnapshotDialogProps {
  deploymentId: string
  onComplete?: (backup: DeploymentBackup) => void
}

export function CreateSnapshotDialog({
  deploymentId,
  onComplete,
}: CreateSnapshotDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [requestLogs, setRequestLogs] = useState(false)
  const [metrics, setMetrics] = useState(false)
  const [images, setImages] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setName("")
    setRequestLogs(false)
    setMetrics(false)
    setImages(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    setOpen(next)
    if (!next) reset()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const backup = await createSnapshot(deploymentId, {
        name: name.trim() || undefined,
        requestLogs,
        metrics,
        images,
      })
      toast.success(`Backup "${backup.name}" created.`)
      onComplete?.(backup)
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create backup")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]">
          <Plus className="size-3.5" strokeWidth={2.5} />
          Create backup
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Create backup</DialogTitle>
          <DialogDescription className="text-xs">
            Takes a point-in-time snapshot of this deployment — agents, chat
            history, knowledge base (with embeddings), API keys, channels and
            alert rules. Stored on the server and downloadable as a file.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="backup-name" className="text-xs font-medium">
              Name
            </Label>
            <Input
              id="backup-name"
              placeholder="e.g. Before prompt rework"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
              maxLength={120}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Optional — defaults to the creation date.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Optional data (can make backups much larger)
            </p>
            <ToggleRow
              id="include-logs"
              label="Request logs"
              hint="Gateway usage history, including request/response bodies."
              checked={requestLogs}
              onChange={setRequestLogs}
            />
            <ToggleRow
              id="include-metrics"
              label="GPU metrics"
              hint="Time-series GPU/container samples (last 24h retained)."
              checked={metrics}
              onChange={setMetrics}
            />
            <ToggleRow
              id="include-images"
              label="Image history"
              hint="Generated-image records (prompts and parameters, not the image files)."
              checked={images}
              onChange={setImages}
            />
          </div>
        </DialogBody>

        <DialogFooter className="px-6 py-4 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            {isSubmitting ? "Creating…" : "Create backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

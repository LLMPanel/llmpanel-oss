"use client"

import { useRef, useState } from "react"
import { FileUp, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { importSnapshot } from "@/hooks/use-deployment-backups"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ImportSnapshotDialogProps {
  deploymentId: string
  onComplete?: () => void
}

/**
 * "Import backup" — pick an exported snapshot .json, confirm, then merge it
 * into this deployment. Files exported from a different deployment are
 * remapped to new ids server-side so nothing else is touched.
 */
export function ImportSnapshotDialog({
  deploymentId,
  onComplete,
}: ImportSnapshotDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    e.target.value = "" // allow re-picking the same file
    if (!picked) return
    setFile(picked)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    if (!next) setFile(null)
  }

  const handleImport = async () => {
    if (!file) return
    setIsSubmitting(true)
    try {
      const { restore } = await importSnapshot(deploymentId, file)
      toast.success(
        `Backup imported — ${restore.agents} agents, ${restore.threads} threads, ` +
          `${restore.collections} collections, ${restore.chunks} chunks restored.`
      )
      setFile(null)
      onComplete?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import backup")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handlePick}
      />
      <Button
        size="sm"
        variant="secondary"
        className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-3.5" />
        Import backup
      </Button>

      <Dialog open={file != null} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Import backup</DialogTitle>
            <DialogDescription className="text-xs">
              Restores the snapshot into this deployment. Existing data is
              merged — matching rows are updated, new rows are added, nothing
              is deleted. A copy is kept in the backup history.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {file && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileUp className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </div>
            )}
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
              onClick={() => void handleImport()}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              {isSubmitting ? "Importing…" : "Import & restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

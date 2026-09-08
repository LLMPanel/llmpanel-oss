"use client"

import { useState } from "react"
import {
  Archive,
  Download,
  History,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  restoreSnapshot,
  deleteSnapshot,
  snapshotDownloadUrl,
  type DeploymentBackup,
} from "@/hooks/use-deployment-backups"

// ── Helpers ─────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/** Compact "2 agents · 14 chats · 3 collections · 900 chunks" summary. */
function contentsSummary(b: DeploymentBackup): string {
  const c = b.counts
  const parts: string[] = []
  if (c.agents) parts.push(`${c.agents} agent${c.agents === 1 ? "" : "s"}`)
  if (c.threads) parts.push(`${c.threads} chat${c.threads === 1 ? "" : "s"}`)
  if (c.collections)
    parts.push(`${c.collections} collection${c.collections === 1 ? "" : "s"}`)
  if (c.chunks) parts.push(`${c.chunks} chunks`)
  if (c.apiKeys) parts.push(`${c.apiKeys} key${c.apiKeys === 1 ? "" : "s"}`)
  if (c.channels) parts.push(`${c.channels} channel${c.channels === 1 ? "" : "s"}`)
  if (c.requestLogs) parts.push(`${c.requestLogs} logs`)
  if (c.metricSamples) parts.push(`${c.metricSamples} metric samples`)
  if (c.images) parts.push(`${c.images} images`)
  return parts.length ? parts.join(" · ") : "Empty snapshot"
}

// ── Row actions ─────────────────────────────────────────────────────

function IconAction({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-[transform,color,background-color] duration-100 active:scale-90 disabled:opacity-50",
              destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
            )}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── List ────────────────────────────────────────────────────────────

interface SnapshotListProps {
  backups: DeploymentBackup[]
  isLoading: boolean
  onChanged: () => void
}

export function SnapshotList({ backups, isLoading, onChanged }: SnapshotListProps) {
  const [confirmRestore, setConfirmRestore] = useState<DeploymentBackup | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DeploymentBackup | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleRestore = async (backup: DeploymentBackup) => {
    setBusyId(backup.id)
    try {
      const result = await restoreSnapshot(backup.id)
      const skipped = result.apiKeysSkipped + result.alertRulesSkipped
      toast.success(
        `Restored "${backup.name}" — ${result.agents} agents, ${result.threads} chats, ` +
          `${result.collections} collections, ${result.chunks} chunks.` +
          (skipped ? ` ${skipped} rows skipped (missing references).` : "")
      )
      setConfirmRestore(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restore backup")
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (backup: DeploymentBackup) => {
    setBusyId(backup.id)
    try {
      await deleteSnapshot(backup.id)
      toast.success(`Backup "${backup.name}" deleted.`)
      setConfirmDelete(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete backup")
    } finally {
      setBusyId(null)
    }
  }

  const handleDownload = (backup: DeploymentBackup) => {
    const a = document.createElement("a")
    a.href = snapshotDownloadUrl(backup.id)
    a.download = backup.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    )
  }

  if (backups.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-6 py-14 text-center ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
      >
        <History className="mb-1 size-6 text-muted-foreground/40" strokeWidth={1.75} />
        <p className="text-[15px] font-semibold tracking-[-0.01em]">No backups yet</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Create a backup to snapshot this deployment&apos;s agents, chats and
          knowledge base — or import one from a file.
        </p>
      </motion.div>
    )
  }

  return (
    <>
      <section
        aria-label="Backups"
        className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
      >
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {backups.map((backup, i) => {
            const busy = busyId === backup.id
            return (
              <motion.li
                key={backup.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(i, 10) * 0.025 }}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Archive className="size-[18px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{backup.name}</p>
                    {backup.source === "import" && (
                      <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                        Imported
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {formatDate(backup.createdAt)}
                    <span className="text-muted-foreground/40"> · </span>
                    {formatBytes(backup.sizeBytes)}
                    <span className="text-muted-foreground/40"> · </span>
                    {contentsSummary(backup)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconAction
                    label="Restore"
                    onClick={() => setConfirmRestore(backup)}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                  </IconAction>
                  <IconAction
                    label="Download"
                    onClick={() => handleDownload(backup)}
                    disabled={busy}
                  >
                    <Download className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Delete"
                    onClick={() => setConfirmDelete(backup)}
                    disabled={busy}
                    destructive
                  >
                    <Trash2 className="size-4" />
                  </IconAction>
                </div>
              </motion.li>
            )
          })}
        </ul>
      </section>

      {/* Restore confirmation */}
      <Dialog
        open={confirmRestore != null}
        onOpenChange={(o) => !o && busyId == null && setConfirmRestore(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em]">Restore this backup?</DialogTitle>
            <DialogDescription>
              Merges &quot;{confirmRestore?.name}&quot; into this deployment.
              Rows that still exist are reverted to their backed-up state, and
              anything deleted since is recreated. Data added after the backup
              is kept — nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {confirmRestore && (
              <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[12px] leading-[1.45] text-muted-foreground">
                {formatDate(confirmRestore.createdAt)} ·{" "}
                {contentsSummary(confirmRestore)}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="px-6 py-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirmRestore(null)}
              disabled={busyId != null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => confirmRestore && void handleRestore(confirmRestore)}
              disabled={busyId != null}
              className="gap-1.5 rounded-full px-4"
            >
              {busyId != null && <Loader2 className="size-3.5 animate-spin" />}
              {busyId != null ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete != null}
        onOpenChange={(o) => !o && busyId == null && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em]">Delete this backup?</DialogTitle>
            <DialogDescription>
              &quot;{confirmDelete?.name}&quot; and its snapshot file will be
              removed. This does not affect the deployment&apos;s live data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 py-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId != null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmDelete && void handleDelete(confirmDelete)}
              disabled={busyId != null}
              className="gap-1.5 rounded-full px-4"
            >
              {busyId != null && <Loader2 className="size-3.5 animate-spin" />}
              {busyId != null ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

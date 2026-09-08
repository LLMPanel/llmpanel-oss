"use client"

import { useState } from "react"
import { DownloadCloud, Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useRestoreBackup, type RestoreResult } from "@/hooks/use-backups"

// ── Secret input with reveal toggle ─────────────────────────────────

function SecretInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10 font-mono text-sm"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide secret" : "Show secret"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

// ── Field row ───────────────────────────────────────────────────────

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── Dialog ──────────────────────────────────────────────────────────

interface RestoreS3DialogProps {
  onComplete?: (result: RestoreResult) => void
}

const EMPTY = {
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  key: "",
}

export function RestoreS3Dialog({ onComplete }: RestoreS3DialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const { restoreBackup, isSubmitting } = useRestoreBackup()

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isValid =
    form.region.trim() &&
    form.bucket.trim() &&
    form.accessKeyId.trim() &&
    form.secretAccessKey.trim() &&
    form.key.trim()

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    setOpen(next)
    if (!next) setForm({ ...EMPTY })
  }

  const handleSubmit = async () => {
    try {
      const result = await restoreBackup({
        endpoint: form.endpoint.trim() || undefined,
        region: form.region.trim(),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey,
        key: form.key.trim(),
      })
      const skipped =
        result.collectionsSkipped > 0
          ? ` (${result.collectionsSkipped} skipped — deployment missing)`
          : ""
      toast.success(
        `Restored ${result.collectionsRestored} collections, ${result.documents} documents, ${result.chunks} chunks${skipped}.`
      )
      onComplete?.(result)
      setOpen(false)
      setForm({ ...EMPTY })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restore backup")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]">
          <DownloadCloud className="size-3.5" />
          Restore from S3
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Restore RAG data from S3</DialogTitle>
          <DialogDescription className="text-xs">
            Downloads a backup JSON by object key and restores it into your
            account.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/5 p-3">
            <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Existing collections, documents and chunks with matching IDs will
              be overwritten. Collections whose deployment no longer exists are
              skipped.
            </p>
          </div>

          <Field
            id="restore-key"
            label="Object key"
            hint="Path of the backup file in the bucket."
          >
            <Input
              id="restore-key"
              placeholder="llmpanel-backups/rag-backup-2026-06-28T….json"
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              className="text-sm font-mono"
              autoFocus
            />
          </Field>

          <Field id="restore-bucket" label="Bucket">
            <Input
              id="restore-bucket"
              placeholder="my-backups"
              value={form.bucket}
              onChange={(e) => set("bucket", e.target.value)}
              className="text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="restore-region" label="Region">
              <Input
                id="restore-region"
                placeholder="us-east-1"
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className="text-sm"
              />
            </Field>
            <Field
              id="restore-endpoint"
              label="Endpoint"
              hint="Optional (MinIO/R2)."
            >
              <Input
                id="restore-endpoint"
                placeholder="https://…"
                value={form.endpoint}
                onChange={(e) => set("endpoint", e.target.value)}
                className="text-sm font-mono"
              />
            </Field>
          </div>

          <Field id="restore-access-key" label="Access Key ID">
            <Input
              id="restore-access-key"
              placeholder="AKIA…"
              value={form.accessKeyId}
              onChange={(e) => set("accessKeyId", e.target.value)}
              className="text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field id="restore-secret-key" label="Secret Access Key">
            <SecretInput
              id="restore-secret-key"
              placeholder="••••••••••••••••••••"
              value={form.secretAccessKey}
              onChange={(v) => set("secretAccessKey", v)}
            />
          </Field>
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
            disabled={!isValid || isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            {isSubmitting ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

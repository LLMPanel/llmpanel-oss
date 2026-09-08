"use client"

import { useState } from "react"
import { CloudUpload, Loader2, Eye, EyeOff } from "lucide-react"
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
import { useCreateBackup, type BackupResult } from "@/hooks/use-backups"

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

interface BackupS3DialogProps {
  onComplete?: (result: BackupResult) => void
}

const EMPTY = {
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  prefix: "llmpanel-backups",
}

export function BackupS3Dialog({ onComplete }: BackupS3DialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const { createBackup, isSubmitting } = useCreateBackup()

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isValid =
    form.region.trim() &&
    form.bucket.trim() &&
    form.accessKeyId.trim() &&
    form.secretAccessKey.trim()

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    setOpen(next)
    if (!next) setForm({ ...EMPTY })
  }

  const handleSubmit = async () => {
    try {
      const result = await createBackup({
        endpoint: form.endpoint.trim() || undefined,
        region: form.region.trim(),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey,
        prefix: form.prefix.trim() || undefined,
      })
      toast.success(
        `Backup uploaded — ${result.collections} collections, ${result.documents} documents, ${result.chunks} chunks.`
      )
      onComplete?.(result)
      setOpen(false)
      setForm({ ...EMPTY })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create backup")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]">
          <CloudUpload className="size-3.5" />
          Backup to S3
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Backup RAG data to S3</DialogTitle>
          <DialogDescription className="text-xs">
            Exports all your RAG collections, documents and chunks as a single
            JSON file. Credentials are used only for this upload and never
            stored.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field
            id="s3-bucket"
            label="Bucket"
            hint="The destination S3 bucket name."
          >
            <Input
              id="s3-bucket"
              placeholder="my-backups"
              value={form.bucket}
              onChange={(e) => set("bucket", e.target.value)}
              className="text-sm"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="s3-region" label="Region">
              <Input
                id="s3-region"
                placeholder="us-east-1"
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className="text-sm"
              />
            </Field>
            <Field
              id="s3-prefix"
              label="Prefix"
              hint="Optional folder."
            >
              <Input
                id="s3-prefix"
                placeholder="llmpanel-backups"
                value={form.prefix}
                onChange={(e) => set("prefix", e.target.value)}
                className="text-sm"
              />
            </Field>
          </div>

          <Field
            id="s3-endpoint"
            label="Endpoint"
            hint="Optional — set for MinIO, Cloudflare R2 or other S3-compatible stores."
          >
            <Input
              id="s3-endpoint"
              placeholder="https://s3.amazonaws.com"
              value={form.endpoint}
              onChange={(e) => set("endpoint", e.target.value)}
              className="text-sm font-mono"
            />
          </Field>

          <Field id="s3-access-key" label="Access Key ID">
            <Input
              id="s3-access-key"
              placeholder="AKIA…"
              value={form.accessKeyId}
              onChange={(e) => set("accessKeyId", e.target.value)}
              className="text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field id="s3-secret-key" label="Secret Access Key">
            <SecretInput
              id="s3-secret-key"
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
            {isSubmitting ? "Backing up…" : "Start backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { use, useState } from "react"
import { motion, MotionConfig } from "motion/react"
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import {
  useApiKeys,
  useApiKeyUsage,
  createApiKey,
  deleteApiKey,
  type ApiKey,
  type CreateApiKeyInput,
} from "@/hooks/use-api-keys"

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

// Borderless muted field — the same treatment as the chat composer.
const FIELD = "rounded-xl border-0 bg-muted shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"
const FIELD_LABEL = "px-1 text-[12px] font-medium text-muted-foreground"
const PILL = "rounded-full transition-transform active:scale-[0.96]"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type KeyStatus = { label: string; dot: string }

function keyStatus(key: ApiKey): KeyStatus {
  if (!key.isActive) return { label: "Revoked", dot: "bg-destructive" }
  if (key.expiresAt && new Date(key.expiresAt) < new Date())
    return { label: "Expired", dot: "bg-warning" }
  return { label: "Active", dot: "bg-success" }
}

function formatLimit(val: number | null) {
  return val == null ? "∞" : val.toLocaleString()
}

function formatExpiry(val: string | null) {
  if (!val) return "Never expires"
  return `Expires ${new Date(val).toLocaleDateString(undefined, { dateStyle: "medium" })}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Small pieces
// ─────────────────────────────────────────────────────────────────────────────

function UsageStat({ id }: { id: string }) {
  const { usage, isLoading } = useApiKeyUsage(id)
  return (
    <div className="text-right">
      <p className="text-[15px] font-semibold leading-tight tabular-nums tracking-[-0.01em]">
        {isLoading ? "…" : usage ? usage.totalRequests.toLocaleString() : "—"}
      </p>
      <p className="text-[11px] text-muted-foreground">requests · 24h</p>
    </div>
  )
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy"}
      onClick={() => void handle()}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-100 hover:bg-muted hover:text-foreground active:scale-90",
        className
      )}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function StatusPill({ status }: { status: KeyStatus }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", status.dot)} />
      {status.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KeyRevealDialog — shown once after creation
// ─────────────────────────────────────────────────────────────────────────────

function KeyRevealDialog({
  apiKey,
  onClose,
}: {
  apiKey: { name: string; key: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!apiKey} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">Key Created</DialogTitle>
          <DialogDescription>
            Copy it now — for security it won&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>

        {apiKey && (
          <div className="space-y-4 p-3">
            <div className="space-y-1.5">
              <Label className={FIELD_LABEL}>Name</Label>
              <p className="px-1 text-[15px] font-medium">{apiKey.name}</p>
            </div>

            <div className="space-y-1.5">
              <Label className={FIELD_LABEL}>Secret key</Label>
              <div className="flex items-center gap-2 rounded-xl bg-muted py-2 pl-3.5 pr-1.5">
                <code className="flex-1 select-all break-all font-mono text-[12px] leading-relaxed">{apiKey.key}</code>
                <CopyButton text={apiKey.key} />
              </div>
            </div>

            <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-[12px] leading-[1.45] text-warning">
              Store this key somewhere safe. If you lose it, create a new one.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className={cn(PILL, "w-full")}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateKeyDialog
// ─────────────────────────────────────────────────────────────────────────────

type Expiry = "never" | "30d" | "90d" | "1y"

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
] as const satisfies readonly { value: Expiry; label: string }[]

function expiryToDate(v: Expiry): string | null {
  if (v === "never") return null
  const d = new Date()
  if (v === "30d") d.setDate(d.getDate() + 30)
  else if (v === "90d") d.setDate(d.getDate() + 90)
  else if (v === "1y") d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

const SCOPES = ["chat", "images", "embeddings"] as const

interface CreateKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: { name: string; key: string }) => void
  deploymentId: string
}

function CreateKeyDialog({ open, onOpenChange, onCreated, deploymentId }: CreateKeyDialogProps) {
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState<Expiry>("never")
  const [rpmLimit, setRpmLimit] = useState("")
  const [tpmLimit, setTpmLimit] = useState("")
  const [dailyLimit, setDailyLimit] = useState("")
  const [scopes, setScopes] = useState<Record<string, boolean>>({ chat: true, images: true, embeddings: true })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState("")

  const reset = () => {
    setName("")
    setExpiry("never")
    setRpmLimit("")
    setTpmLimit("")
    setDailyLimit("")
    setScopes({ chat: true, images: true, embeddings: true })
    setNameError("")
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError("Give the key a name.")
      return
    }
    setIsSubmitting(true)
    try {
      const body: CreateApiKeyInput = {
        name: name.trim(),
        deploymentId,
        scopes: Object.entries(scopes).filter(([, v]) => v).map(([k]) => k),
        rpmLimit: rpmLimit ? Number(rpmLimit) : null,
        tpmLimit: tpmLimit ? Number(tpmLimit) : null,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
        expiresAt: expiryToDate(expiry),
      }
      const res = await createApiKey(body)
      reset()
      onOpenChange(false)
      onCreated({ name: res.apiKey.name, key: res.apiKey.key })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create key")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">New API Key</DialogTitle>
          <DialogDescription>Authenticates requests to this deployment&apos;s endpoint.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-3">
          {/* Name */}
          <div className="space-y-1.5">
            <Input
              id="key-name"
              aria-label="Name"
              placeholder="Production"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError("") }}
              className={cn(FIELD, "h-11 text-[15px]")}
              autoFocus
            />
            {nameError && <p className="px-1 text-[12px] text-destructive">{nameError}</p>}
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Expires</Label>
            <SegmentedControl<Expiry>
              label="Expiry"
              value={expiry}
              options={EXPIRY_OPTIONS}
              onChange={setExpiry}
              className="w-full [&>button]:flex-1"
            />
          </div>

          {/* Scopes */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Scopes</Label>
            <div className="flex gap-2">
              {SCOPES.map((scope) => {
                const on = scopes[scope]
                return (
                  <button
                    key={scope}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setScopes((s) => ({ ...s, [scope]: !s[scope] }))}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium capitalize",
                      "transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.95]",
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={2.5} />}
                    {scope}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rate limits */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>
              Rate limits <span className="font-normal text-muted-foreground/70">· optional</span>
            </Label>
            <div className="grid grid-cols-3 divide-x divide-black/[0.05] overflow-hidden rounded-xl bg-muted dark:divide-white/[0.06]">
              {[
                { label: "Req / min", value: rpmLimit, set: setRpmLimit },
                { label: "Tokens / min", value: tpmLimit, set: setTpmLimit },
                { label: "Req / day", value: dailyLimit, set: setDailyLimit },
              ].map(({ label, value, set }) => (
                <label key={label} className="block px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="∞"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="mt-0.5 w-full bg-transparent text-[15px] tabular-nums outline-none placeholder:text-muted-foreground/50"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="ghost"
            className={PILL}
            onClick={() => { reset(); onOpenChange(false) }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting} className={cn(PILL, "px-5")}>
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            Create Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DeleteConfirmDialog
// ─────────────────────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  keyName,
  onConfirm,
  onCancel,
}: {
  keyName: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const handle = async () => {
    setIsDeleting(true)
    await onConfirm()
    setIsDeleting(false)
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">Revoke &ldquo;{keyName}&rdquo;?</DialogTitle>
          <DialogDescription>
            Requests using this key will be rejected immediately. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" className={PILL} onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" className={cn(PILL, "px-5")} onClick={() => void handle()} disabled={isDeleting}>
            {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeyRow — one row of the inset-grouped list
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeyRow({
  apiKey,
  index,
  onDelete,
}: {
  apiKey: ApiKey
  index: number
  onDelete: (id: string, name: string) => void
}) {
  const status = keyStatus(apiKey)
  const limits = `${formatLimit(apiKey.rpmLimit)} rpm · ${formatLimit(apiKey.tpmLimit)} tpm · ${formatLimit(apiKey.dailyLimit)} / day`

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(index, 10) * 0.025 }}
      className="flex items-center gap-4 px-5 py-3.5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <KeyRound className="size-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{apiKey.name}</p>
          <StatusPill status={status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <code className="font-mono">{apiKey.prefix}</code>
            <CopyButton text={apiKey.prefix} className="size-6" />
          </span>
          <span className="text-muted-foreground/40">·</span>
          {apiKey.scopes.length > 0 ? (
            <span className="capitalize">{apiKey.scopes.join(", ")}</span>
          ) : (
            <span>No scopes</span>
          )}
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums">{limits}</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatExpiry(apiKey.expiresAt)}</span>
        </div>
      </div>

      <UsageStat id={apiKey.id} />

      <button
        type="button"
        aria-label={`Revoke ${apiKey.name}`}
        onClick={() => onDelete(apiKey.id, apiKey.name)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-[transform,color,background-color] duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-90"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="flex flex-col items-center px-6 py-20 text-center"
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
        <KeyRound className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">No API keys yet</h2>
      <p className="mt-2 max-w-xs text-[14px] leading-[1.45] text-muted-foreground">
        Create a key to authenticate requests to this deployment.
      </p>
      <Button className={cn(PILL, "mt-6 h-9 gap-1.5 px-4 text-[13px] font-semibold")} onClick={onCreate}>
        <Plus className="size-4" strokeWidth={2.5} />
        Create Key
      </Button>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ApiKeysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { apiKeys, isLoading, error, refetch } = useApiKeys(id)
  const [createOpen, setCreateOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<{ name: string; key: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteApiKey(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" revoked`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key")
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">API Keys</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Keys that authenticate requests to this deployment&apos;s endpoint.
          </p>
        </div>
        {apiKeys.length > 0 && (
          <Button
            onClick={() => setCreateOpen(true)}
            className={cn(PILL, "h-9 gap-1.5 px-4 text-[13px] font-semibold")}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            New Key
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <p className="text-[13px] text-muted-foreground">{error}</p>
          <Button variant="secondary" size="sm" className={PILL} onClick={() => refetch()}>Retry</Button>
        </div>
      ) : apiKeys.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <section
          aria-label="API keys"
          className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
        >
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {apiKeys.map((k, i) => (
              <ApiKeyRow
                key={k.id}
                apiKey={k}
                index={i}
                onDelete={(kid, name) => setDeleteTarget({ id: kid, name })}
              />
            ))}
          </ul>
        </section>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        deploymentId={id}
        onCreated={(k) => {
          refetch()
          setRevealKey(k)
        }}
      />

      <KeyRevealDialog apiKey={revealKey} onClose={() => setRevealKey(null)} />

      {deleteTarget && (
        <DeleteConfirmDialog
          keyName={deleteTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
    </MotionConfig>
  )
}

"use client"

import { useState } from "react"
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Clock,
  Activity,
  Globe,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useApiKeyUsage,
  createApiKey,
  deleteApiKey,
  updateApiKey,
  type ApiKey,
  type CreateApiKeyInput,
} from "@/hooks/use-api-keys"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function keyStatus(key: ApiKey): { label: string; variant: "success" | "destructive" | "warning" } {
  if (!key.isActive) return { label: "Disabled", variant: "destructive" }
  if (key.expiresAt && new Date(key.expiresAt) < new Date())
    return { label: "Expired", variant: "warning" }
  return { label: "Active", variant: "success" }
}

function formatLimit(val: number | null) {
  return val == null ? "∞" : val.toLocaleString()
}

function formatExpiry(val: string | null) {
  if (!val) return "Never"
  return new Date(val).toLocaleDateString(undefined, { dateStyle: "medium" })
}

// ─────────────────────────────────────────────────────────────────────────────
// UsageCell — per-key usage for the selected period
// ─────────────────────────────────────────────────────────────────────────────

function UsageCell({ id, period }: { id: string; period: string }) {
  const { usage, isLoading } = useApiKeyUsage(id, period)
  if (isLoading) return <span className="text-xs text-muted-foreground">…</span>
  if (!usage) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="text-xs tabular-nums">
      <p className="font-medium">
        {usage.totalRequests.toLocaleString()}
        <span className="text-muted-foreground font-normal"> req</span>
      </p>
      <p className="text-muted-foreground">
        {usage.totalTokens.toLocaleString()} tok
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyButton
// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={handle} title="Copy">
      {copied
        ? <Check className="size-3 text-success" />
        : <Copy className="size-3" />
      }
    </Button>
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
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={!!apiKey} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            API Key Created
          </DialogTitle>
          <DialogDescription>
            Copy your key now — it won&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>

        {apiKey && (
          <div className="space-y-4 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key name</Label>
              <p className="text-sm font-medium">{apiKey.name}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Secret key</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <code className="flex-1 text-xs font-mono break-all select-all">{apiKey.key}</code>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copy}>
                  {copied
                    ? <Check className="size-3.5 text-success" />
                    : <Copy className="size-3.5" />
                  }
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              <AlertCircle className="size-3.5 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning">
                Store this key somewhere safe. For security, we only show it once.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateKeyDialog
// ─────────────────────────────────────────────────────────────────────────────

const EXPIRY_OPTIONS = [
  { label: "Never", value: "never" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
]

function expiryToDate(v: string): string | null {
  if (v === "never") return null
  const d = new Date()
  if (v === "7d") d.setDate(d.getDate() + 7)
  else if (v === "30d") d.setDate(d.getDate() + 30)
  else if (v === "90d") d.setDate(d.getDate() + 90)
  else if (v === "1y") d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
  deploymentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: { name: string; key: string }) => void
  deploymentId: string
}) {
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState("never")
  const [scopeGlobal, setScopeGlobal] = useState(false)
  const [rpmLimit, setRpmLimit] = useState("")
  const [tpmLimit, setTpmLimit] = useState("")
  const [dailyLimit, setDailyLimit] = useState("")
  const [scopes, setScopes] = useState<Record<string, boolean>>({ chat: true, images: true, embeddings: true })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState("")

  const reset = () => {
    setName("")
    setExpiry("never")
    setScopeGlobal(false)
    setRpmLimit("")
    setTpmLimit("")
    setDailyLimit("")
    setScopes({ chat: true, images: true, embeddings: true })
    setNameError("")
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    setIsSubmitting(true)
    try {
      const body: CreateApiKeyInput = {
        name: name.trim(),
        ...(scopeGlobal ? {} : { deploymentId }),
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
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Generate a new key to authenticate requests to this deployment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-3">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="key-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="key-name"
              placeholder="e.g. Production Key"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError("") }}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Access scope */}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="key-global" className="text-sm">All deployments</Label>
              <p className="text-xs text-muted-foreground">
                {scopeGlobal
                  ? "Key works across every deployment on your account"
                  : "Key is locked to this deployment only"}
              </p>
            </div>
            <Switch id="key-global" checked={scopeGlobal} onCheckedChange={setScopeGlobal} />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label>Expiry</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scopes */}
          <div className="space-y-1.5">
            <Label>Scopes</Label>
            <div className="flex gap-2">
              {(["chat", "images", "embeddings"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setScopes((s) => ({ ...s, [scope]: !s[scope] }))}
                  className={[
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    scopes[scope]
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
                  ].join(" ")}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          {/* Rate limits */}
          <div className="space-y-2">
            <Label>
              Rate Limits{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Req / min</p>
                <Input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={rpmLimit}
                  onChange={(e) => setRpmLimit(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tokens / min</p>
                <Input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={tpmLimit}
                  onChange={(e) => setTpmLimit(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Req / day</p>
                <Input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => { reset(); onOpenChange(false) }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            Create Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RevokeConfirmDialog
// ─────────────────────────────────────────────────────────────────────────────

function RevokeConfirmDialog({
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
          <DialogTitle>Revoke API Key</DialogTitle>
          <DialogDescription>
            Revoking{" "}
            <span className="font-medium text-foreground">{keyName}</span>{" "}
            will immediately block any requests using it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handle} disabled={isDeleting}>
            {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
            Revoke Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeyRow
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeyRow({
  apiKey,
  period,
  onToggle,
  onRevoke,
}: {
  apiKey: ApiKey
  period: string
  onToggle: (key: ApiKey) => void
  onRevoke: (id: string, name: string) => void
}) {
  const status = keyStatus(apiKey)
  const isGlobal = apiKey.deploymentId == null

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{apiKey.name}</p>
          {isGlobal && (
            <Badge variant="blue" className="text-[10px] px-1.5 py-0 gap-1">
              <Globe className="size-2.5" />
              Global
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <code className="text-xs font-mono text-muted-foreground">{apiKey.prefix}</code>
          <CopyButton text={apiKey.prefix} />
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {apiKey.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>
          ))}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="text-xs text-muted-foreground tabular-nums">
          <p>{formatLimit(apiKey.rpmLimit)} rpm · {formatLimit(apiKey.tpmLimit)} tpm</p>
          <p>{formatLimit(apiKey.dailyLimit)} / day</p>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {formatExpiry(apiKey.expiresAt)}
        </div>
      </td>

      <td className="px-4 py-3">
        <UsageCell id={apiKey.id} period={period} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={apiKey.isActive}
            onCheckedChange={() => onToggle(apiKey)}
            title={apiKey.isActive ? "Disable key" : "Enable key"}
          />
          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0">
            {status.label}
          </Badge>
        </div>
      </td>

      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRevoke(apiKey.id, apiKey.name)}
          title="Revoke key"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeysPanel — per-deployment key management
// ─────────────────────────────────────────────────────────────────────────────

const USAGE_PERIODS = [
  { label: "Last 24h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
]

export function ApiKeysPanel({
  deploymentId,
  apiKeys,
  isLoading,
  error,
  refetch,
}: {
  deploymentId: string
  apiKeys: ApiKey[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<{ name: string; key: string } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [period, setPeriod] = useState("24h")

  const handleToggle = async (key: ApiKey) => {
    try {
      await updateApiKey(key.id, { isActive: !key.isActive })
      toast.success(`"${key.name}" ${key.isActive ? "disabled" : "enabled"}`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update key")
    }
  }

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return
    try {
      await deleteApiKey(revokeTarget.id)
      toast.success(`"${revokeTarget.name}" revoked`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key")
    } finally {
      setRevokeTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full border bg-muted">
            <KeyRound className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">No API keys yet</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Create a key to authenticate requests to this deployment&apos;s endpoint.
          </p>
          <Button className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus />
            Create API Key
          </Button>
        </div>
      ) : (
        <Card className="py-0 overflow-hidden">
          <CardHeader className="px-5 pt-4 pb-3 border-b">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {apiKeys.length} key{apiKeys.length !== 1 ? "s" : ""} can access this deployment
            </CardTitle>
            <CardAction>
              <div className="flex items-center gap-2">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="h-7 w-32 text-xs gap-1">
                    <Activity className="size-3" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USAGE_PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  Create Key
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium">Key</th>
                    <th className="px-4 py-2.5 text-left font-medium">Scopes</th>
                    <th className="px-4 py-2.5 text-left font-medium">Limits</th>
                    <th className="px-4 py-2.5 text-left font-medium">Expires</th>
                    <th className="px-4 py-2.5 text-left font-medium">Usage</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <ApiKeyRow
                      key={k.id}
                      apiKey={k}
                      period={period}
                      onToggle={handleToggle}
                      onRevoke={(id, name) => setRevokeTarget({ id, name })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        deploymentId={deploymentId}
        onCreated={(k) => {
          refetch()
          setRevealKey(k)
        }}
      />

      <KeyRevealDialog
        apiKey={revealKey}
        onClose={() => setRevealKey(null)}
      />

      {revokeTarget && (
        <RevokeConfirmDialog
          keyName={revokeTarget.name}
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  )
}

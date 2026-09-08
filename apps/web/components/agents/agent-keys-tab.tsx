"use client"

import { useState } from "react"
import { AlertCircle, Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CopyButton, relativeTime } from "@/components/agents/agent-shared"
import {
  createAgentKey,
  revokeAgentKey,
  useAgentKeys,
  type AgentKey,
} from "@/hooks/use-agent-keys"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"

const EXPIRY_OPTIONS = [
  { label: "Never", value: "never" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
]

function expiryToDate(v: string): string | undefined {
  if (v === "never") return undefined
  const d = new Date()
  if (v === "30d") d.setDate(d.getDate() + 30)
  else if (v === "90d") d.setDate(d.getDate() + 90)
  else if (v === "1y") d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

function keyStatus(key: AgentKey): { label: string; variant: "success" | "destructive" | "warning" } {
  if (!key.isActive) return { label: "Revoked", variant: "destructive" }
  if (key.expiresAt && new Date(key.expiresAt) < new Date())
    return { label: "Expired", variant: "warning" }
  return { label: "Active", variant: "success" }
}

function CreateKeyDialog({
  open,
  onOpenChange,
  agent,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: DeploymentAgent
  onCreated: (key: { name: string; key: string }) => void
}) {
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState("never")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setName("")
    setExpiry("never")
  }

  const submit = async () => {
    setIsSubmitting(true)
    try {
      const created = await createAgentKey(agent.deploymentId, agent.id, {
        name: name.trim() || undefined,
        expiresAt: expiryToDate(expiry),
      })
      reset()
      onOpenChange(false)
      onCreated({ name: created.name, key: created.key })
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
          <DialogTitle>Create key</DialogTitle>
          <DialogDescription>
            Generate a key to authenticate requests to this agent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="agent-key-name">Name (optional)</Label>
            <Input
              id="agent-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production"
            />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevealDialog({
  data,
  onClose,
}: {
  data: { name: string; key: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!data) return
    await navigator.clipboard.writeText(data.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={!!data} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            Key created
          </DialogTitle>
          <DialogDescription>Copy it now — you won&apos;t see this key again.</DialogDescription>
        </DialogHeader>
        {data ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <code className="flex-1 select-all break-all font-mono text-xs">{data.key}</code>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copy}>
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <p className="text-xs text-warning">
                Store this key somewhere safe. You won&apos;t see this key again.
              </p>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose} className="w-full">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AgentKeysTab({ agent }: { agent: DeploymentAgent }) {
  const { keys, isLoading, error, refetch } = useAgentKeys(agent.deploymentId, agent.id)
  const [createOpen, setCreateOpen] = useState(false)
  const [reveal, setReveal] = useState<{ name: string; key: string } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<AgentKey | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const doRevoke = async () => {
    if (!revokeTarget) return
    setIsRevoking(true)
    try {
      await revokeAgentKey(agent.deploymentId, agent.id, revokeTarget.id)
      await refetch()
      toast.success("Key revoked")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key")
    } finally {
      setIsRevoking(false)
      setRevokeTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Keys authenticate requests to this agent&apos;s endpoint.
        </p>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Create key
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/25 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full border bg-background">
            <KeyRound className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No keys yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Create a key to start calling this agent from your code.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Key</th>
                    <th className="px-4 py-2.5 text-left font-medium">Created</th>
                    <th className="px-4 py-2.5 text-left font-medium">Last used</th>
                    <th className="px-4 py-2.5 text-left font-medium">Expires</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const status = keyStatus(k)
                    return (
                      <tr key={k.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{k.name || "Untitled"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-xs text-muted-foreground">{k.prefix}</code>
                            <CopyButton text={k.prefix} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{relativeTime(k.createdAt)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{relativeTime(k.lastUsedAt)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {k.expiresAt
                            ? new Date(k.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })
                            : "Never"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {k.isActive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setRevokeTarget(k)}
                              title="Revoke key"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agent={agent}
        onCreated={(k) => {
          void refetch()
          setReveal(k)
        }}
      />

      <RevealDialog data={reveal} onClose={() => setReveal(null)} />

      <Dialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke key</DialogTitle>
            <DialogDescription>
              Revoking{" "}
              <span className="font-medium text-foreground">{revokeTarget?.name || "this key"}</span>{" "}
              immediately blocks any requests using it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doRevoke()} disabled={isRevoking} className="gap-2">
              {isRevoking ? <Loader2 className="size-4 animate-spin" /> : null}
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

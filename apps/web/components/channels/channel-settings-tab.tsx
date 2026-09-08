"use client"

import { useState, type ReactNode } from "react"
import { Loader2, Bot, KeyRound, ShieldCheck, Brain, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  updateChannel,
  disconnectChannel,
  type Channel,
  type UpdateChannelInput,
} from "@/hooks/use-channels"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"
import { PlatformConfigForm, requiredKeys } from "./platform-config-form"

const DIRECT_VALUE = "__direct__"

interface ChannelSettingsTabProps {
  deploymentId: string
  channel: Channel
  agents: DeploymentAgent[]
  onSaved: () => void
  onDeleted: () => void
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-3.5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-4">{children}</CardContent>
      {footer && (
        <div className="flex justify-end border-t bg-muted/20 px-5 py-3">{footer}</div>
      )}
    </Card>
  )
}

function SaveButton({
  onClick,
  isSaving,
  disabled,
}: {
  onClick: () => void
  isSaving: boolean
  disabled?: boolean
}) {
  return (
    <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onClick} disabled={isSaving || disabled}>
      {isSaving && <Loader2 className="size-3 animate-spin" />}
      Save
    </Button>
  )
}

function useSave(
  deploymentId: string,
  channelId: string,
  onSaved: () => void
) {
  const [isSaving, setIsSaving] = useState(false)
  const save = async (
    body: UpdateChannelInput,
    successMessage = "Settings saved"
  ): Promise<boolean> => {
    setIsSaving(true)
    try {
      await updateChannel(deploymentId, channelId, body)
      toast.success(successMessage)
      onSaved()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
      return false
    } finally {
      setIsSaving(false)
    }
  }
  return { isSaving, save }
}

export function ChannelSettingsTab({
  deploymentId,
  channel,
  agents,
  onSaved,
  onDeleted,
}: ChannelSettingsTabProps) {
  // ── General ────────────────────────────────────────────────────────
  const [name, setName] = useState(channel.name)
  const [agentId, setAgentId] = useState(channel.agentId ?? DIRECT_VALUE)
  const [systemPrompt, setSystemPrompt] = useState(channel.systemPrompt ?? "")
  const general = useSave(deploymentId, channel.id, onSaved)

  // ── Memory & history ───────────────────────────────────────────────
  const [historyEnabled, setHistoryEnabled] = useState(channel.historyEnabled)
  const [historyLimit, setHistoryLimit] = useState(channel.historyLimit)
  const [memoryEnabled, setMemoryEnabled] = useState(channel.memoryEnabled ?? false)
  const memory = useSave(deploymentId, channel.id, onSaved)

  // ── Access control ─────────────────────────────────────────────────
  const [allowlistOn, setAllowlistOn] = useState(
    (channel.allowlist?.length ?? 0) > 0
  )
  const [allowlistText, setAllowlistText] = useState(
    (channel.allowlist ?? []).join("\n")
  )
  const [rateLimitOn, setRateLimitOn] = useState(channel.rateLimitPerMinute != null)
  const [rateLimit, setRateLimit] = useState(channel.rateLimitPerMinute ?? 10)
  const access = useSave(deploymentId, channel.id, onSaved)

  // ── Credentials ────────────────────────────────────────────────────
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [newConfig, setNewConfig] = useState<Record<string, string>>({})
  const credentials = useSave(deploymentId, channel.id, onSaved)

  // ── Danger zone ────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isAgentMode = agentId !== DIRECT_VALUE

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await disconnectChannel(deploymentId, channel.id)
      toast.success("Channel disconnected")
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect channel")
      setIsDeleting(false)
    }
  }

  const credentialsComplete = requiredKeys(channel.platform).every(
    (key) => (newConfig[key] ?? "").trim().length > 0
  )

  return (
    <div className="space-y-4 max-w-2xl">
      {/* General */}
      <SettingsCard
        icon={Bot}
        title="General"
        description="Name and how incoming messages are answered."
        footer={
          <SaveButton
            isSaving={general.isSaving}
            disabled={!name.trim()}
            onClick={() =>
              void general.save({
                name: name.trim(),
                agentId: isAgentMode ? agentId : null,
                systemPrompt: isAgentMode ? undefined : systemPrompt.trim() || null,
              })
            }
          />
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="settings-name" className="text-xs">Channel Name</Label>
          <Input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Respond as</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="h-8 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DIRECT_VALUE}>
                <span className="flex items-center gap-2">
                  <Bot className="size-3.5 text-muted-foreground" />
                  Direct to model
                </span>
              </SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    <span>{a.emoji ?? "🤖"}</span>
                    {a.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {isAgentMode
              ? "The agent's system prompt, knowledge base, and settings apply. Changes take effect on the next message."
              : "Messages go straight to the deployed model with the prompt below."}
          </p>
        </div>

        {!isAgentMode && (
          <div className="space-y-1.5">
            <Label htmlFor="settings-prompt" className="text-xs">System Prompt</Label>
            <Textarea
              id="settings-prompt"
              placeholder="You are a helpful assistant..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="text-sm min-h-[60px]"
              rows={3}
            />
          </div>
        )}
      </SettingsCard>

      {/* Memory & history */}
      <SettingsCard
        icon={Brain}
        title="Memory & History"
        description="What the bot remembers between messages. Applies to the next message — no restart needed."
        footer={
          <SaveButton
            isSaving={memory.isSaving}
            onClick={() =>
              void memory.save({
                historyEnabled,
                historyLimit: Math.min(Math.max(historyLimit, 2), 100),
                memoryEnabled,
              })
            }
          />
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="settings-history" className="text-xs">Conversation history</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Feed the recent chat back as context. Users can send /reset to clear it.
            </p>
          </div>
          <Switch
            id="settings-history"
            checked={historyEnabled}
            onCheckedChange={setHistoryEnabled}
          />
        </div>
        {historyEnabled && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="settings-history-limit" className="text-xs text-muted-foreground">
              Messages of context
            </Label>
            <Input
              id="settings-history-limit"
              type="number"
              min={2}
              max={100}
              value={historyLimit}
              onChange={(e) => setHistoryLimit(Number(e.target.value) || 20)}
              className="h-7 w-20 text-sm"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <Label htmlFor="settings-memory" className="text-xs">Long-term memory (mem0)</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Extract facts about each user across conversations. Requires the
              deployment to be running; changing this restarts the channel.
            </p>
          </div>
          <Switch
            id="settings-memory"
            checked={memoryEnabled}
            onCheckedChange={setMemoryEnabled}
          />
        </div>
      </SettingsCard>

      {/* Access control */}
      <SettingsCard
        icon={ShieldCheck}
        title="Access Control"
        description="Limit who can talk to the bot and how often."
        footer={
          <SaveButton
            isSaving={access.isSaving}
            onClick={() => {
              const entries = allowlistText
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
              void access.save({
                allowlist: allowlistOn && entries.length > 0 ? entries : null,
                rateLimitPerMinute: rateLimitOn
                  ? Math.min(Math.max(rateLimit, 1), 600)
                  : null,
              })
            }}
          />
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="settings-allowlist" className="text-xs">Restrict to allowlist</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Only listed usernames or user IDs get replies; everyone else is politely refused.
            </p>
          </div>
          <Switch
            id="settings-allowlist"
            checked={allowlistOn}
            onCheckedChange={setAllowlistOn}
          />
        </div>
        {allowlistOn && (
          <Textarea
            placeholder={"one entry per line, e.g.\n@username\n123456789"}
            value={allowlistText}
            onChange={(e) => setAllowlistText(e.target.value)}
            className="text-sm min-h-[80px] font-mono"
            rows={4}
          />
        )}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <Label htmlFor="settings-ratelimit" className="text-xs">Rate limit</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cap how many messages each user can send per minute.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rateLimitOn && (
              <Input
                type="number"
                min={1}
                max={600}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value) || 10)}
                className="h-7 w-20 text-sm"
                aria-label="Messages per minute"
              />
            )}
            <Switch
              id="settings-ratelimit"
              checked={rateLimitOn}
              onCheckedChange={setRateLimitOn}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Credentials */}
      <SettingsCard
        icon={KeyRound}
        title="Credentials"
        description="Platform credentials are stored encrypted and shown masked."
      >
        <div className="space-y-2">
          {Object.entries(channel.config).map(([key, value]) =>
            value ? (
              <div key={key} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{key}</span>
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                  {value}
                </code>
              </div>
            ) : null
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setNewConfig({})
            setCredentialsOpen(true)
          }}
        >
          Replace credentials
        </Button>
      </SettingsCard>

      {/* Danger zone */}
      <Card className="gap-0 py-0 overflow-hidden border-destructive/30">
        <CardHeader className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10">
                <Trash2 className="size-3.5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-sm">Disconnect Channel</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Stop the bot and remove this channel. Message history is kept.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDeleteOpen(true)}
            >
              Disconnect
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Replace credentials dialog */}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace credentials</DialogTitle>
            <DialogDescription>
              Enter the full new credentials — masked values can&apos;t be reused.
              The channel restarts automatically after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <PlatformConfigForm
              platform={channel.platform}
              config={newConfig}
              onChange={setNewConfig}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCredentialsOpen(false)}
              disabled={credentials.isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={credentials.isSaving || !credentialsComplete}
              onClick={() => {
                void credentials
                  .save({ config: newConfig }, "Credentials replaced — restarting channel")
                  .then((ok) => {
                    if (ok) setCredentialsOpen(false)
                  })
              }}
            >
              {credentials.isSaving && <Loader2 className="size-3.5 animate-spin" />}
              Save & Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect channel?</DialogTitle>
            <DialogDescription>
              <strong>{channel.name}</strong> will be disconnected and the
              adapter will stop receiving messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
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
              className="gap-1.5"
            >
              {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

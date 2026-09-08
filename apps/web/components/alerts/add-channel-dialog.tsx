"use client"

import { useState } from "react"
import { Plus, Loader2, Send, Hash, Slack, Eye, EyeOff } from "lucide-react"
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
import type { AlertPlatform, AlertChannel } from "@/hooks/use-alerts"
import { createAlertChannel } from "@/hooks/use-alerts"

// ── Platform selection tile ──────────────────────────────────────────────────

interface PlatformTileProps {
  platform: AlertPlatform
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  accentClass: string
  selected: boolean
  onSelect: () => void
}

function PlatformTile({
  platform,
  label,
  description,
  icon: Icon,
  accentClass,
  selected,
  onSelect,
}: PlatformTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-150",
        "hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div
        className={[
          "flex size-9 items-center justify-center rounded-lg border",
          accentClass,
        ].join(" ")}
      >
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {selected && (
        <div className="absolute right-3 top-3 size-2 rounded-full bg-primary" />
      )}
    </button>
  )
}

// ── Secret input with reveal toggle ─────────────────────────────────────────

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

// ── Config forms per platform ────────────────────────────────────────────────

function TelegramForm({
  config,
  onChange,
}: {
  config: Record<string, string>
  onChange: (c: Record<string, string>) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bot-token" className="text-xs font-medium">
          Bot Token
        </Label>
        <SecretInput
          id="bot-token"
          placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
          value={config.botToken ?? ""}
          onChange={(v) => onChange({ ...config, botToken: v })}
        />
        <p className="text-[11px] text-muted-foreground">
          Create a bot with{" "}
          <span className="font-mono text-foreground">@BotFather</span> and
          paste the token here.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="chat-id" className="text-xs font-medium">
          Chat ID
        </Label>
        <Input
          id="chat-id"
          placeholder="-1001234567890"
          value={config.chatId ?? ""}
          onChange={(e) => onChange({ ...config, chatId: e.target.value })}
          className="font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Your personal chat ID, a group ID, or a channel ID (prefixed with{" "}
          <span className="font-mono text-foreground">-100</span>).
        </p>
      </div>
    </div>
  )
}

function DiscordForm({
  config,
  onChange,
}: {
  config: Record<string, string>
  onChange: (c: Record<string, string>) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="webhook-url" className="text-xs font-medium">
        Webhook URL
      </Label>
      <SecretInput
        id="webhook-url"
        placeholder="https://discord.com/api/webhooks/..."
        value={config.webhookUrl ?? ""}
        onChange={(v) => onChange({ ...config, webhookUrl: v })}
      />
      <p className="text-[11px] text-muted-foreground">
        Go to <strong>Channel Settings → Integrations → Webhooks</strong> in
        your Discord server and create a new webhook.
      </p>
    </div>
  )
}

function SlackForm({
  config,
  onChange,
}: {
  config: Record<string, string>
  onChange: (c: Record<string, string>) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="slack-webhook" className="text-xs font-medium">
        Incoming Webhook URL
      </Label>
      <SecretInput
        id="slack-webhook"
        placeholder="https://hooks.slack.com/services/T.../B.../..."
        value={config.webhookUrl ?? ""}
        onChange={(v) => onChange({ ...config, webhookUrl: v })}
      />
      <p className="text-[11px] text-muted-foreground">
        Add the <strong>Incoming WebHooks</strong> app to your Slack workspace
        and copy the webhook URL for the target channel.
      </p>
    </div>
  )
}

// ── Main dialog ──────────────────────────────────────────────────────────────

interface AddChannelDialogProps {
  onCreated: (channel: AlertChannel) => void
}

const PLATFORMS: Array<{
  platform: AlertPlatform
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  accentClass: string
}> = [
  {
    platform: "telegram",
    label: "Telegram",
    description: "Bot API — send to any chat or channel",
    icon: Send,
    accentClass:
      "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  {
    platform: "discord",
    label: "Discord",
    description: "Webhook — post rich embeds to a channel",
    icon: Hash,
    accentClass:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  },
  {
    platform: "slack",
    label: "Slack",
    description: "Incoming webhook — post to any channel",
    icon: Slack,
    accentClass:
      "bg-success/10 text-success border-success/20",
  },
]

export function AddChannelDialog({ onCreated }: AddChannelDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"platform" | "config">("platform")
  const [platform, setPlatform] = useState<AlertPlatform | null>(null)
  const [name, setName] = useState("")
  const [config, setConfig] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setStep("platform")
    setPlatform(null)
    setName("")
    setConfig({})
    setIsSubmitting(false)
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (!v) reset()
  }

  const selectPlatform = (p: AlertPlatform) => {
    setPlatform(p)
    setStep("config")
  }

  const isConfigValid = (): boolean => {
    if (!name.trim() || !platform) return false
    switch (platform) {
      case "telegram":
        return !!config.botToken?.trim() && !!config.chatId?.trim()
      case "discord":
      case "slack":
        return !!config.webhookUrl?.trim()
    }
  }

  const handleSubmit = async () => {
    if (!platform || !isConfigValid()) return
    setIsSubmitting(true)
    try {
      const channel = await createAlertChannel({ platform, name: name.trim(), config })
      onCreated(channel)
      toast.success("Alert channel added", {
        description: `${name} is ready to receive notifications.`,
      })
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add channel")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1 rounded-full px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.96]">
          <Plus className="size-3.5" strokeWidth={2.5} />
          Add Channel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {step === "platform" ? "Choose a platform" : "Configure channel"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "platform"
              ? "Select where you want to receive deployment alerts."
              : "Enter your credentials and give this channel a name."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {step === "platform" ? (
            <div className="grid grid-cols-3 gap-3">
              {PLATFORMS.map((p) => (
                <PlatformTile
                  key={p.platform}
                  {...p}
                  selected={platform === p.platform}
                  onSelect={() => selectPlatform(p.platform)}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Channel name */}
              <div className="space-y-1.5">
                <Label htmlFor="channel-name" className="text-xs font-medium">
                  Channel name
                </Label>
                <Input
                  id="channel-name"
                  placeholder={`e.g. Ops ${platform === "telegram" ? "Telegram" : platform === "discord" ? "Discord" : "Slack"}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
              </div>

              {/* Platform-specific config */}
              {platform === "telegram" && (
                <TelegramForm config={config} onChange={setConfig} />
              )}
              {platform === "discord" && (
                <DiscordForm config={config} onChange={setConfig} />
              )}
              {platform === "slack" && (
                <SlackForm config={config} onChange={setConfig} />
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter className="px-6 py-4 gap-2">
          {step === "config" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("platform")}
              disabled={isSubmitting}
            >
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={step === "platform" ? undefined : () => void handleSubmit()}
            disabled={
              step === "platform"
                ? !platform
                : !isConfigValid() || isSubmitting
            }
            className="gap-1.5"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            {step === "platform" ? "Continue" : "Add Channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

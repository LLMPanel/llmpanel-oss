"use client"

import { use, useState } from "react"
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Plus,
  Power,
  Unplug,
  ExternalLink,
} from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  useChannels,
  createChannel,
  toggleChannel,
  disconnectChannel,
  type Channel,
  type ChannelPlatform,
} from "@/hooks/use-channels"

// ─────────────────────────────────────────────────────────────────────────────
// Platform metadata
// ─────────────────────────────────────────────────────────────────────────────

type PlatformMeta = {
  id: ChannelPlatform
  label: string
  description: string
  color: string
  iconBg: string
  docsUrl: string
  setupSteps: string[]
  fields: {
    key: string
    label: string
    placeholder: string
    type?: "text" | "password"
    hint?: string
    required?: boolean
  }[]
}

const PLATFORMS: PlatformMeta[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Connect via Baileys — no Meta Business account required.",
    color: "text-success",
    iconBg: "bg-success/10",
    docsUrl: "https://github.com/WhiskeySockets/Baileys",
    setupSteps: [
      "Enter your WhatsApp phone number (international format, e.g. +1234567890).",
      "After connecting, your server will show a QR code or pairing code in the logs.",
      "Scan with WhatsApp → Linked Devices → Link a device.",
      "Once connected, every message to that number is forwarded to your model.",
    ],
    fields: [
      {
        key: "phoneNumber",
        label: "Phone Number",
        placeholder: "+1 234 567 8900",
        hint: "Include country code. Must match the WhatsApp account.",
        required: true,
      },
      {
        key: "sessionId",
        label: "Session ID",
        placeholder: "my-whatsapp-bot",
        hint: "Unique identifier for this Baileys session (letters, numbers, hyphens).",
        required: true,
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    description: "Connect via a BotFather bot token.",
    color: "text-sky-600",
    iconBg: "bg-sky-50 dark:bg-sky-950/30",
    docsUrl: "https://core.telegram.org/bots#how-do-i-create-a-bot",
    setupSteps: [
      "Open Telegram and start a chat with @BotFather.",
      'Send /newbot, choose a name and username (must end in "bot").',
      "BotFather will send you a bot token — paste it below.",
      "Optionally add a webhook secret for verified requests.",
    ],
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        placeholder: "1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        hint: "From @BotFather → /newbot. Never share this.",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret",
        placeholder: "optional-random-string",
        hint: "Sent in X-Telegram-Bot-Api-Secret-Token header for request verification.",
      },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    description: "Connect a Discord application bot to your model.",
    color: "text-indigo-600",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/30",
    docsUrl: "https://discord.com/developers/applications",
    setupSteps: [
      "Go to discord.com/developers/applications and create a new application.",
      'Navigate to the "Bot" tab and click "Add Bot".',
      "Copy the bot token and paste it below.",
      "Copy the Application ID and Public Key from the General Information tab.",
      "Invite the bot to your server using OAuth2 → URL Generator (scopes: bot + applications.commands).",
      "Optionally restrict to a single Guild ID for testing.",
    ],
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        placeholder: "MTxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        hint: 'Bot tab → "Reset Token". Keep this secret.',
        required: true,
      },
      {
        key: "applicationId",
        label: "Application ID",
        placeholder: "1234567890123456789",
        hint: "General Information tab → Application ID.",
        required: true,
      },
      {
        key: "publicKey",
        label: "Public Key",
        placeholder: "abc123def456...",
        hint: "General Information tab → Public Key. Used to verify interaction signatures.",
        required: true,
      },
      {
        key: "guildId",
        label: "Guild ID (optional)",
        placeholder: "1234567890123456789",
        hint: "Leave blank for global commands. Set for instant command registration in a single server.",
      },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    description: "Add a Slack app that replies via your model.",
    color: "text-rose-600",
    iconBg: "bg-rose-50 dark:bg-rose-950/30",
    docsUrl: "https://api.slack.com/apps",
    setupSteps: [
      "Go to api.slack.com/apps and click Create New App → From scratch.",
      "Under OAuth & Permissions, add the bot token scopes: chat:write, app_mentions:read.",
      "Install the app to your workspace and copy the Bot User OAuth Token.",
      "Under Basic Information, copy the Signing Secret and App ID.",
      "Enable Event Subscriptions and set the Request URL to your deployment endpoint + /slack/events.",
      "Subscribe to the app_mention event so your bot responds to @mentions.",
    ],
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        // Deliberately not the real token shape: a digit-for-digit example
        // trips secret scanners on every push. The hint below gives the format.
        placeholder: "xoxb-your-bot-user-oauth-token",
        type: "password",
        hint: "OAuth & Permissions → Bot User OAuth Token. Starts with xoxb-.",
        required: true,
      },
      {
        key: "signingSecret",
        label: "Signing Secret",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        hint: "Basic Information → App Credentials → Signing Secret.",
        required: true,
      },
      {
        key: "appId",
        label: "App ID",
        placeholder: "A0XXXXXXXXX",
        hint: "Basic Information → App ID.",
        required: true,
      },
      {
        key: "defaultChannel",
        label: "Default Channel (optional)",
        placeholder: "#general",
        hint: "Channel to post to when no target channel is specified.",
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Platform icon SVGs (inline, no external dep)
// ─────────────────────────────────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: ChannelPlatform; className?: string }) {
  switch (platform) {
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.525 5.845L.057 23.99l6.305-1.654A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.785 9.785 0 01-5.003-1.371l-.358-.213-3.742.981.998-3.645-.233-.375A9.818 9.818 0 012.182 12c0-5.417 4.401-9.818 9.818-9.818 5.417 0 9.818 4.401 9.818 9.818S17.417 21.818 12 21.818z" />
        </svg>
      )
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      )
    case "discord":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      )
    case "slack":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
        </svg>
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

const PILL = "rounded-full transition-transform active:scale-[0.96]"
const FIELD = "rounded-xl border-0 bg-muted shadow-none focus-visible:ring-2 focus-visible:ring-ring/30"
const FIELD_LABEL = "px-1 text-[12px] font-medium text-muted-foreground"

function StatusBadge({ status }: { status: Channel["status"] }) {
  const meta =
    status === "active" ? { label: "Active", dot: "bg-success" }
    : status === "error" ? { label: "Error", dot: "bg-destructive" }
    : { label: "Pending", dot: "bg-warning" }
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup instructions step list
// ─────────────────────────────────────────────────────────────────────────────

function SetupSteps({ steps, docsUrl }: { steps: string[]; docsUrl: string }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>Setup</p>
      <ol className="divide-y divide-black/[0.05] rounded-xl bg-muted/50 dark:divide-white/[0.06] dark:bg-muted/30">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 px-3 py-2.5 text-[13px] leading-[1.45]">
            <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-1 text-[12px] text-primary transition-opacity active:opacity-60"
      >
        Official docs <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect dialog
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectDialogProps {
  platform: PlatformMeta | null
  deploymentId: string
  onConnected: () => void
  onClose: () => void
}

function ConnectDialog({ platform, deploymentId, onConnected, onClose }: ConnectDialogProps) {
  const [name, setName] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const reset = () => {
    setName("")
    setValues({})
  }

  const handleSubmit = async () => {
    if (!platform) return
    const trimmedName = name.trim() || `${platform.label} Bot`

    const missingRequired = platform.fields
      .filter((f) => f.required)
      .find((f) => !values[f.key]?.trim())

    if (missingRequired) {
      toast.error(`${missingRequired.label} is required`)
      return
    }

    setIsSubmitting(true)
    try {
      await createChannel(deploymentId, {
        platform: platform.id,
        name: trimmedName,
        config: Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, v.trim()])
        ),
      })
      toast.success(`${platform.label} connected`)
      reset()
      onConnected()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={!!platform}
      onOpenChange={(o) => {
        if (!o) { reset(); onClose() }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {platform && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-[20px] tracking-[-0.02em]">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                  <PlatformIcon platform={platform.id} className={`size-4 ${platform.color}`} />
                </span>
                Connect {platform.label}
              </DialogTitle>
              <DialogDescription>{platform.description}</DialogDescription>
            </DialogHeader>

            <DialogBody className="max-h-[min(70vh,36rem)] space-y-5">
              {/* Setup instructions */}
              <SetupSteps steps={platform.setupSteps} docsUrl={platform.docsUrl} />

              {/* Connection name */}
              <div className="space-y-1.5">
                <Label htmlFor="channel-name" className={FIELD_LABEL}>
                  Name <span className="font-normal text-muted-foreground/70">· optional</span>
                </Label>
                <Input
                  id="channel-name"
                  placeholder={`${platform.label} Support Bot`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD}
                />
              </div>

              {/* Platform-specific fields */}
              {platform.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`field-${field.key}`} className={FIELD_LABEL}>
                    {field.label}
                    {field.required && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  <Input
                    id={`field-${field.key}`}
                    type={field.type ?? "text"}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    autoComplete="off"
                    className={FIELD}
                  />
                  {field.hint && (
                    <p className="px-1 text-[11px] leading-[1.4] text-muted-foreground">{field.hint}</p>
                  )}
                </div>
              ))}
            </DialogBody>

            <DialogFooter>
              <Button
                variant="ghost"
                className={PILL}
                onClick={() => { reset(); onClose() }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={isSubmitting} className={cn(PILL, "px-5")}>
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                Connect
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Connected channel row
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelRowProps {
  channel: Channel
  onToggle: (id: string, active: boolean) => Promise<void>
  onDisconnect: (id: string, name: string) => void
}

function ChannelRow({ channel, onToggle, onDisconnect }: ChannelRowProps) {
  const meta = PLATFORMS.find((p) => p.id === channel.platform)
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    await onToggle(channel.id, !channel.isActive)
    setToggling(false)
  }

  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        <PlatformIcon platform={channel.platform} className={cn("size-[18px]", meta?.color)} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{channel.name}</p>
          <StatusBadge status={channel.status} />
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {meta?.label ?? channel.platform}
          {channel.connectedAt && (
            <>
              <span className="text-muted-foreground/40"> · </span>
              Connected {new Date(channel.connectedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <RowButton label={channel.isActive ? "Disable" : "Enable"} onClick={() => void handleToggle()} disabled={toggling}>
          {toggling ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
        </RowButton>
        <RowButton label="Disconnect" destructive onClick={() => onDisconnect(channel.id, channel.name)}>
          <Unplug className="size-4" />
        </RowButton>
      </div>
    </li>
  )
}

function RowButton({
  label,
  destructive,
  disabled,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-muted-foreground/70 transition-[transform,color,background-color] duration-100 active:scale-90 disabled:opacity-50",
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Disconnect confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

function DisconnectDialog({
  target,
  deploymentId,
  onDone,
  onCancel,
}: {
  target: { id: string; name: string } | null
  deploymentId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    if (!target) return
    setLoading(true)
    try {
      await disconnectChannel(deploymentId, target.id)
      toast.success(`"${target.name}" disconnected`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[20px] tracking-[-0.02em]">Disconnect &ldquo;{target?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            Messages will stop being forwarded to your model.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" className={PILL} onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" className={cn(PILL, "px-5")} onClick={() => void handle()} disabled={loading}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform selector card (shown when no connection exists for that platform)
// ─────────────────────────────────────────────────────────────────────────────

function PlatformCard({
  meta,
  isConnected,
  onConnect,
}: {
  meta: PlatformMeta
  isConnected: boolean
  onConnect: () => void
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-muted">
        <PlatformIcon platform={meta.id} className={cn("size-6", meta.color)} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{meta.label}</p>
          {isConnected && (
            <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              Connected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">{meta.description}</p>
      </div>

      <Button
        size="sm"
        variant={isConnected ? "secondary" : "default"}
        className={cn(PILL, "h-8 shrink-0 gap-1 px-3.5 text-[12px] font-semibold")}
        onClick={onConnect}
      >
        {isConnected ? (
          <>
            <Plus className="size-3.5" strokeWidth={2.5} />
            Add
          </>
        ) : (
          <>
            Connect
            <ChevronRight className="size-3.5" strokeWidth={2.5} />
          </>
        )}
      </Button>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HooksPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: deploymentId } = use(params)
  const { channels, isLoading, error, refetch } = useChannels(deploymentId)

  const [connectPlatform, setConnectPlatform] = useState<PlatformMeta | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null)

  const connectedPlatforms = new Set(
    channels.filter((c) => c.isActive).map((c) => c.platform)
  )

  const handleToggle = async (channelId: string, active: boolean) => {
    try {
      await toggleChannel(deploymentId, channelId, active)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update channel")
    }
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">External Channels</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Let people chat with your model from WhatsApp, Telegram, Discord, or Slack.
        </p>
      </header>

      {/* Platforms */}
      <Group title="Platforms">
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {PLATFORMS.map((meta) => (
            <PlatformCard
              key={meta.id}
              meta={meta}
              isConnected={connectedPlatforms.has(meta.id)}
              onConnect={() => setConnectPlatform(meta)}
            />
          ))}
        </ul>
      </Group>

      {/* Connected channels */}
      <Group
        title="Connected"
        hint={
          channels.length === 0 && !isLoading
            ? undefined
            : `${channels.length} channel${channels.length !== 1 ? "s" : ""}`
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-5 text-destructive" />
            </div>
            <p className="text-[13px] text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" className={PILL} onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-12 text-center">
            <Unplug className="mb-1 size-6 text-muted-foreground/40" strokeWidth={1.75} />
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Nothing connected yet</p>
            <p className="text-[13px] text-muted-foreground">Pick a platform above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                onToggle={handleToggle}
                onDisconnect={(cid, name) => setDisconnectTarget({ id: cid, name })}
              />
            ))}
          </ul>
        )}
      </Group>

      {/* Dialogs */}
      <ConnectDialog
        platform={connectPlatform}
        deploymentId={deploymentId}
        onConnected={() => {
          void refetch()
          setConnectPlatform(null)
        }}
        onClose={() => setConnectPlatform(null)}
      />

      <DisconnectDialog
        target={disconnectTarget}
        deploymentId={deploymentId}
        onDone={() => {
          void refetch()
          setDisconnectTarget(null)
        }}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
    </MotionConfig>
  )
}

/** Inset-grouped section: sentence-case title, hairline-ring card. */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="space-y-1.5"
    >
      <div className="flex items-baseline justify-between px-3">
        <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
        {hint && <span className="text-[12px] tabular-nums text-muted-foreground">{hint}</span>}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}

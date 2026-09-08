"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Plus, Loader2, ArrowLeft, ArrowRight, Bot } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createChannel,
  type Channel,
  type ChannelPlatform,
} from "@/hooks/use-channels"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"
import {
  ChannelPlatformIcon,
  channelPlatformLabel,
  isStubPlatform,
} from "./platform-icon"
import { PlatformConfigForm, requiredKeys } from "./platform-config-form"
import { PlatformSetupGuide } from "./platform-setup-guide"

const ALL_PLATFORMS: ChannelPlatform[] = [
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "feishu",
  "twitch",
  "zalo",
]

const DIRECT_VALUE = "__direct__"

type WizardStep = 1 | 2 | 3

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Platform",
  2: "Credentials",
  3: "Behavior",
}

/** iOS sheet curve — matches every other transition in the app. */
const EASE = "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]"

/**
 * Position in the wizard, as a hairline rail rather than three filled pills.
 * The dialog title already names the step ("Configure Telegram", "Choose
 * behavior"), so the indicator only has to answer "how far along am I" — and
 * a rail answers that with almost no ink.
 *
 * Completed segments jump back to that step. The rail is 3px of ink but the
 * button carries vertical padding, so the hit target is ~20px.
 */
function StepRail({
  step,
  onJump,
}: {
  step: WizardStep
  onJump: (step: WizardStep) => void
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex flex-1 items-center gap-1.5">
        {([1, 2, 3] as const).map((s) => {
          const reached = s <= step
          const done = s < step
          return (
            <button
              key={s}
              type="button"
              disabled={!done}
              onClick={() => onJump(s)}
              aria-label={`Step ${s}: ${STEP_LABELS[s]}`}
              aria-current={s === step ? "step" : undefined}
              className={cn(
                "group flex-1 py-2",
                done ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span
                className={cn(
                  "block h-[3px] rounded-full transition-colors duration-200",
                  EASE,
                  "motion-reduce:transition-none",
                  reached ? "bg-primary" : "bg-border",
                  done && "group-hover:bg-primary/60"
                )}
              />
            </button>
          )
        })}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {step} of 3
      </span>
    </div>
  )
}

interface ConnectChannelWizardProps {
  deploymentId: string
  agents: DeploymentAgent[]
  onCreated: (channel: Channel) => void
  /** Skip step 1 with this platform pre-selected when the dialog opens. */
  initialPlatform?: ChannelPlatform | null
  /** Custom trigger; defaults to a "Connect Channel" button. */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ConnectChannelWizard({
  deploymentId,
  agents,
  onCreated,
  initialPlatform,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: ConnectChannelWizardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const [step, setStep] = useState<WizardStep>(1)
  const [platform, setPlatform] = useState<ChannelPlatform | null>(null)
  const [name, setName] = useState("")
  const [config, setConfig] = useState<Record<string, string>>({})
  const [agentId, setAgentId] = useState<string>(DIRECT_VALUE)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [historyEnabled, setHistoryEnabled] = useState(true)
  const [historyLimit, setHistoryLimit] = useState(20)
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const reset = () => {
    setStep(1)
    setPlatform(null)
    setName("")
    setConfig({})
    setAgentId(DIRECT_VALUE)
    setSystemPrompt("")
    setHistoryEnabled(true)
    setHistoryLimit(20)
    setMemoryEnabled(false)
  }

  // Pre-select a platform (from the empty-state gallery) when opening
  useEffect(() => {
    if (open && initialPlatform && !isStubPlatform(initialPlatform)) {
      setPlatform(initialPlatform)
      setName(`${channelPlatformLabel(initialPlatform)} Bot`)
      setStep(2)
    }
  }, [open, initialPlatform])

  const handlePickPlatform = (p: ChannelPlatform) => {
    if (isStubPlatform(p)) {
      toast.info(`${channelPlatformLabel(p)} support is coming soon`)
      return
    }
    setPlatform(p)
    setName(`${channelPlatformLabel(p)} Bot`)
    setStep(2)
  }

  const credentialsComplete =
    !!platform &&
    name.trim().length > 0 &&
    requiredKeys(platform).every((key) => (config[key] ?? "").trim().length > 0)

  const selectedAgent = agents.find((a) => a.id === agentId)

  const handleCreate = async () => {
    if (!platform || !credentialsComplete) return

    setIsCreating(true)
    try {
      const channel = await createChannel(deploymentId, {
        platform,
        name: name.trim(),
        config,
        agentId: agentId === DIRECT_VALUE ? null : agentId,
        systemPrompt:
          agentId === DIRECT_VALUE && systemPrompt.trim()
            ? systemPrompt.trim()
            : undefined,
        historyEnabled,
        historyLimit,
        memoryEnabled,
      })
      toast.success("Channel connected")
      onCreated(channel)
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect channel")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="h-9 gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[0.96]">
            <Plus className="size-4" strokeWidth={2.5} />
            Connect Channel
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Connect a channel"}
            {step === 2 && `Configure ${platform ? channelPlatformLabel(platform) : ""}`}
            {step === 3 && "Choose behavior"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Pick the messaging platform your users will chat from."}
            {step === 2 && "Follow the guide to create a bot and paste its credentials."}
            {step === 3 && "Decide how incoming messages are answered."}
          </DialogDescription>
          <StepRail step={step} onJump={setStep} />
        </DialogHeader>

        {/* min-h damps the height jump between steps — the dialog is centred,
            so a 100px swing throws the whole panel up the screen mid-flow. */}
        <div className="min-h-[19rem]">
        {step === 1 && (
          <div className="grid grid-cols-2 gap-2 py-2">
            {ALL_PLATFORMS.map((p) => {
              const isStub = isStubPlatform(p)
              return (
                <button
                  key={p}
                  type="button"
                  disabled={isStub}
                  onClick={() => handlePickPlatform(p)}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-2.5 text-left",
                    "transition-[background-color,border-color,transform] duration-150",
                    EASE,
                    "motion-reduce:transition-none",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    isStub
                      ? "cursor-default border-border/60 bg-muted/20"
                      : "border-border hover:border-foreground/25 hover:bg-accent/40 active:scale-[0.98]"
                  )}
                >
                  {/* One neutral tile for every platform. The old per-platform
                      tints weren't brand marks and weren't even distinct —
                      Slack and WhatsApp were both the same green. */}
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      "border border-border/60 bg-muted/50 text-muted-foreground",
                      isStub && "opacity-50"
                    )}
                  >
                    <ChannelPlatformIcon platform={p} className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-medium",
                        isStub ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {channelPlatformLabel(p)}
                    </span>
                    {isStub && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                        Coming soon
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {step === 2 && platform && (
          <div className="space-y-4 py-2">
            <PlatformSetupGuide platform={platform} />

            <div className="space-y-1.5">
              <Label htmlFor="channel-name" className="text-[13px]">
                Channel Name
              </Label>
              <Input
                id="channel-name"
                placeholder="My Bot"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-[13px]"
              />
            </div>

            <PlatformConfigForm
              platform={platform}
              config={config}
              onChange={setConfig}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Respond as</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-8 w-full text-[13px]">
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
              {selectedAgent ? (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Messages run through this agent — its system prompt, knowledge
                  base, and settings apply.
                </p>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Messages go straight to the deployed model with the prompt below.
                </p>
              )}
            </div>

            {agentId === DIRECT_VALUE && (
              <div className="space-y-1.5">
                <Label htmlFor="system-prompt" className="text-[13px]">
                  System prompt <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="system-prompt"
                  placeholder="You are a helpful assistant..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[60px] text-[13px]"
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="history-toggle" className="text-[13px]">
                    Conversation history
                  </Label>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    Remember the ongoing chat per user. Users can send /reset to clear it.
                  </p>
                </div>
                <Switch
                  id="history-toggle"
                  checked={historyEnabled}
                  onCheckedChange={setHistoryEnabled}
                />
              </div>
              {historyEnabled && (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="history-limit" className="text-[13px] text-muted-foreground">
                    Messages of context
                  </Label>
                  <Input
                    id="history-limit"
                    type="number"
                    min={2}
                    max={100}
                    value={historyLimit}
                    onChange={(e) => setHistoryLimit(Number(e.target.value) || 20)}
                    className="h-7 w-20 text-[13px] tabular-nums"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <Label htmlFor="memory-toggle" className="text-[13px]">
                    Long-term memory (mem0)
                  </Label>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    Extract and recall facts about each user across conversations.
                  </p>
                </div>
                <Switch
                  id="memory-toggle"
                  checked={memoryEnabled}
                  onCheckedChange={setMemoryEnabled}
                />
              </div>
            </div>
          </div>
        )}

        </div>

        {step > 1 && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1.5 transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1) as WizardStep)}
              disabled={isCreating}
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            {step === 2 ? (
              <Button
                size="sm"
                className={cn("gap-1.5 transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
                onClick={() => setStep(3)}
                disabled={!credentialsComplete}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={isCreating || !credentialsComplete}
                className={cn("gap-1.5 transition-transform duration-100 active:scale-[0.97]", EASE, "motion-reduce:transition-none")}
              >
                {isCreating && <Loader2 className="size-3.5 animate-spin" />}
                Connect
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

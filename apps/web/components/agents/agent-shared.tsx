"use client"

import { useState } from "react"
import { Bot, Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Deployment } from "@/hooks/use-deployments"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"

export const EXTERNAL_PROVIDER_PRESETS = [
  { label: "OpenAI", value: "https://api.openai.com/v1" },
  { label: "OpenRouter", value: "https://openrouter.ai/api/v1" },
  { label: "Groq", value: "https://api.groq.com/openai/v1" },
  { label: "Together", value: "https://api.together.xyz/v1" },
  { label: "Custom", value: "custom" },
] as const

/** Emoji avatar with a bot-icon fallback. */
export function AgentAvatar({
  emoji,
  className,
  iconClassName,
}: {
  emoji: string | null
  className?: string
  iconClassName?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-muted leading-none",
        className
      )}
    >
      {emoji ? (
        <span aria-hidden className="leading-none">{emoji}</span>
      ) : (
        <Bot className={cn("text-muted-foreground", iconClassName)} />
      )}
    </div>
  )
}

/** Human-readable model/provider source label for an agent. */
export function agentModelLabel(
  agent: DeploymentAgent,
  deployments: Deployment[]
): string {
  if (agent.sourceType === "openai-compatible") {
    return agent.externalModel ?? "External model"
  }
  const target = deployments.find(
    (d) => d.id === (agent.targetDeploymentId ?? agent.deploymentId)
  )
  return target?.model?.name ?? target?.huggingfaceId ?? "Deployment model"
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
]

/** "3 hours ago" style relative time from an ISO string. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "Never"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const diffSeconds = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 45) return "just now"
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (abs >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit)
    }
  }
  return rtf.format(diffSeconds, "second")
}

export function CopyButton({
  text,
  className,
  size = "icon-sm",
}: {
  text: string
  className?: string
  size?: "icon-sm" | "icon"
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={() => void copy()}
      className={cn("shrink-0", className)}
      title="Copy"
    >
      {copied ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  )
}

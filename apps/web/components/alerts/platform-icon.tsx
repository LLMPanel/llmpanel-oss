"use client"

import { Send, Hash, Slack } from "lucide-react"
import type { AlertPlatform } from "@/hooks/use-alerts"

interface PlatformIconProps {
  platform: AlertPlatform
  className?: string
}

export function PlatformIcon({ platform, className }: PlatformIconProps) {
  switch (platform) {
    case "telegram":
      return <Send className={className} />
    case "discord":
      return <Hash className={className} />
    case "slack":
      return <Slack className={className} />
  }
}

export function platformLabel(platform: AlertPlatform): string {
  switch (platform) {
    case "telegram": return "Telegram"
    case "discord":  return "Discord"
    case "slack":    return "Slack"
  }
}

export function platformColor(platform: AlertPlatform): string {
  switch (platform) {
    case "telegram": return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
    case "discord":  return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
    case "slack":    return "bg-success/10 text-success border-success/20"
  }
}

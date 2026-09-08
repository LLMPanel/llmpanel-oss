"use client"

import { Send, Hash, Slack, Phone, MessageCircle, Tv, MessageSquare } from "lucide-react"
import type { ChannelPlatform } from "@/hooks/use-channels"

interface ChannelPlatformIconProps {
  platform: ChannelPlatform
  className?: string
}

export function ChannelPlatformIcon({ platform, className }: ChannelPlatformIconProps) {
  switch (platform) {
    case "telegram":
      return <Send className={className} />
    case "discord":
      return <Hash className={className} />
    case "slack":
      return <Slack className={className} />
    case "whatsapp":
      return <Phone className={className} />
    case "feishu":
      return <MessageCircle className={className} />
    case "twitch":
      return <Tv className={className} />
    case "zalo":
      return <MessageSquare className={className} />
  }
}

export function channelPlatformLabel(platform: ChannelPlatform): string {
  switch (platform) {
    case "telegram": return "Telegram"
    case "discord":  return "Discord"
    case "slack":    return "Slack"
    case "whatsapp": return "WhatsApp"
    case "feishu":   return "Feishu"
    case "twitch":   return "Twitch"
    case "zalo":     return "Zalo"
  }
}

export function channelPlatformColor(platform: ChannelPlatform): string {
  switch (platform) {
    case "telegram": return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
    case "discord":  return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
    case "slack":    return "bg-success/10 text-success border-success/20"
    case "whatsapp": return "bg-success/10 text-success border-success/20"
    case "feishu":   return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
    case "twitch":   return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
    case "zalo":     return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
  }
}

export function isStubPlatform(platform: ChannelPlatform): boolean {
  return platform === "feishu" || platform === "twitch" || platform === "zalo"
}

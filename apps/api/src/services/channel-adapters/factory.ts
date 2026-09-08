import type { IChannelAdapter } from "./types"
import { TelegramAdapter } from "./telegram.adapter"
import { DiscordAdapter } from "./discord.adapter"
import { SlackAdapter } from "./slack.adapter"
import { WhatsAppAdapter } from "./whatsapp.adapter"
import { StubAdapter } from "./stub.adapter"

export function createChannelAdapter(platform: string): IChannelAdapter {
  switch (platform) {
    case "telegram":
      return new TelegramAdapter()
    case "discord":
      return new DiscordAdapter()
    case "slack":
      return new SlackAdapter()
    case "whatsapp":
      return new WhatsAppAdapter()
    case "feishu":
      return new StubAdapter("feishu")
    case "twitch":
      return new StubAdapter("twitch")
    case "zalo":
      return new StubAdapter("zalo")
    default:
      throw new Error(`Unknown channel platform: ${platform}`)
  }
}

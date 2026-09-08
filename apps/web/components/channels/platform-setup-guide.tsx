"use client"

import { ExternalLink, Lightbulb } from "lucide-react"
import type { ChannelPlatform } from "@/hooks/use-channels"

interface GuideStep {
  text: string
  link?: { href: string; label: string }
}

function getSteps(platform: ChannelPlatform): { steps: GuideStep[]; note?: string } {
  switch (platform) {
    case "telegram":
      return {
        steps: [
          {
            text: "Open Telegram and message @BotFather.",
            link: { href: "https://t.me/botfather", label: "t.me/botfather" },
          },
          { text: "Send /newbot and follow the prompts to name your bot." },
          { text: "Copy the bot token BotFather gives you and paste it below." },
        ],
        note: "To let the bot read group messages, send /setprivacy to BotFather and choose Disable.",
      }
    case "discord":
      return {
        steps: [
          {
            text: "Open the Discord Developer Portal and create a New Application.",
            link: {
              href: "https://discord.com/developers/applications",
              label: "discord.com/developers",
            },
          },
          { text: "In the Bot section, enable the Message Content Intent." },
          { text: "Copy the bot token and the Application ID into the fields below." },
          { text: "Invite the bot to your server via OAuth2 → URL Generator (scope: bot)." },
        ],
      }
    case "slack":
      return {
        steps: [
          {
            text: "Create a Slack app for your workspace.",
            link: { href: "https://api.slack.com/apps", label: "api.slack.com/apps" },
          },
          { text: "Enable Socket Mode and create an app-level token with connections:write (xapp-…)." },
          { text: "Add bot scopes: chat:write, app_mentions:read, im:history, then install the app." },
          { text: "Copy the bot token (xoxb-…) and the app token (xapp-…) below." },
        ],
      }
    case "whatsapp":
      return {
        steps: [
          { text: "Enter the phone number you want to connect." },
          { text: "After connecting, a QR code is printed in the LLMPanel server terminal." },
          { text: "Scan it from WhatsApp → Settings → Linked Devices on your phone." },
        ],
        note: "QR pairing currently requires access to the server console output.",
      }
    default:
      return { steps: [] }
  }
}

export function PlatformSetupGuide({ platform }: { platform: ChannelPlatform }) {
  const { steps, note } = getSteps(platform)
  if (steps.length === 0) return null

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-2">
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground mt-px">
              {i + 1}
            </span>
            <span>
              {step.text}{" "}
              {step.link && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2 hover:no-underline"
                >
                  {step.link.label}
                  <ExternalLink className="size-2.5" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      {note && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          <Lightbulb className="size-3 shrink-0 mt-0.5" />
          {note}
        </p>
      )}
    </div>
  )
}

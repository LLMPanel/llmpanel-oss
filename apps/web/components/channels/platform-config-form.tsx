"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ChannelPlatform } from "@/hooks/use-channels"

interface PlatformConfigFormProps {
  platform: ChannelPlatform
  config: Record<string, string>
  onChange: (config: Record<string, string>) => void
}

interface FieldDef {
  key: string
  label: string
  placeholder: string
  type?: string
  required?: boolean
}

function getFields(platform: ChannelPlatform): FieldDef[] {
  switch (platform) {
    case "telegram":
      return [
        {
          key: "botToken",
          label: "Bot Token",
          placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
          required: true,
        },
      ]
    case "discord":
      return [
        {
          key: "botToken",
          label: "Bot Token",
          placeholder: "MTIz...abc",
          required: true,
        },
        {
          key: "applicationId",
          label: "Application ID",
          placeholder: "1234567890",
          required: true,
        },
        {
          key: "guildId",
          label: "Guild ID (optional)",
          placeholder: "9876543210",
        },
      ]
    case "slack":
      return [
        {
          key: "botToken",
          label: "Bot Token",
          placeholder: "xoxb-...",
          required: true,
        },
        {
          key: "appToken",
          label: "App-Level Token",
          placeholder: "xapp-...",
          required: true,
        },
      ]
    case "whatsapp":
      return [
        {
          key: "phoneNumber",
          label: "Phone Number",
          placeholder: "+1234567890",
          required: true,
        },
      ]
    case "feishu":
      return [
        {
          key: "appId",
          label: "App ID",
          placeholder: "cli_abc123",
          required: true,
        },
        {
          key: "appSecret",
          label: "App Secret",
          placeholder: "secret",
          type: "password",
          required: true,
        },
      ]
    case "twitch":
      return [
        {
          key: "oauthToken",
          label: "OAuth Token",
          placeholder: "oauth:abc123",
          type: "password",
          required: true,
        },
        {
          key: "clientId",
          label: "Client ID",
          placeholder: "abc123",
          required: true,
        },
        {
          key: "channels",
          label: "Channels (comma-separated)",
          placeholder: "mychannel,otherchannel",
          required: true,
        },
      ]
    case "zalo":
      return [
        {
          key: "appId",
          label: "App ID",
          placeholder: "1234567890",
          required: true,
        },
        {
          key: "secretKey",
          label: "Secret Key",
          placeholder: "secret",
          type: "password",
          required: true,
        },
        {
          key: "oaAccessToken",
          label: "OA Access Token",
          placeholder: "token",
          type: "password",
          required: true,
        },
      ]
  }
}

/** Config keys that must be filled before a connection attempt makes sense. */
export function requiredKeys(platform: ChannelPlatform): string[] {
  return getFields(platform)
    .filter((f) => f.required)
    .map((f) => f.key)
}

export function PlatformConfigForm({
  platform,
  config,
  onChange,
}: PlatformConfigFormProps) {
  const fields = getFields(platform)

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={field.key} className="text-xs">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={field.key}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            value={config[field.key] ?? ""}
            onChange={(e) =>
              onChange({ ...config, [field.key]: e.target.value })
            }
            className="h-8 text-sm"
          />
        </div>
      ))}
    </div>
  )
}

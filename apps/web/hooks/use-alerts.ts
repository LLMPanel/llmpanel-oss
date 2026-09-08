"use client"

import { useState, useEffect, useCallback } from "react"

export type AlertPlatform = "telegram" | "discord" | "slack"

export type AlertEvent =
  | "deployment.started"
  | "deployment.running"
  | "deployment.failed"
  | "deployment.stopped"

export interface AlertChannel {
  id: string
  platform: AlertPlatform
  name: string
  isActive: boolean
  createdAt: string
  config: Record<string, string>
}

export interface AlertRule {
  id: string
  deploymentId: string
  channelId: string
  events: AlertEvent[]
  isActive: boolean
  createdAt: string
  channel: {
    id: string
    platform: AlertPlatform
    name: string
    isActive: boolean
    config: Record<string, string>
  }
}

// ── Alert Channels (user-level) ──────────────────────────────────────────────

export function useAlertChannels() {
  const [channels, setChannels] = useState<AlertChannel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch("/api/v1/alerts/channels", {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch alert channels")
      const data = (await res.json()) as { channels: AlertChannel[] }
      setChannels(data.channels)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { channels, isLoading, error, refetch: load }
}

export async function createAlertChannel(body: {
  platform: AlertPlatform
  name: string
  config: Record<string, string>
}): Promise<AlertChannel> {
  const res = await globalThis.fetch("/api/v1/alerts/channels", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create channel")
  }
  const data = (await res.json()) as { channel: AlertChannel }
  return data.channel
}

export async function updateAlertChannel(
  channelId: string,
  body: { name?: string; config?: Record<string, string> }
): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/alerts/channels/${channelId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update channel")
}

export async function deleteAlertChannel(channelId: string): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/alerts/channels/${channelId}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) throw new Error("Failed to delete channel")
}

export async function testAlertChannel(channelId: string): Promise<void> {
  const res = await globalThis.fetch(
    `/api/v1/alerts/channels/${channelId}/test`,
    {
      method: "POST",
      credentials: "include",
    }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to send test alert")
  }
}

// ── Alert Rules (deployment-level) ──────────────────────────────────────────

export function useAlertRules(deploymentId: string) {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deploymentId}/alerts`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to fetch alert rules")
      const data = (await res.json()) as { rules: AlertRule[] }
      setRules(data.rules)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId])

  useEffect(() => {
    void load()
  }, [load])

  return { rules, isLoading, error, refetch: load }
}

export async function createAlertRule(
  deploymentId: string,
  body: { channelId: string; events: AlertEvent[] }
): Promise<AlertRule> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/alerts`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create alert rule")
  }
  const data = (await res.json()) as { rule: AlertRule }
  return data.rule
}

export async function updateAlertRule(
  deploymentId: string,
  ruleId: string,
  body: { events?: AlertEvent[]; isActive?: boolean }
): Promise<void> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/alerts/${ruleId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error("Failed to update alert rule")
}

export async function deleteAlertRule(
  deploymentId: string,
  ruleId: string
): Promise<void> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/alerts/${ruleId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  )
  if (!res.ok) throw new Error("Failed to delete alert rule")
}

"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export type ChannelPlatform = "whatsapp" | "telegram" | "discord" | "slack" | "feishu" | "twitch" | "zalo"
export type ChannelStatus = "pending" | "active" | "error"

export interface ChannelAgentSummary {
  id: string
  name: string
  emoji: string | null
}

export interface Channel {
  id: string
  platform: ChannelPlatform
  name: string
  status: ChannelStatus
  statusMessage: string | null
  isActive: boolean
  connectedAt: string | null
  createdAt: string
  systemPrompt: string | null
  memoryEnabled: boolean | null
  agentId: string | null
  agent: ChannelAgentSummary | null
  historyEnabled: boolean
  historyLimit: number
  allowlist: string[] | null
  rateLimitPerMinute: number | null
  config: Record<string, string | undefined>
}

export interface ChannelMessage {
  id: string
  channelConnectionId: string
  platformUserId: string
  platformUsername: string | null
  direction: "inbound" | "outbound" | "system"
  content: string
  tokenCount: number | null
  createdAt: string
}

export interface ChannelStats {
  totalMessages: number
  messages24h: number
  uniqueUsers: number
  connectedAt: string | null
  lastMessageAt: string | null
}

export interface ChannelConversation {
  platformUserId: string
  platformUsername: string | null
  messageCount: number
  lastMessageAt: string
  lastMessagePreview: string | null
}

export interface ChannelBehaviorInput {
  systemPrompt?: string | null
  memoryEnabled?: boolean
  agentId?: string | null
  historyEnabled?: boolean
  historyLimit?: number
  allowlist?: string[] | null
  rateLimitPerMinute?: number | null
}

export type UpdateChannelInput = ChannelBehaviorInput & {
  name?: string
  isActive?: boolean
  config?: Record<string, string>
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await globalThis.fetch(url, { credentials: "include", ...init })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

/** Shared polling wrapper: fetch once on mount, then every pollMs when set. */
function usePolledResource<T>(
  fetcher: () => Promise<T>,
  pollMs?: number
) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialLoadDone = useRef(false)

  const load = useCallback(async () => {
    if (!initialLoadDone.current) setIsLoading(true)
    setError(null)
    try {
      setData(await fetcher())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      initialLoadDone.current = true
      setIsLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    void load()
    if (!pollMs) return
    const interval = setInterval(() => void load(), pollMs)
    return () => clearInterval(interval)
  }, [load, pollMs])

  return { data, isLoading, error, refetch: load }
}

export function useChannels(deploymentId: string, opts?: { pollMs?: number }) {
  const fetcher = useCallback(
    () =>
      fetchJson<{ channels: Channel[] }>(
        `/api/v1/deployments/${deploymentId}/channels`
      ).then((d) => d.channels),
    [deploymentId]
  )
  const { data, isLoading, error, refetch } = usePolledResource(fetcher, opts?.pollMs)
  return { channels: data ?? [], isLoading, error, refetch }
}

export function useChannel(deploymentId: string, channelId: string) {
  const fetcher = useCallback(
    () =>
      fetchJson<{ channel: Channel }>(
        `/api/v1/deployments/${deploymentId}/channels/${channelId}`
      ).then((d) => d.channel),
    [deploymentId, channelId]
  )
  const { data, isLoading, error, refetch } = usePolledResource(fetcher)
  return { channel: data, isLoading, error, refetch }
}

export function useChannelStats(
  deploymentId: string,
  channelId: string,
  opts?: { pollMs?: number }
) {
  const fetcher = useCallback(
    () =>
      fetchJson<{ stats: ChannelStats }>(
        `/api/v1/deployments/${deploymentId}/channels/${channelId}/stats`
      ).then((d) => d.stats),
    [deploymentId, channelId]
  )
  const { data, isLoading, error, refetch } = usePolledResource(
    fetcher,
    opts?.pollMs ?? 15_000
  )
  return { stats: data, isLoading, error, refetch }
}

export function useChannelConversations(
  deploymentId: string,
  channelId: string,
  opts?: { pollMs?: number }
) {
  const fetcher = useCallback(
    () =>
      fetchJson<{ conversations: ChannelConversation[] }>(
        `/api/v1/deployments/${deploymentId}/channels/${channelId}/conversations`
      ).then((d) => d.conversations),
    [deploymentId, channelId]
  )
  const { data, isLoading, error, refetch } = usePolledResource(
    fetcher,
    opts?.pollMs ?? 10_000
  )
  return { conversations: data ?? [], isLoading, error, refetch }
}

export async function createChannel(
  deploymentId: string,
  body: ChannelBehaviorInput & {
    platform: ChannelPlatform
    name: string
    config: Record<string, string>
  }
): Promise<Channel> {
  const data = await fetchJson<{ channel: Channel }>(
    `/api/v1/deployments/${deploymentId}/channels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  return data.channel
}

export async function updateChannel(
  deploymentId: string,
  channelId: string,
  body: UpdateChannelInput
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

export async function toggleChannel(
  deploymentId: string,
  channelId: string,
  isActive: boolean
): Promise<void> {
  await updateChannel(deploymentId, channelId, { isActive })
}

export async function disconnectChannel(
  deploymentId: string,
  channelId: string
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}`,
    { method: "DELETE" }
  )
}

export async function startChannel(
  deploymentId: string,
  channelId: string
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/start`,
    { method: "POST" }
  )
}

export async function stopChannel(
  deploymentId: string,
  channelId: string
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/stop`,
    { method: "POST" }
  )
}

export async function restartChannel(
  deploymentId: string,
  channelId: string
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/restart`,
    { method: "POST" }
  )
}

export async function getChannelMessages(
  deploymentId: string,
  channelId: string,
  opts?: { limit?: number; offset?: number }
): Promise<ChannelMessage[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set("limit", String(opts.limit))
  if (opts?.offset) params.set("offset", String(opts.offset))

  const data = await fetchJson<{ messages: ChannelMessage[] }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/messages?${params.toString()}`
  )
  return data.messages
}

export async function getConversationMessages(
  deploymentId: string,
  channelId: string,
  platformUserId: string,
  opts?: { limit?: number; offset?: number }
): Promise<ChannelMessage[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set("limit", String(opts.limit))
  if (opts?.offset) params.set("offset", String(opts.offset))

  // platformUserId may contain "@" (WhatsApp JIDs) — always encode
  const data = await fetchJson<{ messages: ChannelMessage[] }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/conversations/${encodeURIComponent(platformUserId)}/messages?${params.toString()}`
  )
  return data.messages
}

export async function testChannel(
  deploymentId: string,
  channelId: string
): Promise<void> {
  await fetchJson<{ success: boolean }>(
    `/api/v1/deployments/${deploymentId}/channels/${channelId}/test`,
    { method: "POST" }
  )
}

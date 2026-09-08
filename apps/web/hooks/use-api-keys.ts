"use client"

import { useState, useEffect, useCallback } from "react"

export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  rpmLimit: number | null
  tpmLimit: number | null
  dailyLimit: number | null
  deploymentId: string | null
  deploymentName: string
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface ApiKeyUsage {
  totalRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageLatencyMs: number
  period: string
}

export interface CreateApiKeyInput {
  name: string
  deploymentId?: string
  scopes?: string[]
  rpmLimit?: number | null
  tpmLimit?: number | null
  dailyLimit?: number | null
  expiresAt?: string | null
}

export function useApiKeys(deploymentId?: string) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const url = deploymentId
        ? `/api/v1/api-keys?deploymentId=${encodeURIComponent(deploymentId)}`
        : "/api/v1/api-keys"
      const res = await globalThis.fetch(url, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch API keys")
      const data = (await res.json()) as { apiKeys: ApiKey[] }
      setApiKeys(data.apiKeys.map((k) => ({
        ...k,
        scopes: Array.isArray(k.scopes)
          ? k.scopes
          : JSON.parse(k.scopes as unknown as string) as string[],
      })))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId])

  useEffect(() => { load() }, [load])

  return { apiKeys, isLoading, error, refetch: load }
}

export function useApiKeyUsage(id: string, period = "24h") {
  const [usage, setUsage] = useState<ApiKeyUsage | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await globalThis.fetch(
        `/api/v1/api-keys/${id}/usage?period=${period}`,
        { credentials: "include" }
      )
      if (!res.ok) return
      const data = (await res.json()) as { usage: ApiKeyUsage }
      setUsage(data.usage)
    } finally {
      setIsLoading(false)
    }
  }, [id, period])

  useEffect(() => { load() }, [load])

  return { usage, isLoading }
}

export async function createApiKey(body: CreateApiKeyInput): Promise<{ apiKey: ApiKey & { key: string } }> {
  const res = await globalThis.fetch("/api/v1/api-keys", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create API key")
  }
  return res.json() as Promise<{ apiKey: ApiKey & { key: string } }>
}

export async function deleteApiKey(id: string): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/api-keys/${id}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to delete API key")
  }
}

export async function updateApiKey(
  id: string,
  body: Partial<Pick<ApiKey, "name" | "rpmLimit" | "tpmLimit" | "dailyLimit" | "isActive">>
): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/api-keys/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to update API key")
  }
}

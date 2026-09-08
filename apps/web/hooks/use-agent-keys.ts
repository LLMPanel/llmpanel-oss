"use client"

import { useCallback, useEffect, useState } from "react"

export interface AgentKey {
  id: string
  name: string
  prefix: string
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface CreateAgentKeyInput {
  name?: string
  expiresAt?: string
}

export function useAgentKeys(deploymentId: string, agentId: string) {
  const [keys, setKeys] = useState<AgentKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deploymentId}/agents/${agentId}/keys`,
        { credentials: "include" }
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch agent keys")
      }
      const data = (await res.json()) as { keys: AgentKey[] }
      setKeys(data.keys)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, agentId])

  useEffect(() => {
    void load()
  }, [load])

  return { keys, isLoading, error, refetch: load }
}

export async function createAgentKey(
  deploymentId: string,
  agentId: string,
  body: CreateAgentKeyInput
): Promise<AgentKey & { key: string }> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/agents/${agentId}/keys`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create agent key")
  }
  const data = (await res.json()) as { key: AgentKey & { key: string } }
  return data.key
}

export async function revokeAgentKey(
  deploymentId: string,
  agentId: string,
  keyId: string
): Promise<void> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/agents/${agentId}/keys/${keyId}`,
    { method: "DELETE", credentials: "include" }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to revoke agent key")
  }
}

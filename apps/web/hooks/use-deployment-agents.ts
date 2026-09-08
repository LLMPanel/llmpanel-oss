"use client"

import { useCallback, useEffect, useState } from "react"

export type AgentSourceType = "deployment" | "openai-compatible"

export type AgentTool = "knowledge_search"

export interface AttachedCollection {
  id: string
  name: string
  documentCount: number
  totalChunks: number
  vectorStoreType: string
  embeddingSource: string
}

export interface DeploymentAgent {
  id: string
  deploymentId: string
  name: string
  description: string | null
  systemPrompt: string | null
  sourceType: AgentSourceType
  targetDeploymentId: string | null
  externalBaseUrl: string | null
  externalModel: string | null
  emoji: string | null
  toolsEnabled: AgentTool[]
  /** @deprecated first attached collection — use ragCollectionIds */
  ragCollectionId: string | null
  ragCollectionIds: string[]
  ragCollections: AttachedCollection[]
  maxSteps: number
  temperature: number | null
  maxTokens: number | null
  endpointPath: string
  createdAt: string
  updatedAt: string
}

export interface AgentUsage {
  period: "7d"
  totalRequests: number
  totalTokens: number
  errorCount: number
  avgLatencyMs: number
  lastRequestAt: string | null
}

export type CreateDeploymentAgentInput = {
  name: string
  description?: string
  systemPrompt?: string
  sourceType: AgentSourceType
  targetDeploymentId?: string
  externalBaseUrl?: string
  externalModel?: string
  externalApiKey?: string
  emoji?: string
  toolsEnabled?: AgentTool[]
  ragCollectionId?: string | null
  ragCollectionIds?: string[]
  maxSteps?: number
  temperature?: number | null
  maxTokens?: number | null
}

export type UpdateDeploymentAgentInput = Partial<CreateDeploymentAgentInput>

export function useDeploymentAgents(deploymentId: string) {
  const [agents, setAgents] = useState<DeploymentAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(`/api/v1/deployments/${deploymentId}/agents`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch agents")
      }
      const data = (await res.json()) as { agents: DeploymentAgent[] }
      setAgents(data.agents)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId])

  useEffect(() => {
    void load()
  }, [load])

  return { agents, isLoading, error, refetch: load }
}

export async function createDeploymentAgent(
  deploymentId: string,
  body: CreateDeploymentAgentInput
): Promise<DeploymentAgent> {
  const res = await globalThis.fetch(`/api/v1/deployments/${deploymentId}/agents`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create agent")
  }

  const data = (await res.json()) as { agent: DeploymentAgent }
  return data.agent
}

export async function updateDeploymentAgent(
  deploymentId: string,
  agentId: string,
  body: UpdateDeploymentAgentInput
): Promise<DeploymentAgent> {
  const res = await globalThis.fetch(`/api/v1/deployments/${deploymentId}/agents/${agentId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to update agent")
  }

  const data = (await res.json()) as { agent: DeploymentAgent }
  return data.agent
}

export async function deleteDeploymentAgent(deploymentId: string, agentId: string): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/deployments/${deploymentId}/agents/${agentId}`, {
    method: "DELETE",
    credentials: "include",
  })

  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to delete agent")
  }
}

export function useDeploymentAgent(deploymentId: string, agentId: string) {
  const [agent, setAgent] = useState<DeploymentAgent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deploymentId}/agents/${agentId}`,
        { credentials: "include" }
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch agent")
      }
      const data = (await res.json()) as { agent: DeploymentAgent }
      setAgent(data.agent)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, agentId])

  useEffect(() => {
    void load()
  }, [load])

  return { agent, isLoading, error, refetch: load }
}

export function useAgentUsage(deploymentId: string, agentId: string) {
  const [usage, setUsage] = useState<AgentUsage | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deploymentId}/agents/${agentId}/usage`,
        { credentials: "include" }
      )
      if (!res.ok) return
      const data = (await res.json()) as { usage: AgentUsage }
      setUsage(data.usage)
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, agentId])

  useEffect(() => {
    void load()
  }, [load])

  return { usage, isLoading, refetch: load }
}

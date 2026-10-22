"use client"

import { useState, useEffect, useCallback } from "react"

/** Statuses that no longer change on their own — once reached, polling can stop. */
const SETTLED_STATUSES = ["running", "failed", "stopped"]
const POLL_INTERVAL_MS = 5000

function isSettled(status: string) {
  return SETTLED_STATUSES.includes(status)
}

/**
 * Polls `refetch` on an interval while the tab is visible. Pauses when the tab
 * is hidden and refetches immediately when it becomes visible again. Returns a
 * cleanup function for use as a useEffect teardown.
 */
function startPolling(refetch: () => void): () => void {
  let intervalId: ReturnType<typeof setInterval> | undefined

  const start = () => {
    if (intervalId == null) {
      intervalId = setInterval(refetch, POLL_INTERVAL_MS)
    }
  }
  const stop = () => {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = undefined
    }
  }
  const onVisibilityChange = () => {
    if (document.hidden) {
      stop()
    } else {
      refetch()
      start()
    }
  }

  if (!document.hidden) start()
  document.addEventListener("visibilitychange", onVisibilityChange)

  return () => {
    stop()
    document.removeEventListener("visibilitychange", onVisibilityChange)
  }
}

export interface Deployment {
  id: string
  name: string | null
  description: string | null
  modelId: string,
  huggingfaceId: string,
  providerConnectionId: string | null
  providerType: string
  gpuType: string
  quantization: string
  inferenceEngine: string
  modelType: string | null
  status: string
  progress: number | null
  statusMessage: string | null
  endpoint: string | null
  domain: string | null
  /** Public URL for the deployment's own subdomain (https://<domain>), when wildcard routing is configured. */
  domainUrl: string | null
  /** Public origin of the LLMPanel gateway (PUBLIC_API_URL), resolved server-side at runtime. */
  gatewayUrl?: string
  errorMessage: string | null
  costPerHour: number | null
  runningFor: string | null
  createdAt: string
  externalId: string | null
  model: {
    id: string
    name: string
    slug: string
    family: string
  } | null
}

export function useDeployments() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch("/api/v1/deployments", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch deployments")
      const data = (await res.json()) as { deployments: Deployment[] }
      setDeployments(data.deployments)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Live-update while any deployment is still in progress: poll silently every
  // few seconds, pause when the tab is hidden, and stop once everything settles.
  const hasActiveDeployment = deployments.some((d) => !isSettled(d.status))
  useEffect(() => {
    if (!hasActiveDeployment) return
    return startPolling(() => load({ silent: true }))
  }, [hasActiveDeployment, load])

  return { deployments, isLoading, error, refetch: load }
}

export function useDeployment(id: string) {
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch(`/api/v1/deployments/${id}`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch deployment")
      const data = (await res.json()) as { deployment: Deployment }
      setDeployment(data.deployment)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Live-update while this deployment is still in progress (see useDeployments).
  const isActive = deployment != null && !isSettled(deployment.status)
  useEffect(() => {
    if (!isActive) return
    return startPolling(() => load({ silent: true }))
  }, [isActive, load])

  return { deployment, isLoading, error, refetch: load }
}

export interface CreateDeploymentInput {
  name?: string
  description?: string
  modelSlug: string
  providerId: string
  gpuType: string
  providerOfferId?: string
  cloudType?: "secure" | "community"
  gpuCount?: number
  quantization: "fp16" | "int8" | "int4" | "gguf"
  inferenceEngine?: "vllm" | "sglang" | "llamacpp"
  kvCacheEnabled?: boolean
  dflashEnabled?: boolean
}

/** Error from the deployments API, carrying the server's error `code` when present. */
export class DeploymentError extends Error {
  readonly code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = "DeploymentError"
    this.code = code
  }
}

export async function createDeployment(body: CreateDeploymentInput): Promise<{ deployment: Deployment }> {
  const res = await globalThis.fetch("/api/v1/deployments", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json() as { error?: string; code?: string }
    // Carry the machine-readable code through so callers can react to a plan
    // limit with an upgrade path rather than a dead-end error string.
    throw new DeploymentError(data.error ?? "Failed to create deployment", data.code)
  }
  return res.json() as Promise<{ deployment: Deployment }>
}

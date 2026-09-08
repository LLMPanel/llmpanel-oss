"use client"

import { useState, useEffect, useCallback } from "react"

export interface Model {
  id: string
  name: string
  slug: string
  family: string
  huggingfaceId: string
  description: string | null
  minVram: number
  tags: string[]
  supportedQuantizations: string[]
  isActive: boolean
  isDeployed: boolean
}

export function useModels() {
  const [models, setModels] = useState<Model[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch("/api/v1/models", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch models")
      const data = (await res.json()) as { models: Model[] }
      setModels(data.models)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { models, isLoading, error, refetch: load }
}

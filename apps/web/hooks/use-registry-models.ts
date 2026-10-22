"use client"

import { useState, useEffect, useCallback } from "react"

export interface RegistryQuantization {
  format: string
  vramRequiredGb: number
  huggingfaceId: string | null
  fileSizeGb: number | null
  recommended: boolean
  notes: string | null
}

export interface RegistryModel {
  id: string
  name: string
  slug: string
  family: string
  huggingfaceId: string
  description: string | null
  minVram: number
  tags: string[]
  /** Unset for text LLMs; "vlm" / "ocr" / "image-generation" otherwise. */
  modelType?: string | null
  quantizations: RegistryQuantization[]
}

interface ModelsResponse {
  models: RegistryModel[]
  total: number
  families: string[]
}

export function useRegistryModels(params?: { family?: string; search?: string; tag?: string }) {
  const [models, setModels] = useState<RegistryModel[]>([])
  const [families, setFamilies] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // The API proxies the model registry (and keeps a cached copy of it), so
      // the browser never talks to the registry directly.
      const query = new URLSearchParams()
      if (params?.family) query.set("family", params.family)
      if (params?.search) query.set("search", params.search)
      if (params?.tag) query.set("tag", params.tag)
      const qs = query.toString()

      const res = await globalThis.fetch(`/api/v1/registry/models${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Failed to fetch models from registry")
      }
      const data = (await res.json()) as ModelsResponse

      // Merge in local image-generation models (not part of the external registry).
      const { IMAGE_MODELS } = await import("@/lib/image-models")
      const q = params?.search?.toLowerCase()
      const localImageModels = IMAGE_MODELS.filter((m) => {
        if (params?.family && m.family !== params.family) return false
        if (params?.tag && !m.tags.includes(params.tag)) return false
        if (q) {
          const hay = `${m.name} ${m.family} ${m.huggingfaceId} ${m.tags.join(" ")}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })

      const mergedModels = [...localImageModels, ...data.models]
      const mergedFamilies = Array.from(
        new Set([...localImageModels.map((m) => m.family), ...data.families]),
      )

      setModels(mergedModels)
      setFamilies(mergedFamilies)
      setTotal(data.total + localImageModels.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [params?.family, params?.search, params?.tag])

  useEffect(() => { load() }, [load])

  return { models, families, total, isLoading, error, refetch: load }
}

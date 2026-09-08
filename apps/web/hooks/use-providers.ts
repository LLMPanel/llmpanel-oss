"use client"

import { useState, useEffect, useCallback } from "react"

export interface Provider {
  id: string
  name: string
  providerType:
    | "local"
    | "runpod"
    | "vastai"
    | "hotaisle"
    | "thundercompute"
    | "lambdalabs"
    | "tensordock"
    | "datacrunch"
    | "hyperstack"
  isDefault: boolean
  isActive: boolean
  createdAt: string
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await globalThis.fetch("/api/v1/providers", { credentials: "include" })
      if (!res.ok) return
      const data = (await res.json()) as { providers: Provider[] }
      setProviders(data.providers)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const defaultProvider = providers.find(p => p.isDefault) ?? providers[0] ?? null

  return { providers, defaultProvider, isLoading }
}

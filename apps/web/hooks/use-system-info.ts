"use client"

import { useState, useEffect } from "react"

export interface SystemInfo {
  deploymentMode: "self-hosted" | "cloud"
  version: string
}

export function useSystemInfo() {
  const [data, setData] = useState<SystemInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    globalThis
      .fetch("/api/v1/system/info", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(json => setData(json as SystemInfo | null))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false))
  }, [])

  return {
    deploymentMode: data?.deploymentMode ?? "self-hosted",
    version: data?.version ?? "1.0.0",
    isLoading,
  }
}

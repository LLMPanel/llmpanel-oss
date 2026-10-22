"use client"

import { useState, useEffect, useCallback } from "react"

export interface SystemGpu {
  index: number
  name: string
  totalVramMb: number
  freeVramMb: number
  usedVramMb: number
  utilizationPercent: number
  temperatureCelsius: number
}

/** The host's CPU and RAM — only reported when it has no GPU, in which case
 *  local deployments run on the CPU (llama.cpp). */
export interface HostCpu {
  cores: number
  totalRamMb: number
  availableRamMb: number
}

export interface SystemGpuData {
  detected: boolean
  gpus: SystemGpu[]
  error?: string
  cpu?: HostCpu
}

/** Converts MiB → whole GB (rounded) */
export function mbToGb(mb: number): number {
  return Math.round(mb / 1024)
}

export function useSystemGpu() {
  const [data, setData] = useState<SystemGpuData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await globalThis.fetch("/api/v1/system/gpu", {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Request failed")
      setData((await res.json()) as SystemGpuData)
    } catch {
      setData({ detected: false, gpus: [], error: "Could not reach API" })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return {
    detected: data?.detected ?? false,
    gpus: data?.gpus ?? [],
    error: data?.error,
    cpu: data?.cpu ?? null,
    isLoading,
    refetch: load,
  }
}

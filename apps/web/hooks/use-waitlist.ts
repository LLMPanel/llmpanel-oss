"use client"

import { useState, useEffect, useCallback } from "react"

export interface WaitlistSignup {
  id: string
  email: string
  source: string | null
  createdAt: string
}

/** Admin-only list of founder-pricing waitlist signups from the marketing site. */
export function useWaitlist() {
  const [signups, setSignups] = useState<WaitlistSignup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      const res = await globalThis.fetch("/api/v1/admin/waitlist", {
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const data = (await res.json()) as { signups: WaitlistSignup[] }
      setSignups(data.signups)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { signups, isLoading, error, refetch: load }
}

"use client"

import { useEffect, useState } from "react"

/**
 * Whether this instance still needs first-run setup (zero accounts exist).
 * Returns `null` while loading; falls back to `false` (setup done) on error
 * so a failing API never exposes the register form.
 */
export function useSetupStatus(): boolean | null {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    globalThis
      .fetch("/api/v1/setup/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { needsSetup?: boolean } | null) => {
        if (!cancelled) setNeedsSetup(Boolean(data?.needsSetup))
      })
      .catch(() => {
        if (!cancelled) setNeedsSetup(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return needsSetup
}

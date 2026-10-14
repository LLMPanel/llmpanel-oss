"use client"

import { useState, useEffect, useRef } from "react"

const MAX_LINES = 500

export function useDeploymentLogs(deploymentId: string, externalId: string | null) {
  const [lines, setLines] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  // Clear the log when the deployment loses its container. Done during render,
  // when the input changes, rather than synchronously inside the effect.
  const [trackedExternalId, setTrackedExternalId] = useState(externalId)
  if (externalId !== trackedExternalId) {
    setTrackedExternalId(externalId)
    if (!externalId) {
      setLines([])
      setIsConnected(false)
    }
  }

  useEffect(() => {
    if (!externalId) return

    const sse = new EventSource(`/api/v1/deployments/${deploymentId}/logs`)
    sseRef.current = sse

    sse.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    sse.onmessage = (event: MessageEvent) => {
      const line = event.data as string
      setLines(prev => {
        const next = [...prev, line]
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    }

    sse.onerror = () => {
      setIsConnected(false)
      setError("Log stream disconnected")
      sse.close()
    }

    return () => {
      sse.close()
      sseRef.current = null
    }
  }, [deploymentId, externalId])

  return { lines, isConnected, error }
}

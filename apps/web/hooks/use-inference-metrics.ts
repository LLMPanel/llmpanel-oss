"use client"

import { useState, useEffect, useRef } from "react"

export interface RequestHistoryPoint {
  time: string
  successful: number
  failed: number
}

export interface TokenHistoryPoint {
  time: string
  input: number
  output: number
}

export interface InferenceMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  errorRate: number
  requestsPerMinute: number
  requestsPerSecond: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  tokensPerSecond: number
  averageLatencyMs: number
  requestHistory: RequestHistoryPoint[]
  tokenHistory: TokenHistoryPoint[]
}

// Shape returned by GET /api/v1/metrics/deployments/:id/inference
interface InferenceResponse {
  stats: Omit<InferenceMetrics, "requestHistory" | "tokenHistory">
  points: Array<{
    t: number
    successful: number
    failed: number
    input: number
    output: number
  }>
}

const POLL_MS = 5000

export function useInferenceMetrics(
  deploymentId: string,
  isRunning: boolean,
): InferenceMetrics | null {
  const [metrics, setMetrics] = useState<InferenceMetrics | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isRunning) {
      setMetrics(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const fetchMetrics = async () => {
      try {
        const res = await globalThis.fetch(
          `/api/v1/metrics/deployments/${deploymentId}/inference`,
          { credentials: "include" }
        )
        if (!res.ok) return
        const data = (await res.json()) as InferenceResponse

        // Format bucket timestamps in the viewer's local timezone.
        const label = (t: number) =>
          new Date(t).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })

        setMetrics({
          ...data.stats,
          requestHistory: data.points.map((p) => ({
            time: label(p.t),
            successful: p.successful,
            failed: p.failed,
          })),
          tokenHistory: data.points.map((p) => ({
            time: label(p.t),
            input: p.input,
            output: p.output,
          })),
        })
      } catch {
        // best-effort — keep last known metrics on transient failures
      }
    }

    void fetchMetrics()
    intervalRef.current = setInterval(fetchMetrics, POLL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [deploymentId, isRunning])

  return metrics
}

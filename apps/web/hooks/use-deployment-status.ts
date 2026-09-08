import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type DeploymentStatusValue =
  | "provisioning"
  | "downloading"
  | "loading"
  | "health_check"
  | "running"
  | "stopped"
  | "failed"

interface DeploymentStatus {
  status: DeploymentStatusValue
  progress: number
  message: string
  endpoint: string | null
}

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000]

/**
 * Live deployment status over SSE.
 *
 * `initialStatus` seeds the value until the first SSE event lands — without
 * it, an already-running deployment reads as "provisioning" on first paint.
 * `received` tells callers whether the status is live (from SSE) or still
 * the seed value.
 */
export function useDeploymentStatus(
  deploymentId: string | null,
  initialStatus?: DeploymentStatusValue,
) {
  const [statusData, setStatusData] = useState<DeploymentStatus | null>(null)
  // The toast celebrates a *transition* to running/failed. If the very first
  // event is already terminal (revisiting a live deployment), stay quiet.
  const sawNonTerminal = useRef(false)

  useEffect(() => {
    if (!deploymentId) return

    let sse: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retries = 0
    let disposed = false

    const connect = () => {
      if (disposed) return
      sse = new EventSource(`/api/v1/deployments/${deploymentId}/status`)

      sse.onmessage = (event) => {
        retries = 0
        const data: DeploymentStatus = JSON.parse(event.data)
        const isTerminal = data.status === "running" || data.status === "failed" || data.status === "stopped"

        if (!isTerminal) sawNonTerminal.current = true
        setStatusData(data)

        if (data.status === "running") {
          if (sawNonTerminal.current) toast.success("Model is live!")
          sse?.close()
        }
        if (data.status === "failed") {
          if (sawNonTerminal.current) toast.error("Deployment failed")
          sse?.close()
        }
      }

      sse.onerror = () => {
        sse?.close()
        if (disposed || retries >= RETRY_DELAYS_MS.length) return
        retryTimer = setTimeout(connect, RETRY_DELAYS_MS[retries])
        retries += 1
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      sse?.close()
    }
  }, [deploymentId])

  return {
    status: statusData?.status ?? initialStatus ?? "provisioning",
    progress: statusData?.progress ?? 0,
    message: statusData?.message ?? "Starting...",
    endpoint: statusData?.endpoint ?? null,
    received: statusData !== null,
  }
}

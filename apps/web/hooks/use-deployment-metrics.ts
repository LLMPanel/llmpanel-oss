"use client"

// Orchestrating hook for the deployment metrics page. Composes SSE status,
// live GPU polling (5s), and history polling (30s) into a single view state
// machine so the page never flashes "unavailable" before the data has
// actually settled.
import { useMemo, useState } from "react"

import { useDeploymentStatus } from "./use-deployment-status"
import type { DeploymentStatusValue } from "./use-deployment-status"
import { useGpuMetrics } from "./use-gpu-metrics"
import type { GpuMetrics, MetricsCapabilities } from "./use-gpu-metrics"
import { useMetricsHistory } from "./use-metrics-history"
import type { MetricsHistory, MetricsHistoryPoint, MetricsWindow } from "./use-metrics-history"

export type MetricsView =
  /** Deployment or first history fetch still in flight. */
  | "loading"
  /** Running with a live sample on screen. */
  | "live"
  /** Starting up (provisioning through health check), or running but the
   *  first live sample hasn't landed yet. */
  | "starting"
  /** Not running; showing recorded history from the retention window. */
  | "history-only"
  /** Settled: nothing to show — no capability and no recorded history. */
  | "unavailable"

export interface DeploymentMetrics {
  status: DeploymentStatusValue
  view: MetricsView
  live: GpuMetrics | null
  capabilities: MetricsCapabilities | null
  history: MetricsHistory | null
  points: MetricsHistoryPoint[]
  hasHistoryData: boolean
  /** Most recent bucket that actually has samples — last-known values. */
  lastPoint: MetricsHistoryPoint | null
  window: MetricsWindow
  setWindow: (w: MetricsWindow) => void
}

export function useDeploymentMetrics(
  deploymentId: string,
  /** Status from the deployment fetch — seeds SSE until its first event. */
  initialStatus: string | undefined,
): DeploymentMetrics {
  const [window, setWindow] = useState<MetricsWindow>("1h")

  const sse = useDeploymentStatus(
    deploymentId,
    initialStatus as DeploymentStatusValue | undefined,
  )
  const status = sse.status
  const isRunning = status === "running"
  // Anything between create and running/failed/stopped — the deployment is
  // coming up, so "unavailable" would be both wrong and alarming.
  const isTransitional = !isRunning && status !== "failed" && status !== "stopped"

  const { metrics: live, capabilities: liveCapabilities } =
    useGpuMetrics(deploymentId, status)
  // Per-GPU series feeds the multi-GPU utilization overlay and clocks chart.
  const { history, isLoading: historyLoading } = useMetricsHistory(deploymentId, window, {
    perGpu: true,
  })

  // Live capabilities win (fresh from the provider); the history endpoint
  // supplies them when the deployment is stopped.
  const capabilities = liveCapabilities ?? history?.capabilities ?? null

  const points = useMemo(() => history?.points ?? [], [history])
  const hasHistoryData = useMemo(() => points.some((p) => p.samples > 0), [points])
  const lastPoint = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].samples > 0) return points[i]
    }
    return null
  }, [points])

  const hasAnyCapability =
    capabilities == null ||
    capabilities.gpuUtilization ||
    capabilities.vram ||
    capabilities.container

  let view: MetricsView
  if (initialStatus === undefined || (historyLoading && history == null)) {
    // Deployment fetch or the FIRST history response still pending — nothing
    // is settled yet, so never conclude "unavailable" here.
    view = "loading"
  } else if (isRunning && live) {
    view = "live"
  } else if (isRunning || isTransitional) {
    view = "starting"
  } else if (hasHistoryData) {
    view = "history-only"
  } else if (!hasAnyCapability || !isRunning) {
    view = "unavailable"
  } else {
    view = "loading"
  }

  return {
    status,
    view,
    live,
    capabilities,
    history,
    points,
    hasHistoryData,
    lastPoint,
    window,
    setWindow,
  }
}

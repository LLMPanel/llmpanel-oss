"use client"

import { use } from "react"
import { Loader2, AlertCircle, RefreshCw, ChartPie, PauseCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDeployment } from "@/hooks/use-deployments"
import { useDeploymentMetrics } from "@/hooks/use-deployment-metrics"
import { PageHeader } from "@/components/deployments/page-header"
import { MetricsToolbar } from "@/components/metrics/metrics-toolbar"
import { KpiStrip } from "@/components/metrics/kpi-strip"
import {
  ClocksHistoryChart,
  ContainerHistoryChart,
  GpuUtilHistoryChart,
  PowerHistoryChart,
  TemperatureHistoryChart,
  VramHistoryChart,
} from "@/components/metrics/history-chart"
import { GpuGrid } from "@/components/metrics/gpu-grid"
import { MetricsNotAvailable } from "@/components/metrics/metrics-not-available"

export default function MetricsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const { deployment, isLoading, error, refetch } = useDeployment(id)
  const {
    status,
    view,
    live,
    capabilities,
    points,
    hasHistoryData,
    lastPoint,
    window,
    setWindow,
  } = useDeploymentMetrics(id, deployment?.status)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Loading deployment...</p>
      </div>
    )
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">{error ?? "Deployment not found"}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  // Settled dead end: provider has no metrics API and nothing was recorded.
  if (view === "unavailable") {
    return (
      <MetricsNotAvailable
        deploymentId={id}
        status={status}
        providerType={deployment.providerType}
      />
    )
  }

  if (view === "loading") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Metrics"
          description="Live and historical GPU, VRAM, and container telemetry."
          icon={ChartPie}
        />
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Fetching metrics...</p>
        </div>
      </div>
    )
  }

  const showTemperature = capabilities?.temperature ?? false
  const showPower = capabilities?.power ?? false
  const showClocks = capabilities?.clocks ?? false
  const showContainer = capabilities?.container ?? false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metrics"
        description="Live and historical GPU, VRAM, and container telemetry."
        icon={ChartPie}
        actions={<MetricsToolbar view={view} window={window} onWindowChange={setWindow} />}
      />

      {/* Deployment still coming up — metrics start once it's running */}
      {view === "starting" && status !== "running" && (
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/40 px-4 py-3">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Deployment is {status.replace(/_/g, " ")} — live metrics will appear
            once the model is running.
          </p>
        </div>
      )}

      {/* Stopped deployments keep their history for 24h */}
      {view === "history-only" && (
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/40 px-4 py-3">
          <PauseCircle className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Live metrics unavailable — deployment is {status}. Showing recorded
            history from the last 24 hours.
          </p>
        </div>
      )}

      {/* KPI strip: live values, or last-known values when stopped */}
      <KpiStrip live={live} lastPoint={view === "live" ? null : lastPoint} capabilities={capabilities} />

      {/* History charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GpuUtilHistoryChart data={points} />
        <VramHistoryChart data={points} />
        {showTemperature && <TemperatureHistoryChart data={points} />}
        {showPower && <PowerHistoryChart data={points} />}
        {showClocks && <ClocksHistoryChart data={points} />}
        {showContainer && <ContainerHistoryChart data={points} />}
      </div>

      {!hasHistoryData && (
        <p className="text-center text-xs text-muted-foreground">
          {view === "live" || view === "starting"
            ? "History fills in as the collector samples this deployment (~every 20s)."
            : "No samples recorded in the selected window."}
        </p>
      )}

      {/* Per-GPU detail — live only */}
      {view === "live" && live && <GpuGrid gpus={live.gpus} />}
    </div>
  )
}

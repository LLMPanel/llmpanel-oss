"use client"

import { use } from "react"
import { useDeployment } from "@/hooks/use-deployments"
import { useDeploymentStatus } from "@/hooks/use-deployment-status"
import { useGpuMetrics } from "@/hooks/use-gpu-metrics"
import { useDeploymentLogs } from "@/hooks/use-deployment-logs"
import { useInferenceMetrics } from "@/hooks/use-inference-metrics"
import { DeploymentStatusCard } from "@/components/deployments/deployment-status-card"
import { DeploymentEndpointCard } from "@/components/deployments/deployment-endpoint-card"
import { GpuMetricsCard } from "@/components/deployments/gpu-metrics-card"
import { GpuTelemetryNote } from "@/components/deployments/gpu-telemetry-note"
import { InferenceStats } from "@/components/deployments/inference-stats"
import { RequestsChart, TokensChart } from "@/components/deployments/inference-charts"
import { LogsPanel } from "@/components/deployments/logs-panel"
import { SectionHeader } from "@/components/deployments/section-header"
import { isCpuEngine } from "@/lib/inference-engine"

export default function DeploymentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const base = `/dashboard/deployments/${id}`

  const { deployment, refetch } = useDeployment(id)
  const sseStatus = useDeploymentStatus(id)
  const { metrics: gpuMetrics, capabilities } = useGpuMetrics(id, sseStatus.status)
  const { lines, isConnected } = useDeploymentLogs(
    id,
    deployment?.externalId ?? null
  )
  const inferenceMetrics = useInferenceMetrics(
    id,
    sseStatus.status === "running"
  )

  // Layout guarantees `deployment` is loaded before children render, but this
  // page re-fetches independently, so guard against the first paint.
  if (!deployment) return null

  const status = sseStatus.status
  const progress = sseStatus.progress ?? deployment.progress ?? 0
  const statusMessage = sseStatus.message ?? deployment.statusMessage ?? ""
  const endpoint = sseStatus.endpoint ?? deployment.endpoint ?? null
  const isRunning = status === "running"
  const onCpu = isCpuEngine(deployment.inferenceEngine)

  return (
    <div className="space-y-8">
      {/* Status / progress — hidden when running */}
      <DeploymentStatusCard
        status={status}
        progress={progress}
        statusMessage={statusMessage}
        errorMessage={deployment.errorMessage}
      />

      {/* Endpoint — running only */}
      {isRunning && endpoint && (
        <section className="space-y-3">
          <SectionHeader
            title="Endpoint"
            viewAll={{ href: `${base}/api`, label: "API reference" }}
          />
          <DeploymentEndpointCard
            endpoint={endpoint}
            domain={deployment.domain}
            modelSlug={deployment.model?.slug ?? deployment.huggingfaceId}
          />
        </section>
      )}

      {/* Traffic summary — running only */}
      {isRunning && inferenceMetrics && (
        <section className="space-y-3">
          <SectionHeader
            title="Traffic"
            description="Live inference activity"
            viewAll={{ href: `${base}/usage`, label: "View usage" }}
          />
          <InferenceStats metrics={inferenceMetrics} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RequestsChart data={inferenceMetrics.requestHistory} />
            <TokensChart data={inferenceMetrics.tokenHistory} />
          </div>
        </section>
      )}

      {/* GPU summary — running only, when the provider reports GPU telemetry
          (local Docker via nvidia-smi, RunPod via its GraphQL runtime API). */}
      {isRunning && gpuMetrics && (capabilities?.gpuUtilization ?? gpuMetrics.gpus.length > 0) && (
        <section className="space-y-3">
          <SectionHeader
            title="GPU"
            description="Utilization across attached GPUs"
            viewAll={{ href: `${base}/metrics`, label: "GPU metrics" }}
          />
          <GpuMetricsCard metrics={gpuMetrics} />
        </section>
      )}

      {/* Why there's no GPU section — running only, for providers without GPU
          telemetry (RunPod/Vast.ai/Hot Aisle). The throughput numbers this used
          to repeat now live in the Traffic strip above. */}
      {isRunning &&
        inferenceMetrics &&
        !onCpu &&
        !(capabilities?.gpuUtilization ?? (gpuMetrics != null && gpuMetrics.gpus.length > 0)) && (
          <section className="space-y-3">
            <SectionHeader title="GPU" />
            <GpuTelemetryNote providerType={deployment.providerType} />
          </section>
        )}

      {/* CPU deployments (llama.cpp on a host with no GPU): nothing GPU to
          show, and their CPU and memory use live on the metrics page. */}
      {isRunning && onCpu && (
        <section className="space-y-3">
          <SectionHeader
            title="Hardware"
            viewAll={{ href: `${base}/metrics`, label: "CPU & memory" }}
          />
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Runs on this host&apos;s CPU with llama.cpp — there&apos;s no GPU on this host.
          </p>
        </section>
      )}

      {/* Recent container logs preview */}
      {/*<section className="space-y-3">
        <SectionHeader
          title="Recent logs"
          viewAll={{ href: `${base}/containerlogs`, label: "Open logs" }}
        />
        <LogsPanel
          lines={lines.slice(-50)}
          isConnected={isConnected}
          hasExternalId={!!deployment.externalId}
        />
      </section>*/}
    </div>
  )
}

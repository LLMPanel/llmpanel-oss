"use client"

import { MonitorX, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface MetricsNotAvailableProps {
  deploymentId: string
  status: string
  providerType: string
}

export function MetricsNotAvailable({
  deploymentId,
  status,
  providerType,
}: MetricsNotAvailableProps) {
  const noMetricsProviders: Record<string, string> = {
    vastai: "Vast.ai",
    hotaisle: "Hot Aisle",
    thundercompute: "Thunder Compute",
  }
  const providerLabel = noMetricsProviders[providerType]
  const isNotRunning = status !== "running"

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <MonitorX className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          GPU Metrics Not Available
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          {isNotRunning
            ? "Deployment is not running. Start the deployment to view GPU metrics."
            : providerLabel
              ? `${providerLabel} does not expose GPU metrics through their API. Metrics are available for self-hosted (Docker) and RunPod deployments.`
              : "Unable to retrieve GPU metrics from the deployment."}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/dashboard/deployments/${deploymentId}`}>
          <ArrowLeft className="mr-1.5 size-3.5" />
          Back to Deployment
        </Link>
      </Button>
    </div>
  )
}

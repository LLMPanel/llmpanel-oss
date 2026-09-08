"use client"

import { useState } from "react"
import {
  Square,
  RotateCcw,
  Loader2,
  Cpu,
  Clock,
  DollarSign,
  Layers,
  BarChart3,
  Database,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "./status-badge"
import type { Deployment } from "@/hooks/use-deployments"

interface DeploymentHeaderProps {
  deployment: Deployment
  status: string
  onRefetch: () => void
}

export function DeploymentHeader({
  deployment,
  status,
  onRefetch,
}: DeploymentHeaderProps) {
  const [isActioning, setIsActioning] = useState(false)

  const handleStop = async () => {
    if (!confirm("Stop this deployment?")) return
    setIsActioning(true)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deployment.id}`,
        { method: "DELETE", credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to stop deployment")
      toast.success("Deployment stopped")
      onRefetch()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to stop deployment"
      )
    } finally {
      setIsActioning(false)
    }
  }

  const handleRestart = async () => {
    setIsActioning(true)
    try {
      const res = await globalThis.fetch(
        `/api/v1/deployments/${deployment.id}/restart`,
        { method: "POST", credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to restart deployment")
      toast.success("Deployment restarting...")
      onRefetch()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to restart deployment"
      )
    } finally {
      setIsActioning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">
              {deployment.huggingfaceId}
            </h1>
            <StatusBadge status={status} large />
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {deployment.huggingfaceId}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "running" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/dashboard/deployments/${deployment.id}/metrics`}>
                  <BarChart3 className="size-3.5" />
                  GPU Metrics
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/dashboard/deployments/${deployment.id}/rag`}>
                  <Database className="size-3.5" />
                  RAG
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStop()}
                disabled={isActioning}
                className="gap-1.5"
              >
                {isActioning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Square className="size-3.5" />
                )}
                Stop
              </Button>
            </>
          )}
          {(status === "stopped" || status === "failed") && (
            <Button
              size="sm"
              onClick={() => void handleRestart()}
              disabled={isActioning}
              className="gap-1.5"
            >
              {isActioning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Restart
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Info chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="secondary"
          className="gap-1.5 text-[11px] px-2.5 py-1 font-normal"
        >
          <Cpu className="size-3" />
          {deployment.gpuType}
        </Badge>
        <Badge
          variant="secondary"
          className="text-[11px] px-2.5 py-1 font-mono uppercase tracking-wide font-normal"
        >
          {deployment.quantization}
        </Badge>
        <Badge
          variant="secondary"
          className="gap-1.5 text-[11px] px-2.5 py-1 font-normal"
        >
          <Layers className="size-3" />
          {deployment.inferenceEngine.toUpperCase()}
        </Badge>
        {deployment.runningFor && (
          <Badge
            variant="secondary"
            className="gap-1.5 text-[11px] px-2.5 py-1 font-normal"
          >
            <Clock className="size-3" />
            {deployment.runningFor}
          </Badge>
        )}
        {deployment.costPerHour != null && (
          <Badge
            variant="secondary"
            className="gap-1.5 text-[11px] px-2.5 py-1 font-mono font-normal"
          >
            <DollarSign className="size-3" />$
            {deployment.costPerHour.toFixed(2)}/hr
          </Badge>
        )}
      </div>
    </div>
  )
}

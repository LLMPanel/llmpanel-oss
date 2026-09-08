"use client"

import { useState } from "react"
import {
  Square,
  RotateCcw,
  Loader2,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { StatusBadge } from "./status-badge"
import type { Deployment } from "@/hooks/use-deployments"

interface DeploymentTopBarProps {
  deployment: Deployment
  status: string
  endpoint: string | null
  onRefetch: () => void
}

export function DeploymentTopBar({
  deployment,
  status,
  endpoint,
  onRefetch,
}: DeploymentTopBarProps) {
  const [isActioning, setIsActioning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)

  const title = deployment.model?.name ?? deployment.huggingfaceId

  const handleStop = async () => {
    setStopConfirmOpen(false)
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
      toast.error(e instanceof Error ? e.message : "Failed to stop deployment")
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
      toast.error(e instanceof Error ? e.message : "Failed to restart deployment")
    } finally {
      setIsActioning(false)
    }
  }

  const handleCopy = () => {
    if (!endpoint) return
    void navigator.clipboard.writeText(endpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b bg-background/80 backdrop-blur-sm">
      {/* Identity + actions row */}
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <SidebarTrigger className="-ml-1 shrink-0" />

        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            {title}
          </h1>
          <StatusBadge status={status} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Endpoint copy pill — running only */}
          {status === "running" && endpoint && (
            <button
              onClick={handleCopy}
              title={endpoint}
              className={cn(
                "hidden items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5",
                "text-xs font-mono text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
              )}
            >
              <span className="max-w-[220px] truncate">{endpoint}</span>
              {copied ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : (
                <Copy className="size-3.5 shrink-0" />
              )}
            </button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={onRefetch}
            className="size-8 shrink-0"
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>

          {status === "running" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStopConfirmOpen(true)}
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

      {/* Spec line — same vocabulary as the deployment card in the grid: mono
          technical values separated by hairline slashes, no pills, no icons. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 pb-2.5 font-mono text-[11px] leading-none text-muted-foreground sm:px-6">
        <span className="truncate text-muted-foreground/80">
          {deployment.huggingfaceId}
        </span>
        <Dot />
        <span className="uppercase">{deployment.gpuType}</span>
        <Sep />
        <span className="uppercase">{deployment.quantization}</span>
        <Sep />
        <span className="uppercase">{deployment.inferenceEngine}</span>
        {deployment.runningFor && (
          <>
            <Dot />
            <span className="whitespace-nowrap tabular-nums">
              {deployment.runningFor}
            </span>
          </>
        )}
        {deployment.costPerHour != null && (
          <>
            <Dot />
            <span className="tabular-nums text-foreground/65">
              ${deployment.costPerHour.toFixed(2)}/hr
            </span>
          </>
        )}
      </div>

      <Dialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Stop deployment?</DialogTitle>
            <DialogDescription>
              {title} will stop serving requests. You can restart it at any
              time — the model stays configured.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStopConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleStop()}
              className="gap-1.5"
            >
              <Square className="size-3.5" />
              Stop deployment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}

/** Inside the hardware triple: GPU / quantization / engine. */
function Sep() {
  return <span className="text-muted-foreground/40">/</span>
}

/** Between groups: identity · hardware · uptime · price. */
function Dot() {
  return <span className="px-0.5 text-muted-foreground/40">·</span>
}

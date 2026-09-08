"use client"

import { useState } from "react"
import { Loader2, Pause, Play, RotateCcw, Rocket } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import type { Deployment } from "@/hooks/use-deployments"
import { providerLabel } from "@/lib/provider-registry"

const TRANSITIONING = ["provisioning", "downloading", "loading", "health_check"]

interface StatusMeta {
  label: string
  dotClass: string
  pulse?: boolean
}

function statusMeta(deployment: Deployment): StatusMeta {
  const { status, externalId } = deployment
  if (status === "running")
    return { label: "Running", dotClass: "bg-success" }
  if (status === "failed") return { label: "Failed", dotClass: "bg-destructive" }
  if (status === "stopped")
    return externalId
      ? { label: "Paused", dotClass: "bg-warning" }
      : { label: "Stopped", dotClass: "bg-muted-foreground/50" }
  const labels: Record<string, string> = {
    provisioning: "Provisioning",
    downloading: "Downloading model",
    loading: "Loading model",
    health_check: "Health check",
  }
  return {
    label: labels[status] ?? status,
    dotClass: "bg-primary",
    pulse: true,
  }
}

function MetaItem({
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 px-5 py-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] tabular-nums">{children}</p>
    </div>
  )
}

const PILL = "h-8 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.96]"

type LifecycleAction = "pause" | "resume" | "restart"

interface SettingsLifecycleCardProps {
  deployment: Deployment
  deploymentId: string
  onChanged: () => void | Promise<void>
}

export function SettingsLifecycleCard({
  deployment,
  deploymentId,
  onChanged,
}: SettingsLifecycleCardProps) {
  const [pending, setPending] = useState<LifecycleAction | null>(null)
  const [confirming, setConfirming] = useState<"pause" | "restart" | null>(null)

  const meta = statusMeta(deployment)
  const isTransitioning = TRANSITIONING.includes(deployment.status)
  const isRunning = deployment.status === "running"
  const isPaused = deployment.status === "stopped" && !!deployment.externalId
  const isDown =
    (deployment.status === "stopped" && !deployment.externalId) ||
    deployment.status === "failed"

  const run = async (action: LifecycleAction) => {
    setPending(action)
    try {
      const path =
        action === "pause"
          ? `/api/v1/deployments/${deploymentId}/stop`
          : `/api/v1/deployments/${deploymentId}/restart`
      const res = await globalThis.fetch(path, {
        method: "POST",
        credentials: "include",
      })
      const data = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      if (!res.ok) throw new Error(data?.error ?? `Failed to ${action}`)

      toast.success(
        action === "pause"
          ? "Pod paused — GPU billing stopped"
          : action === "resume"
            ? "Resuming pod..."
            : "Restarting pod..."
      )
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${action}`)
    } finally {
      setPending(null)
      setConfirming(null)
    }
  }

  const providerName = providerLabel(deployment.providerType)

  return (
    <>
      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {/* Status + meta cells */}
        <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.05] sm:grid-cols-4 sm:divide-y-0 dark:divide-white/[0.06] [&>*:nth-child(-n+2)]:border-t-0">
          <MetaItem label="Status">
            <span className="flex items-center gap-2">
              <span className="relative flex size-2 shrink-0">
                {meta.pulse && (
                  <span
                    className={cn(
                      "absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden",
                      meta.dotClass
                    )}
                  />
                )}
                <span className={cn("relative inline-flex size-2 rounded-full", meta.dotClass)} />
              </span>
              {meta.label}
            </span>
          </MetaItem>
          <MetaItem label="Provider">{providerName}</MetaItem>
          <MetaItem label="Cost">
            {deployment.costPerHour != null ? `$${deployment.costPerHour.toFixed(3)}/hr` : "—"}
          </MetaItem>
          <MetaItem label="Uptime">{deployment.runningFor ?? "—"}</MetaItem>
        </div>

        {isTransitioning && (
          <div className="flex items-center gap-2.5 px-5 py-3 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            <span>
              {deployment.statusMessage ?? "Deployment is transitioning"} — actions are available once it settles.
            </span>
          </div>
        )}

        {deployment.status === "failed" && deployment.errorMessage && (
          <div className="px-5 py-3 text-[13px] text-muted-foreground">
            <span className="font-medium text-destructive">Last error: </span>
            {deployment.errorMessage}
          </div>
        )}

        {/* Actions + explanation share one row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <p className="max-w-md text-[12px] leading-[1.45] text-muted-foreground">
            {isRunning &&
              "Pausing keeps the pod on the provider so it resumes quickly — disk may still bill. Restart reboots it in place."}
            {isPaused &&
              "The pod still exists on the provider (disk may bill). Resume boots it back up, or terminate below to stop all billing."}
            {isDown &&
              "No pod is allocated. Redeploy provisions a fresh pod with the same configuration."}
            {isTransitioning && "Waiting for the deployment to settle."}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {(isRunning || isTransitioning) && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className={PILL}
                  disabled={pending != null || isTransitioning}
                  onClick={() => setConfirming("pause")}
                >
                  {pending === "pause" ? <Loader2 className="size-3.5 animate-spin" /> : <Pause className="size-3.5" />}
                  Pause
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={PILL}
                  disabled={pending != null || isTransitioning}
                  onClick={() => setConfirming("restart")}
                >
                  {pending === "restart" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  Restart
                </Button>
              </>
            )}

            {isPaused && (
              <Button size="sm" className={PILL} disabled={pending != null} onClick={() => void run("resume")}>
                {pending === "resume" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                Resume
              </Button>
            )}

            {isDown && (
              <Button size="sm" className={PILL} disabled={pending != null} onClick={() => void run("resume")}>
                {pending === "resume" ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
                Redeploy
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Lightweight confirm for service-interrupting actions */}
      <Dialog
        open={confirming != null}
        onOpenChange={(o) => {
          if (!o) setConfirming(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em]">
              {confirming === "pause" ? "Pause this pod?" : "Restart this pod?"}
            </DialogTitle>
            <DialogDescription>
              {confirming === "pause"
                ? "The endpoint goes offline and in-flight requests are dropped. GPU billing stops; you can resume anytime."
                : "The pod reboots and the endpoint is briefly unavailable while the model reloads."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirming(null)}
              disabled={pending != null}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-full px-4"
              disabled={pending != null}
              onClick={() => void run(confirming === "pause" ? "pause" : "restart")}
            >
              {pending != null ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : confirming === "pause" ? (
                <Pause className="size-3.5" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              {confirming === "pause" ? "Pause pod" : "Restart pod"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

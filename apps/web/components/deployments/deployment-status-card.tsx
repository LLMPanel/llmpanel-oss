import { Card } from "@/components/ui/card"
import { IN_PROGRESS_STATUSES, statusLabel } from "./status-badge"
import { cn } from "@/lib/utils"

interface DeploymentStatusCardProps {
  status: string
  progress: number
  statusMessage: string
  errorMessage: string | null
}

/**
 * The state of a deployment that isn't serving yet. The top bar already carries
 * the status badge, so this card doesn't repeat it — it carries the detail the
 * badge can't: how far along, or what went wrong.
 */
export function DeploymentStatusCard({
  status,
  progress,
  statusMessage,
  errorMessage,
}: DeploymentStatusCardProps) {
  if (status === "running") return null

  const isInProgress = IN_PROGRESS_STATUSES.has(status)

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="px-5 py-4">
        {isInProgress ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-foreground/75">
                {statusMessage || `${statusLabel(status)}…`}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">
                {progress}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-[3px] overflow-hidden rounded-full bg-border"
            >
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-[width] duration-700",
                  "[transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
                  "motion-reduce:transition-none"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : status === "failed" && errorMessage ? (
          <p className="border-l-2 border-destructive/35 pl-3 text-[13px] leading-relaxed text-destructive/90">
            {errorMessage}
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {status === "stopped"
              ? "This deployment is stopped and isn't serving requests. Restart it from the top bar — the model stays configured."
              : (statusMessage ?? `${statusLabel(status)}…`)}
          </p>
        )}
      </div>
    </Card>
  )
}

import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react"
import { useDeploymentStatus } from "@/hooks/use-deployment-status"

const STAGES = [
  { key: "provisioning", label: "Setting up infrastructure" },
  { key: "downloading", label: "Downloading model weights" },
  { key: "loading", label: "Loading into GPU memory" },
  { key: "health_check", label: "Running health check" },
  { key: "running", label: "Live" },
] as const

const STAGE_ORDER = STAGES.map(s => s.key)

export function DeploymentProgress({ deploymentId }: { deploymentId: string }) {
  const { status, progress, message, endpoint } = useDeploymentStatus(deploymentId)

  const currentIndex = (STAGE_ORDER as readonly string[]).indexOf(status)

  return (
    <div className="space-y-4 p-6 border rounded-lg">
      <p className="text-sm text-muted-foreground">{message}</p>

      {/* Progress is one continuous pipeline bar (provisioning → health
          check); it only reaches 100% when the model is actually live. */}
      {currentIndex >= 0 && status !== "running" && status !== "failed" && (
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="space-y-3">
        {STAGES.map((stage, index) => {
          const isDone = currentIndex > index
          const isCurrent = currentIndex === index
          const isPending = currentIndex < index

          return (
            <div key={stage.key} className="flex items-center gap-3">
              {isDone && <CheckCircle className="h-5 w-5 text-success" />}
              {isCurrent && status !== "failed" && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
              {isCurrent && status === "failed" && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {isPending && <Circle className="h-5 w-5 text-muted-foreground" />}
              <span className={isPending ? "text-muted-foreground" : ""}>{stage.label}</span>
            </div>
          )
        })}
      </div>

      {status === "running" && endpoint && (
        <div className="mt-4 rounded-lg border border-success/25 bg-success/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle className="size-4 shrink-0" />
            Model is Live
          </p>
          <p className="mt-1 font-mono text-sm text-success">{endpoint}</p>
        </div>
      )}
    </div>
  )
}
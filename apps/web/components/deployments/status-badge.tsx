import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusVariant = "success" | "blue" | "destructive" | "secondary" | "warning"

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: StatusVariant; animated?: boolean }
> = {
  running: { label: "Running", variant: "success" },
  provisioning: { label: "Provisioning", variant: "blue", animated: true },
  downloading: { label: "Downloading", variant: "blue", animated: true },
  loading: { label: "Loading", variant: "blue", animated: true },
  health_check: { label: "Health check", variant: "blue", animated: true },
  failed: { label: "Failed", variant: "destructive" },
  stopped: { label: "Stopped", variant: "secondary" },
}

/** Human label for a deployment status, shared with the card's inline status dot. */
export function statusLabel(status: string) {
  return STATUS_CONFIG[status]?.label ?? status
}

export const IN_PROGRESS_STATUSES = new Set([
  "provisioning",
  "downloading",
  "loading",
  "health_check",
])

export function StatusBadge({
  status,
  large,
}: {
  status: string
  large?: boolean
}) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "secondary" as const,
  }
  return (
    <Badge
      variant={cfg.variant}
      className={cn(
        "gap-1.5",
        large ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0.5"
      )}
    >
      {cfg.animated && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {cfg.label}
    </Badge>
  )
}

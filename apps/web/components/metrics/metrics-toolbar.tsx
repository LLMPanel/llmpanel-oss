"use client"

// Right-side toolbar for the metrics page header: live/paused indicator and
// the history window selector (absorbed the old window-selector.tsx).
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MetricsView } from "@/hooks/use-deployment-metrics"
import type { MetricsWindow } from "@/hooks/use-metrics-history"

const WINDOWS: MetricsWindow[] = ["1h", "6h", "24h"]

function LiveIndicator({ view }: { view: MetricsView }) {
  if (view === "live") {
    return (
      <Badge variant="success" className="gap-1.5">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        Live · 5s
      </Badge>
    )
  }
  if (view === "starting") {
    return (
      <Badge variant="warning" className="gap-1.5">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        Waiting for data
      </Badge>
    )
  }
  if (view === "history-only") {
    return <Badge variant="secondary">Paused</Badge>
  }
  return null
}

export function MetricsToolbar({
  view,
  window,
  onWindowChange,
}: {
  view: MetricsView
  window: MetricsWindow
  onWindowChange: (w: MetricsWindow) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LiveIndicator view={view} />
      <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => onWindowChange(w)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              window === w
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  )
}

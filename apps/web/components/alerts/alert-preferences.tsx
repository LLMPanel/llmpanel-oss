"use client"

import { Switch } from "@/components/ui/switch"
import type { AlertEvent } from "@/hooks/use-alerts"

const ALL_EVENTS: Array<{
  id: AlertEvent
  label: string
  description: string
  dotClass: string
}> = [
  {
    id: "deployment.started",
    label: "Deployment started",
    description: "When provisioning begins",
    dotClass: "bg-primary",
  },
  {
    id: "deployment.running",
    label: "Deployment running",
    description: "When the model goes live",
    dotClass: "bg-success",
  },
  {
    id: "deployment.failed",
    label: "Deployment failed",
    description: "When an error occurs",
    dotClass: "bg-destructive",
  },
  {
    id: "deployment.stopped",
    label: "Deployment stopped",
    description: "When manually stopped",
    dotClass: "bg-muted-foreground",
  },
]

interface AlertPreferencesProps {
  enabledEvents: Set<AlertEvent>
  onToggle: (event: AlertEvent) => void
  disabled?: boolean
}

export function AlertPreferences({
  enabledEvents,
  onToggle,
  disabled,
}: AlertPreferencesProps) {
  return (
    <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
      {ALL_EVENTS.map((event) => (
        <div
          key={event.id}
          className={[
            "flex items-center justify-between gap-4 px-5 py-3 transition-opacity",
            disabled ? "opacity-50" : "",
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            <span className={["size-2 shrink-0 rounded-full", event.dotClass].join(" ")} />
            <div>
              <p className="text-[14px]">{event.label}</p>
              <p className="text-[12px] text-muted-foreground">{event.description}</p>
            </div>
          </div>
          <Switch
            checked={enabledEvents.has(event.id)}
            onCheckedChange={() => onToggle(event.id)}
            disabled={disabled}
            aria-label={event.label}
          />
        </div>
      ))}
    </div>
  )
}

"use client"

import { Badge } from "@/components/ui/badge"
import { Cpu, Clock, DollarSign, Globe, MapPin } from "lucide-react"
import type { InstanceWithProvider } from "@/hooks/use-all-instances"
import { cn } from "@/lib/utils"
import { ProviderBadge } from "./provider-badge"

function formatUptime(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return `${h}h${m > 0 ? ` ${m}m` : ""}`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase()
  const isRunning = ["running", "online"].includes(s)
  const isError = ["error", "failed", "exited"].includes(s)

  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full",
          isRunning
            ? "bg-success animate-pulse"
            : isError
              ? "bg-destructive"
              : "bg-warning"
        )}
      />
      <span className="text-xs capitalize">{status}</span>
    </span>
  )
}

export function RunningInstancesTable({
  instances,
}: {
  instances: InstanceWithProvider[]
}) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Cpu className="size-8 mb-2 opacity-30" />
        <p className="text-sm font-medium text-foreground">No running instances</p>
        <p className="text-[13px] mt-1">
          Deploy a model or rent a machine to see it here
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left font-medium">Instance</th>
            <th className="px-4 py-2.5 text-left font-medium">Provider</th>
            <th className="px-4 py-2.5 text-left font-medium">GPU</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Cost/hr</th>
            <th className="px-4 py-2.5 text-left font-medium">Uptime</th>
            <th className="px-4 py-2.5 text-left font-medium">IP</th>
            <th className="px-4 py-2.5 text-left font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => (
            <tr
              key={`${inst.providerType}-${inst.id}`}
              className="border-b last:border-0 hover:bg-muted/20 transition-colors"
            >
              {/* Name */}
              <td className="px-4 py-3">
                <p className="font-medium truncate max-w-[160px]">
                  {inst.name}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {inst.id.length > 12 ? `${inst.id.slice(0, 12)}...` : inst.id}
                </p>
              </td>

              {/* Provider */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <ProviderBadge type={inst.providerType} />
                </div>
              </td>

              {/* GPU */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{inst.gpuName}</span>
                  {inst.gpuCount > 1 && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 py-0"
                    >
                      x{inst.gpuCount}
                    </Badge>
                  )}
                </div>
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <StatusDot status={inst.status} />
              </td>

              {/* Cost */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 text-xs">
                  <DollarSign className="size-3 text-muted-foreground" />
                  <span className="font-medium tabular-nums">
                    {inst.costPerHour.toFixed(3)}
                  </span>
                </div>
              </td>

              {/* Uptime */}
              <td className="px-4 py-3">
                {inst.uptimeMinutes != null ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatUptime(inst.uptimeMinutes)}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>

              {/* IP */}
              <td className="px-4 py-3">
                {inst.publicIp ? (
                  <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    <Globe className="size-3 shrink-0" />
                    {inst.publicIp}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>

              {/* Location */}
              <td className="px-4 py-3">
                {inst.datacenter ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    {inst.datacenter}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { Cpu, Clock, Globe, MapPin, Server } from "lucide-react"
import type { ProviderInstance } from "@/hooks/use-provider-stats"
import { cn } from "@/lib/utils"

function formatUptime(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const isRunning = ["running", "online"].includes(s)
  const isError = ["error", "failed", "exited", "terminated"].includes(s)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        isRunning
          ? "bg-success/10 text-success ring-success/25"
          : isError
            ? "bg-destructive/10 text-destructive ring-destructive/20"
            : "bg-warning/12 text-warning ring-warning/30",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isRunning
            ? "bg-success animate-pulse"
            : isError
              ? "bg-destructive"
              : "bg-warning",
        )}
      />
      <span className="capitalize">{status}</span>
    </span>
  )
}

const TH = "px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
const TD = "px-4 py-3 align-middle"

export function InstanceTable({ instances }: { instances: ProviderInstance[] }) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Server className="size-4.5" />
        </span>
        <p className="text-sm font-medium">No active instances</p>
        <p className="max-w-xs text-xs text-muted-foreground text-pretty">
          Instances launched on this provider will appear here with their live
          GPU, cost, and uptime.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className={TH}>Instance</th>
            <th className={TH}>GPU</th>
            <th className={TH}>Status</th>
            <th className={cn(TH, "text-right")}>Cost/hr</th>
            <th className={TH}>Uptime</th>
            <th className={TH}>IP</th>
            <th className={TH}>Location</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => (
            <tr
              key={inst.id}
              className="border-b last:border-0 transition-colors hover:bg-muted/40"
            >
              <td className={TD}>
                <p className="max-w-[180px] truncate font-medium">{inst.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {inst.id.length > 14 ? `${inst.id.slice(0, 14)}…` : inst.id}
                </p>
              </td>

              <td className={TD}>
                <div className="flex items-center gap-1.5">
                  <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{inst.gpuName}</span>
                  {inst.gpuCount > 1 && (
                    <span className="rounded bg-secondary px-1 py-0.5 text-[10px] font-semibold tabular-nums text-secondary-foreground">
                      ×{inst.gpuCount}
                    </span>
                  )}
                </div>
              </td>

              <td className={TD}>
                <StatusPill status={inst.status} />
              </td>

              <td className={cn(TD, "text-right")}>
                <span className="font-mono text-xs tabular-nums">
                  ${inst.costPerHour.toFixed(3)}
                </span>
              </td>

              <td className={TD}>
                {inst.uptimeMinutes != null ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    <span className="tabular-nums">{formatUptime(inst.uptimeMinutes)}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>

              <td className={TD}>
                {inst.publicIp ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" />
                    {inst.publicIp}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>

              <td className={TD}>
                {inst.datacenter ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="max-w-[140px] truncate">{inst.datacenter}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

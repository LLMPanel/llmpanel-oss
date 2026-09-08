import { Cpu, Thermometer, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricBar } from "./metric-bar"
import type { GpuMetrics } from "@/hooks/use-gpu-metrics"

interface GpuMetricsCardProps {
  metrics: GpuMetrics
}

export function GpuMetricsCard({ metrics }: GpuMetricsCardProps) {
  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Cpu className="size-4 text-primary" />
          </div>
          <CardTitle className="text-sm">GPU Metrics</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-5">
        <MetricBar
          label="GPU Utilization"
          value={metrics.gpuUtilization}
          max={100}
          unit="%"
        />
        <MetricBar
          label="VRAM Usage"
          value={metrics.vramUsedGb}
          max={metrics.vramTotalGb}
          unit=" GB"
          colorClass="bg-primary"
        />

        {/* Bottom stats row */}
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/30 border px-4 py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="size-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Req/min
              </span>
            </div>
            <p className="text-sm font-bold tabular-nums">
              {metrics.requestsPerMinute.toFixed(1)}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {metrics.temperatureCelsius != null ? (
                <Thermometer className="size-3" />
              ) : (
                <Cpu className="size-3" />
              )}
              <span className="text-[10px] font-medium uppercase tracking-wider">
                {metrics.temperatureCelsius != null ? "Temp" : "CPU"}
              </span>
            </div>
            <p className="text-sm font-bold tabular-nums">
              {metrics.temperatureCelsius != null
                ? `${Math.round(metrics.temperatureCelsius)}°C`
                : metrics.containerCpuPercent != null
                  ? `${Math.round(metrics.containerCpuPercent)}%`
                  : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="size-3" />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                Latency
              </span>
            </div>
            <p className="text-sm font-bold tabular-nums">
              {metrics.averageLatencyMs.toFixed(0)}ms
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

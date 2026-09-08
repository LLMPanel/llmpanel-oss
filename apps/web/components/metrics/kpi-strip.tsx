"use client"

// Adaptive KPI card row for the metrics page. With live metrics it shows the
// current values; when the deployment is stopped it falls back to the most
// recent recorded history bucket, visually marked as last-known. Cards render
// only when the provider can report the metric AND a value is present —
// unsupported metrics are absent, never zeros or "N/A".
import {
  Gauge,
  MemoryStick,
  Thermometer,
  Zap,
  Cpu,
  Server,
  Clock,
  DollarSign,
  History,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { GpuMetrics, MetricsCapabilities } from "@/hooks/use-gpu-metrics"
import type { MetricsHistoryPoint } from "@/hooks/use-metrics-history"
import { formatTimeLabel, formatUptime } from "@/components/deployments/charts/format"
import { cn } from "@/lib/utils"

function barColor(pct: number): string {
  if (pct > 90) return "bg-destructive"
  if (pct > 70) return "bg-warning"
  return "bg-primary"
}

function tempColor(celsius: number): string | undefined {
  if (celsius > 85) return "text-destructive"
  if (celsius > 70) return "text-warning"
  return undefined
}

interface KpiCardSpec {
  key: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  barPercent?: number
  valueClassName?: string
}

function KpiCard({ card, stale }: { card: KpiCardSpec; stale: boolean }) {
  const Icon = card.icon
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {card.label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-xl font-semibold tabular-nums tracking-tight",
              stale && "text-muted-foreground",
              !stale && card.valueClassName,
            )}
          >
            {card.value}
          </span>
          {card.sub && <span className="text-xs text-muted-foreground">{card.sub}</span>}
        </div>
        {card.barPercent != null && (
          <Progress
            value={Math.min(card.barPercent, 100)}
            className="h-1"
            indicatorClassName={stale ? "bg-muted-foreground/40" : barColor(card.barPercent)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function liveCards(m: GpuMetrics, caps: MetricsCapabilities | null): KpiCardSpec[] {
  const cards: KpiCardSpec[] = []
  if (caps?.gpuUtilization ?? true) {
    cards.push({
      key: "gpu",
      icon: Gauge,
      label: "GPU Utilization",
      value: `${Math.round(m.gpuUtilization)}%`,
      sub: m.gpuCount > 1 ? `avg of ${m.gpuCount} GPUs` : undefined,
      barPercent: m.gpuUtilization,
    })
  }
  if (caps?.vram ?? true) {
    cards.push({
      key: "vram",
      icon: MemoryStick,
      label: "VRAM",
      value: m.vramUsedGb.toFixed(1),
      sub: `/ ${m.vramTotalGb.toFixed(0)} GB`,
      barPercent: m.vramUsedPercent,
    })
  }
  if (caps?.temperature && m.temperatureCelsius != null) {
    cards.push({
      key: "temp",
      icon: Thermometer,
      label: "Temperature",
      value: `${Math.round(m.temperatureCelsius)}°C`,
      valueClassName: tempColor(m.temperatureCelsius),
    })
  }
  if (caps?.power && m.powerDrawWatts != null) {
    cards.push({
      key: "power",
      icon: Zap,
      label: "Power Draw",
      value: `${Math.round(m.powerDrawWatts)} W`,
    })
  }
  if (caps?.container && m.containerCpuPercent != null) {
    cards.push({
      key: "cpu",
      icon: Cpu,
      label: "Container CPU",
      value: `${Math.round(m.containerCpuPercent)}%`,
      barPercent: m.containerCpuPercent,
    })
  }
  if (caps?.container && m.containerMemoryPercent != null) {
    cards.push({
      key: "ram",
      icon: Server,
      label: "Container RAM",
      value: `${Math.round(m.containerMemoryPercent)}%`,
      barPercent: m.containerMemoryPercent,
    })
  }
  if (caps?.uptime && m.uptimeSeconds != null) {
    cards.push({
      key: "uptime",
      icon: Clock,
      label: "Uptime",
      value: formatUptime(m.uptimeSeconds),
    })
  }
  if (caps?.costPerHour && m.costPerHour != null) {
    cards.push({
      key: "cost",
      icon: DollarSign,
      label: "Cost",
      value: `$${m.costPerHour.toFixed(2)}`,
      sub: "/hr",
    })
  }
  return cards
}

function lastKnownCards(p: MetricsHistoryPoint): KpiCardSpec[] {
  const cards: KpiCardSpec[] = []
  if (p.gpuUtilization != null) {
    cards.push({
      key: "gpu",
      icon: Gauge,
      label: "GPU Utilization",
      value: `${Math.round(p.gpuUtilization)}%`,
      barPercent: p.gpuUtilization,
    })
  }
  if (p.vramUsedGb != null && p.vramTotalGb != null) {
    cards.push({
      key: "vram",
      icon: MemoryStick,
      label: "VRAM",
      value: p.vramUsedGb.toFixed(1),
      sub: `/ ${p.vramTotalGb.toFixed(0)} GB`,
      barPercent: p.vramTotalGb > 0 ? (p.vramUsedGb / p.vramTotalGb) * 100 : undefined,
    })
  }
  if (p.temperatureCelsius != null) {
    cards.push({
      key: "temp",
      icon: Thermometer,
      label: "Temperature",
      value: `${Math.round(p.temperatureCelsius)}°C`,
    })
  }
  if (p.powerDrawWatts != null) {
    cards.push({
      key: "power",
      icon: Zap,
      label: "Power Draw",
      value: `${Math.round(p.powerDrawWatts)} W`,
    })
  }
  if (p.containerCpuPercent != null) {
    cards.push({
      key: "cpu",
      icon: Cpu,
      label: "Container CPU",
      value: `${Math.round(p.containerCpuPercent)}%`,
      barPercent: p.containerCpuPercent,
    })
  }
  if (p.containerMemoryPercent != null) {
    cards.push({
      key: "ram",
      icon: Server,
      label: "Container RAM",
      value: `${Math.round(p.containerMemoryPercent)}%`,
      barPercent: p.containerMemoryPercent,
    })
  }
  return cards
}

export function KpiStrip({
  live,
  lastPoint,
  capabilities,
}: {
  live: GpuMetrics | null
  lastPoint: MetricsHistoryPoint | null
  capabilities: MetricsCapabilities | null
}) {
  const stale = live == null
  const cards = live ? liveCards(live, capabilities) : lastPoint ? lastKnownCards(lastPoint) : []
  if (cards.length === 0) return null

  return (
    <div className="space-y-2">
      {stale && lastPoint && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" />
          Last known values · {formatTimeLabel(lastPoint.t)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <KpiCard key={card.key} card={card} stale={stale} />
        ))}
      </div>
    </div>
  )
}

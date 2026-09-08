"use client"

// Per-GPU detail card. Adaptive: rows render only when the provider reports
// the value — RunPod GPUs show utilization/VRAM only, local nvidia-smi GPUs
// show the full sensor set. Null never renders as "N/A" or 0.
import {
  Cpu, MemoryStick, Thermometer, Zap, Gauge, Waves,
  Fan, CircuitBoard, HardDrive, AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type { SingleGpuMetrics } from "@/hooks/use-gpu-metrics"
import { cn } from "@/lib/utils"

interface GpuDeviceCardProps {
  gpu: SingleGpuMetrics
  isMultiGpu: boolean
}

function getUtilColor(pct: number): string {
  if (pct > 90) return "bg-destructive"
  if (pct > 70) return "bg-warning"
  return "bg-primary"
}

function getTempColor(temp: number): string {
  if (temp > 85) return "text-destructive"
  if (temp > 70) return "text-warning"
  return "text-success"
}

function getTempBadge(temp: number): "destructive" | "warning" | "success" {
  if (temp > 85) return "destructive"
  if (temp > 70) return "warning"
  return "success"
}

export function GpuDeviceCard({ gpu, isMultiGpu }: GpuDeviceCardProps) {
  const vramPct = gpu.vramTotalGb > 0
    ? Math.round((gpu.vramUsedGb / gpu.vramTotalGb) * 100)
    : 0
  const powerPct =
    gpu.powerDrawWatts != null && gpu.powerLimitWatts != null && gpu.powerLimitWatts > 0
      ? Math.round((gpu.powerDrawWatts / gpu.powerLimitWatts) * 100)
      : null

  const detailRows: React.ReactNode[] = []
  if (gpu.temperatureCelsius != null) {
    detailRows.push(
      <DetailRow
        key="temp"
        icon={<Thermometer className="size-3" />}
        label="GPU Temp"
        value={`${gpu.temperatureCelsius}°C`}
        className={getTempColor(gpu.temperatureCelsius)}
      />,
    )
  }
  if (gpu.temperatureMemoryCelsius != null) {
    detailRows.push(
      <DetailRow
        key="memtemp"
        icon={<Thermometer className="size-3" />}
        label="Memory Temp"
        value={`${gpu.temperatureMemoryCelsius}°C`}
        className={getTempColor(gpu.temperatureMemoryCelsius)}
      />,
    )
  }
  if (gpu.fanSpeedPercent != null) {
    detailRows.push(
      <DetailRow
        key="fan"
        icon={<Fan className="size-3" />}
        label="Fan Speed"
        value={`${gpu.fanSpeedPercent}%`}
      />,
    )
  }
  detailRows.push(
    <DetailRow
      key="vramfree"
      icon={<MemoryStick className="size-3" />}
      label="VRAM Free"
      value={`${gpu.vramFreeGb.toFixed(1)} GB`}
    />,
  )
  if (gpu.clockGraphicsMhz != null) {
    detailRows.push(
      <DetailRow
        key="gclock"
        icon={<CircuitBoard className="size-3" />}
        label="Graphics Clock"
        value={`${gpu.clockGraphicsMhz} MHz`}
      />,
    )
  }
  if (gpu.clockMemoryMhz != null) {
    detailRows.push(
      <DetailRow
        key="mclock"
        icon={<CircuitBoard className="size-3" />}
        label="Memory Clock"
        value={`${gpu.clockMemoryMhz} MHz`}
      />,
    )
  }
  if (gpu.clockSmMhz != null) {
    detailRows.push(
      <DetailRow
        key="smclock"
        icon={<CircuitBoard className="size-3" />}
        label="SM Clock"
        value={`${gpu.clockSmMhz} MHz`}
      />,
    )
  }
  if (gpu.pcieGen != null && gpu.pcieLinkWidth != null) {
    detailRows.push(
      <DetailRow
        key="pcie"
        icon={<HardDrive className="size-3" />}
        label="PCIe"
        value={`Gen${gpu.pcieGen} x${gpu.pcieLinkWidth}`}
      />,
    )
  }
  if (gpu.eccErrors != null) {
    detailRows.push(
      <DetailRow
        key="ecc"
        icon={<AlertTriangle className="size-3" />}
        label="ECC Errors"
        value={`${gpu.eccErrors}`}
        className={gpu.eccErrors > 0 ? "text-destructive" : undefined}
      />,
    )
  }

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Cpu className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                {gpu.name}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground font-mono">
                {isMultiGpu ? `GPU ${gpu.index}` : "Primary GPU"}
                {gpu.uuid ? ` · ${gpu.uuid.slice(0, 12)}…` : ""}
              </p>
            </div>
          </div>
          {gpu.temperatureCelsius != null && (
            <Badge variant={getTempBadge(gpu.temperatureCelsius)}>
              {gpu.temperatureCelsius}°C
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-5">
        {/* Utilization bars */}
        <div className="space-y-4">
          <MetricProgress
            icon={<Gauge className="size-3.5" />}
            label="GPU Utilization"
            value={gpu.gpuUtilization}
            max={100}
            unit="%"
            color={getUtilColor(gpu.gpuUtilization)}
          />
          <MetricProgress
            icon={<MemoryStick className="size-3.5" />}
            label="VRAM Usage"
            value={gpu.vramUsedGb}
            max={gpu.vramTotalGb}
            unit=" GB"
            pctOverride={vramPct}
            color={getUtilColor(vramPct)}
          />
          <MetricProgress
            icon={<Waves className="size-3.5" />}
            label="Memory Bandwidth"
            value={gpu.memoryUtilization}
            max={100}
            unit="%"
            color={getUtilColor(gpu.memoryUtilization)}
          />
          {gpu.powerDrawWatts != null && gpu.powerLimitWatts != null && powerPct != null && (
            <MetricProgress
              icon={<Zap className="size-3.5" />}
              label="Power Draw"
              value={gpu.powerDrawWatts}
              max={gpu.powerLimitWatts}
              unit=" W"
              pctOverride={powerPct}
              color={powerPct > 90 ? "bg-destructive" : powerPct > 75 ? "bg-warning" : "bg-chart-5"}
            />
          )}
        </div>

        {detailRows.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">{detailRows}</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Sub-components ─────────────────────────────────────────────── */

function MetricProgress({
  icon,
  label,
  value,
  max,
  unit,
  color,
  pctOverride,
}: {
  icon: React.ReactNode
  label: string
  value: number
  max: number
  unit: string
  color: string
  pctOverride?: number
}) {
  const pct = pctOverride ?? (max > 0 ? Math.min((value / max) * 100, 100) : 0)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          {icon}
          {label}
        </span>
        <span className="font-semibold tabular-nums">
          {value.toFixed(1)}{unit}
          {max !== 100 && (
            <span className="text-muted-foreground font-normal">
              {" / "}{max.toFixed(1)}{unit}
            </span>
          )}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" indicatorClassName={color} />
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("text-[11px] font-semibold tabular-nums", className)}>
        {value}
      </span>
    </div>
  )
}

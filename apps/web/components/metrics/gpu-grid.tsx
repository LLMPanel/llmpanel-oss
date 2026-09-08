"use client"

// Per-GPU device cards section — full nvidia-smi detail per GPU, live only.
import type { SingleGpuMetrics } from "@/hooks/use-gpu-metrics"
import { GpuDeviceCard } from "./gpu-device-card"

export function GpuGrid({ gpus }: { gpus: SingleGpuMetrics[] }) {
  if (gpus.length === 0) return null
  const isMultiGpu = gpus.length > 1

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {isMultiGpu ? `GPU Devices (${gpus.length})` : "GPU Device"}
      </h2>
      <div className={isMultiGpu ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : ""}>
        {gpus.map((gpu) => (
          <GpuDeviceCard key={gpu.index} gpu={gpu} isMultiGpu={isMultiGpu} />
        ))}
      </div>
    </div>
  )
}

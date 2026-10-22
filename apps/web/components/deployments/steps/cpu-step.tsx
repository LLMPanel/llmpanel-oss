"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { AlertTriangle, ArrowRight, CircleCheck } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { HostCpu } from "@/hooks/use-system-gpu"
import { stepContainer, stepItem } from "./motion"

/** MB → GB at one decimal — the same rounding the API applies to its fit check. */
function mbToGb1(mb: number): number {
  return Math.round((mb / 1024) * 10) / 10
}

/** Whether a model needing `requiredRamGb` fits in the host's free RAM. */
export function cpuRamFits(host: HostCpu, requiredRamGb: number): boolean {
  return requiredRamGb > 0 && requiredRamGb <= mbToGb1(host.availableRamMb)
}

interface CpuStepProps {
  host: HostCpu
  /** RAM the selected model needs on the CPU, in GB. */
  requiredRamGb: number
}

/**
 * Step 3 on a host with no GPU: the model runs on the CPU through llama.cpp,
 * so there is nothing to pick — this step shows whether the model fits.
 */
export function CpuStep({ host, requiredRamGb }: CpuStepProps) {
  const availableGb = mbToGb1(host.availableRamMb)
  const fits = cpuRamFits(host, requiredRamGb)
  const fitPct = availableGb > 0 ? Math.min((requiredRamGb / availableGb) * 100, 100) : 100

  const tiles = [
    { label: "CPU cores", value: String(host.cores) },
    { label: "Total RAM", value: `${mbToGb1(host.totalRamMb)} GB` },
    { label: "Free RAM", value: `${availableGb} GB` },
  ]

  return (
    <motion.div variants={stepContainer} initial="hidden" animate="show" className="space-y-3.5">
      <motion.div variants={stepItem}>
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This host&apos;s CPU
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
          No GPU on this host, so the model runs on the CPU with llama.cpp.
        </p>
      </motion.div>

      <motion.dl variants={stepItem} className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border p-3">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.div
        variants={stepItem}
        className={cn(
          "space-y-2 rounded-xl border p-3",
          fits ? "border-success/25 bg-success/5" : "border-destructive/25 bg-destructive/5"
        )}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            {fits ? (
              <CircleCheck className="size-4 text-success" />
            ) : (
              <AlertTriangle className="size-4 text-destructive" />
            )}
            RAM fit
          </span>
          <span className={cn("tabular-nums", fits ? "text-success" : "text-destructive")}>
            {requiredRamGb} / {availableGb} GB free
          </span>
        </div>
        <Progress value={fitPct} />
        {!fits && (
          <p className="text-xs text-destructive text-pretty">
            Not enough free RAM for this model. Pick a smaller one, or stop another deployment on
            this host.
          </p>
        )}
      </motion.div>

      <motion.p variants={stepItem} className="text-xs text-muted-foreground text-pretty">
        CPU inference is much slower than a GPU — small models are the practical choice.{" "}
        <Link
          href="/dashboard/providers"
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2"
        >
          Add a cloud GPU provider <ArrowRight className="size-3" />
        </Link>
      </motion.p>
    </motion.div>
  )
}

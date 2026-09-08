import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentProps<"div"> {
  value?: number
  max?: number
  /** Override track colour class e.g. "bg-green-500" */
  indicatorClassName?: string
}

function Progress({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", indicatorClassName ?? "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }

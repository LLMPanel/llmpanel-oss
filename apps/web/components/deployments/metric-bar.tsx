import { Progress } from "@/components/ui/progress"

interface MetricBarProps {
  label: string
  value: number
  max: number
  unit: string
  colorClass?: string
}

export function MetricBar({
  label,
  value,
  max,
  unit,
  colorClass,
}: MetricBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold tabular-nums">
          {value.toFixed(1)}
          {unit}
          {max !== 100 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              / {max.toFixed(1)}
              {unit}
            </span>
          )}
        </span>
      </div>
      <Progress
        value={pct}
        className="h-2"
        indicatorClassName={
          pct > 90
            ? "bg-destructive"
            : pct > 70
              ? "bg-warning"
              : (colorClass ?? "bg-primary")
        }
      />
    </div>
  )
}

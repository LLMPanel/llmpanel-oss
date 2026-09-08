import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: React.ReactNode
  icon?: React.ReactNode
  trend?: "up" | "down" | "neutral"
  className?: string
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("gap-0 py-0 overflow-hidden", className)}>
      <CardContent className="px-4 py-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          {icon && (
            <span className="text-muted-foreground/60 shrink-0">{icon}</span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold leading-none tracking-tight tabular-nums">
            {value}
          </p>
          {trend && (
            <span
              className={cn(
                "text-[10px] font-medium",
                trend === "up" && "text-success",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trend === "up" ? "+" : trend === "down" ? "-" : ""}
            </span>
          )}
        </div>
        {sub && (
          <div className="text-[11px] text-muted-foreground font-medium">
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

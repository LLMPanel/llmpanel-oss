import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface Metric {
  label: string
  /** Usually a string; a node lets a cell de-emphasise part of the number,
   *  e.g. the "/12" in "3/12". */
  value: React.ReactNode
  /** Small trailing unit — "req/min", "tok/sec". Kept out of the number so the
   *  values stay optically aligned down the column. */
  unit?: string
  /** Optional second line for context ("0 ok · 0 err", "24h"). */
  sub?: React.ReactNode
  /** Colour is reserved for values that mean something — an error rate that has
   *  crossed a threshold, not "this is the fourth tile". */
  tone?: "default" | "destructive" | "success"
  /** Leading status dot, same vocabulary as the deployment card's header dot.
   *  Only for cells whose label names a state; pass "muted" to stand a state
   *  down when its count is zero. */
  dot?: "success" | "primary" | "destructive" | "muted"
}

const DOT_TONE: Record<NonNullable<Metric["dot"]>, string> = {
  success: "bg-success",
  primary: "bg-primary",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/40",
}

/**
 * A row of related numbers rendered as ONE instrument, not N cards: a single
 * surface divided by hairlines. Each cell is label-over-value with no icon and
 * no per-cell colour, so the eye reads the numbers rather than the decoration.
 *
 * The lattice comes from per-cell top/left borders pulled under the card's own
 * border by the negative offsets, which keeps it correct at any wrap count
 * without the double-line seams `divide-*` produces on a wrapping grid.
 */
export function MetricStrip({
  metrics,
  loading,
  className,
}: {
  metrics: Metric[]
  /** Swap every value for a skeleton while the numbers are in flight. The
   *  lattice and labels stay put, so nothing moves when they land. */
  loading?: boolean
  className?: string
}) {
  // Reserve the sub line across the whole strip when any cell uses one, so the
  // value baselines stay on a single line rather than stepping per cell.
  const hasSub = metrics.some((m) => m.sub)

  return (
    <Card className={cn("gap-0 overflow-hidden p-0", className)}>
      <div className="-ml-px -mt-px grid grid-cols-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="border-l border-t border-border/60 px-4 py-3.5"
          >
            <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {m.dot && (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    DOT_TONE[m.dot]
                  )}
                />
              )}
              <span className="truncate">{m.label}</span>
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              {loading ? (
                <Skeleton className="h-[19px] w-14" />
              ) : (
                <>
                  <span
                    className={cn(
                      "text-[19px] font-semibold leading-none tracking-[-0.015em] tabular-nums",
                      m.tone === "destructive" && "text-destructive",
                      m.tone === "success" && "text-success"
                    )}
                  >
                    {m.value}
                  </span>
                  {m.unit && (
                    <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                      {m.unit}
                    </span>
                  )}
                </>
              )}
            </p>
            {hasSub && (
              <p className="mt-2 truncate text-[11px] leading-none text-muted-foreground/70">
                {m.sub ?? " "}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

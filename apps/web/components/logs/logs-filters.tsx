"use client"

import { RefreshCw } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import type { LogFilters } from "@/hooks/use-logs"
import { cn } from "@/lib/utils"

export type DatePreset = "1h" | "24h" | "7d" | "30d" | "custom"

const DATE_PRESETS = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "custom", label: "Custom" },
] as const satisfies readonly { value: DatePreset; label: string }[]

type StatusSegment = "all" | "success" | "error"

const STATUS_SEGMENTS = [
  { value: "all", label: "All" },
  { value: "success", label: "2xx" },
  { value: "error", label: "Errors" },
] as const satisfies readonly { value: StatusSegment; label: string }[]

export function presetToRange(preset: DatePreset): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  if (preset === "1h")  from.setHours(from.getHours() - 1)
  if (preset === "24h") from.setDate(from.getDate() - 1)
  if (preset === "7d")  from.setDate(from.getDate() - 7)
  if (preset === "30d") from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString(),
    to:   to.toISOString(),
  }
}

interface LogsFiltersProps {
  filters: LogFilters
  datePreset: DatePreset
  customFrom: string
  customTo: string
  deployments: { id: string; name: string }[]
  onPresetChange: (preset: DatePreset) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onFiltersChange: (partial: Partial<LogFilters>) => void
  onRefresh: () => void
  isLoading: boolean
}

/**
 * Translucent toolbar that floats over the list as it scrolls. Content passes
 * underneath the material; a soft gradient at the bottom edge replaces the
 * usual hard 1px divider.
 */
export function LogsFilters({
  filters,
  datePreset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onFiltersChange,
  onRefresh,
  isLoading,
}: LogsFiltersProps) {
  return (
    <div className="sticky top-0 z-20 -mx-2 px-2">
      <div
        className={cn(
          "rounded-2xl border border-black/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.06]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.4)]",
          "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
          <Field label="Range">
            <SegmentedControl
              label="Time range"
              value={datePreset}
              options={DATE_PRESETS}
              onChange={onPresetChange}
            />
          </Field>

          <Field label="Status">
            <SegmentedControl<StatusSegment>
              label="Status"
              value={filters.status ?? "all"}
              options={STATUS_SEGMENTS}
              onChange={(v) =>
                onFiltersChange({ status: v === "all" ? undefined : v, page: 1 })
              }
            />
          </Field>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
            className={cn(
              "ml-auto inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-muted px-3 text-[12px] font-medium text-foreground select-none",
              "transition-[transform,background-color] duration-100 ease-out hover:bg-accent active:scale-[0.96]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            )}
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Custom range emerges from the toolbar it belongs to and retracts the same way. */}
        <AnimatePresence initial={false}>
          {datePreset === "custom" && (
            <motion.div
              key="custom-range"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
                <Field label="From">
                  <Input
                    type="datetime-local"
                    className="h-8 w-48 rounded-[9px] border-0 bg-muted text-[12px] shadow-none"
                    value={customFrom}
                    onChange={(e) => onCustomFromChange(e.target.value)}
                  />
                </Field>
                <Field label="To">
                  <Input
                    type="datetime-local"
                    className="h-8 w-48 rounded-[9px] border-0 bg-muted text-[12px] shadow-none"
                    value={customTo}
                    onChange={(e) => onCustomToChange(e.target.value)}
                  />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll-edge effect: content fades as it slides under the floating chrome. */}
      <div
        aria-hidden
        className="pointer-events-none h-4 bg-gradient-to-b from-background to-transparent"
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

"use client"

import { useId } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (value: T) => void
  /** Accessible name for the group. */
  label: string
  className?: string
}

/**
 * Apple-style segmented control. The selected pill is a single element that
 * springs between segments (critically damped — a tap carries no momentum,
 * so there's no overshoot). Feedback fires on pointer-down, not on release.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const layoutId = useId()

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-[9px] bg-muted p-[3px]",
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onPointerDown={() => onChange(opt.value)}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative isolate h-full rounded-[7px] px-3 text-[12px] font-medium leading-none whitespace-nowrap select-none",
              "transition-[color,transform] duration-100 ease-out active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[7px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:bg-background dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06)]"
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

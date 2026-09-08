import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default:       "bg-primary/10 text-primary ring-primary/20",
        secondary:     "bg-secondary text-secondary-foreground ring-border",
        outline:       "bg-transparent text-foreground ring-border",
        destructive:   "bg-destructive/10 text-destructive ring-destructive/20",
        success:       "bg-success/10 text-success ring-success/25",
        warning:       "bg-warning/12 text-warning ring-warning/30",
        blue:          "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-800",
        purple:        "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-800",
        teal:          "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:ring-teal-800",
        orange:        "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:ring-orange-800",
        rose:          "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:ring-rose-800",
        emerald:       "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-800",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

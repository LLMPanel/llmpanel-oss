"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

/** Inset-grouped section: sentence-case title + hint above a hairline-ring card. */
export function Panel({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className={cn("flex flex-col space-y-1.5", className)}
    >
      <div className="px-3">
        <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] leading-[1.4] text-muted-foreground/70">{description}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}

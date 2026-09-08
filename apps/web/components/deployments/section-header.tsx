import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  description?: string
  /** Optional deep-link rendered as a "label →" on the right. */
  viewAll?: { href: string; label?: string }
}

export function SectionHeader({
  title,
  description,
  viewAll,
}: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-[11.5px] text-muted-foreground/70">{description}</p>
        )}
      </div>
      {viewAll && (
        <Link
          href={viewAll.href}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground",
            "transition-colors duration-100 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          )}
        >
          {viewAll.label ?? "View all"}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

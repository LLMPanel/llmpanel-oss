import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Right-aligned actions (buttons, selects, links). */
  actions?: React.ReactNode
  className?: string
}

/**
 * Shared header for deployment sub-pages. The deployment name/status lives in
 * the persistent top bar, so sub-pages only describe their own section here.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

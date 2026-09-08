import { cn } from "@/lib/utils"
import type { HttpMethod } from "./endpoints-data"

const STYLES: Record<HttpMethod, string> = {
  GET:    "text-success",
  POST:   "text-primary",
  DELETE: "text-destructive",
}

export function MethodBadge({
  method,
  className,
}: {
  method: HttpMethod
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[11px] font-semibold tracking-[0.04em]",
        STYLES[method],
        className
      )}
    >
      {method}
    </span>
  )
}

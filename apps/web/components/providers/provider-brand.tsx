import type { ReactNode } from "react"
import {
  Server,
  Boxes,
  Flame,
  Zap,
  ShieldCheck,
  Cpu,
  Container,
  Database,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { providerMeta, LOCAL_PROVIDER_META } from "@/lib/provider-registry"

/**
 * Brand marks, keyed by provider type — the one place logos live. Colors and
 * labels come from `lib/provider-registry`; marks are code assets so they stay
 * here. To swap a fallback lucide icon for a real brand SVG, replace its entry
 * with an inline <svg> that forwards `className` (see LambdaMark).
 */
function LambdaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6.5 4H9l8.5 16" />
      <path d="M13.2 11.9 8 20" />
    </svg>
  )
}

const MARKS: Record<string, (props: { className?: string }) => ReactNode> = {
  runpod: (p) => <Server strokeWidth={1.75} {...p} />,
  vastai: (p) => <Boxes strokeWidth={1.75} {...p} />,
  lambdalabs: (p) => <LambdaMark {...p} />,
  tensordock: (p) => <Container strokeWidth={1.75} {...p} />,
  datacrunch: (p) => <Database strokeWidth={1.75} {...p} />,
  hyperstack: (p) => <Layers strokeWidth={1.75} {...p} />,
  hotaisle: (p) => <Flame strokeWidth={1.75} {...p} />,
  thundercompute: (p) => <Zap strokeWidth={1.75} {...p} />,
  local: (p) => <ShieldCheck strokeWidth={1.75} {...p} />,
}

/** The bare logo glyph, colored via `currentColor`. */
export function ProviderMark({ type, className }: { type: string; className?: string }) {
  const render = MARKS[type]
  if (!render) return <Cpu strokeWidth={1.75} className={className} />
  return <>{render({ className })}</>
}

/** Brand-tinted logo tile (rounded square with ring), sized by the caller. */
export function ProviderTile({
  type,
  className,
  markClassName,
  style,
}: {
  type: string
  className?: string
  markClassName?: string
  style?: React.CSSProperties
}) {
  const accent = type === "local" ? LOCAL_PROVIDER_META.accent : providerMeta(type).accent
  return (
    <span
      style={style}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
        accent,
        className,
      )}
    >
      <ProviderMark type={type} className={markClassName ?? "size-5"} />
    </span>
  )
}

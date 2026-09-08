"use client"

import { cn } from "@/lib/utils"
import { MethodBadge } from "./method-badge"
import { ENDPOINTS, CATEGORIES, type Endpoint } from "./endpoints-data"

interface EndpointNavProps {
  activeId: string
  onSelect: (id: string) => void
  /** Endpoint set to show — defaults to the LLM set. */
  endpoints?: Endpoint[]
}

/** Sidebar list of endpoints, grouped by category; the active row lifts as a card. */
export function EndpointNav({ activeId, onSelect, endpoints = ENDPOINTS }: EndpointNavProps) {
  return (
    <nav className="space-y-4">
      {CATEGORIES.map((cat) => {
        const items = endpoints.filter((e) => e.category === cat)
        if (items.length === 0) return null

        return (
          <div key={cat}>
            <p className="mb-1 px-2.5 text-[12px] font-semibold text-muted-foreground">{cat}</p>
            <ul className="space-y-0.5">
              {items.map((endpoint) => {
                const active = activeId === endpoint.id
                return (
                  <li key={endpoint.id}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => onSelect(endpoint.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px]",
                        "transition-[background-color,transform,color] duration-100 active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        active
                          ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06)]"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      )}
                    >
                      <MethodBadge method={endpoint.method} className="w-11 shrink-0 text-[10px]" />
                      <span className="truncate">{endpoint.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

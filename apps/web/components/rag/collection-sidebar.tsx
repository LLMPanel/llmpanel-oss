"use client"

import { motion } from "motion/react"
import { Database, Cloud, Trash2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { RagCollection } from "@/hooks/use-rag"
import { cn } from "@/lib/utils"

interface CollectionSidebarProps {
  collections: RagCollection[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

/** Inset-grouped list of collections; the selected row lifts as a card. */
export function CollectionSidebar({
  collections,
  isLoading,
  selectedId,
  onSelect,
  onDelete,
}: CollectionSidebarProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1 p-2">
      <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold text-muted-foreground">Collections</p>
      {collections.map((col, i) => {
        const active = selectedId === col.id
        const Icon = col.vectorStoreType === "qdrant" ? Cloud : Database
        const agents = col.connectedAgents?.length ?? 0
        return (
          <motion.div
            key={col.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(col.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelect(col.id)
              }
            }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(i, 8) * 0.025 }}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left",
              "transition-[background-color,transform] duration-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              active
                ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.06)]"
                : "hover:bg-background/60"
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{col.name}</p>
              <p className="mt-0.5 truncate text-[12px] tabular-nums text-muted-foreground">
                {col.documentCount} doc{col.documentCount === 1 ? "" : "s"} · {col.totalChunks} chunks
                {agents > 0 && <span className="text-primary"> · {agents} agent{agents === 1 ? "" : "s"}</span>}
              </p>
            </div>
            <div className="flex w-6 shrink-0 justify-center">
              <button
                type="button"
                aria-label={`Delete ${col.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(col.id)
                }}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-[opacity,transform,color] hover:text-destructive active:scale-90 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

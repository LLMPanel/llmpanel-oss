"use client"

import { motion } from "motion/react"
import { Database, FileUp, Sparkles, MessageSquare, Plus } from "lucide-react"

interface RagEmptyStateProps {
  onCreateCollection: () => void
}

const STEPS = [
  { icon: FileUp, label: "Upload docs" },
  { icon: Sparkles, label: "Auto‑embed" },
  { icon: MessageSquare, label: "Chat with context" },
]

export function RagEmptyState({ onCreateCollection }: RagEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="flex flex-col items-center gap-6 px-6 py-20 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Database className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </div>

      <div className="max-w-md">
        <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">
          Build your knowledge base
        </h3>
        <p className="mt-2 text-[14px] leading-[1.45] text-muted-foreground">
          Create a collection, upload PDFs and docs, and connect it to your agents.
          Vectors live in a local index with zero setup, or in your own Qdrant cluster.
        </p>
      </div>

      <div className="flex items-center gap-6 text-[12px] text-muted-foreground">
        {STEPS.map(({ icon: Icon, label }, i) => (
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4, delay: 0.1 + i * 0.05 }}
            className="flex items-center gap-1.5"
          >
            <Icon className="size-3.5" />
            {label}
          </motion.span>
        ))}
      </div>

      <button
        type="button"
        onClick={onCreateCollection}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[transform,opacity] duration-100 ease-out hover:opacity-90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Plus className="size-4" strokeWidth={2.5} />
        Create Collection
      </button>
    </motion.div>
  )
}

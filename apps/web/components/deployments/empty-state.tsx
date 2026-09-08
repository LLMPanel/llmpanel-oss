"use client"

import { ServerOff, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
      <div className="relative mb-6">
        <div className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/50">
          <ServerOff className="size-7 text-muted-foreground/60" />
        </div>
        <div className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-3" />
        </div>
      </div>

      <h2 className="text-lg font-semibold tracking-tight">
        No deployments yet
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Deploy your first LLM model and get an OpenAI-compatible inference
        endpoint up and running in minutes.
      </p>

      <Button className="mt-8 gap-2" size="lg" onClick={onAdd}>
        <Plus className="size-4" />
        Deploy your first model
      </Button>
    </div>
  )
}

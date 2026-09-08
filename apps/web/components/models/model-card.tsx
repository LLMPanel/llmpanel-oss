"use client"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { RegistryModel, RegistryQuantization } from "@/hooks/use-registry-models"

/**
 * A registry model and the quantizations it ships in.
 *
 * The quantizations are laid out as a real three-column table rather than a
 * stack of bordered pills. Before, a row read "16GB 16GB" with the only thing
 * separating VRAM from download size being two 12px icons — the column headers
 * do that job now, and the section label doubles as the first one.
 */

function QuantRow({ q, showPick }: { q: RegistryQuantization; showPick: boolean }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[12px] font-medium uppercase text-foreground">
          {q.format}
        </span>
        {showPick && q.recommended && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] text-primary ring-1 ring-inset ring-primary/20">
            Recommended
          </span>
        )}
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums text-foreground/70">
        {q.vramRequiredGb} GB
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums text-foreground/70">
        {q.fileSizeGb != null ? `${q.fileSizeGb} GB` : "—"}
      </span>
    </>
  )
}

export function ModelCard({ model }: { model: RegistryModel }) {
  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden p-0">
      {/* flex-1 keeps the spec line pinned to the bottom, so footers line up
          across a grid row even though the cards hold different amounts. */}
      <div className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.011em] text-foreground">
              {model.name}
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] leading-snug text-muted-foreground">
              {model.huggingfaceId}
            </p>
          </div>
          {/* Neutral, not one hue per family — the label already distinguishes
              them, and eight tinted chips in a grid compete with everything. */}
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9.5px] font-medium uppercase leading-none tracking-[0.06em] text-muted-foreground">
            {model.family}
          </span>
        </div>

        {model.description && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {model.description}
          </p>
        )}

        {model.tags.length > 0 && (
          <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground/70">
            {model.tags.join(" · ")}
          </p>
        )}

        {/* Quantization table — the section label is the first column header. */}
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center",
            "gap-x-4 gap-y-2 pt-1"
          )}
        >
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Quantizations
          </span>
          <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            VRAM
          </span>
          <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            File
          </span>
          {model.quantizations.map((q) => (
            <QuantRow
              key={q.format}
              q={q}
              showPick={model.quantizations.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Spec line — slug and the headline requirement, same shape as the
          deployment card's footer. "N formats" is gone: the table says it. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3 font-mono text-[11px] leading-none">
        <span className="truncate text-muted-foreground">{model.slug}</span>
        <span className="shrink-0 tabular-nums text-foreground/65">
          Min {model.minVram} GB
        </span>
      </div>
    </Card>
  )
}

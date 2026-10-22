"use client"

import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Check, Search, Sparkles } from "lucide-react"
import { cpuQuantization, estimateCpuRamGb, resolveDflashDrafter } from "@llmpanel/shared"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  RegistryModel,
  RegistryQuantization,
} from "@/hooks/use-registry-models"
import { stepContainer, stepItem } from "./motion"

interface ModelStepProps {
  models: RegistryModel[]
  modelsLoading: boolean
  modelsError: string | null
  selectedModelId: string
  selectedQuantization: string
  kvCacheEnabled: boolean
  dflashEnabled: boolean
  onSelectModel: (modelId: string) => void
  onSelectQuantization: (format: string) => void
  onKvCacheChange: (enabled: boolean) => void
  onDflashChange: (enabled: boolean) => void
  /** Host has no GPU: only models with a CPU (GGUF) build can be picked. */
  cpuMode: boolean
}

type SortKey = "name" | "vram" | "family"

function modelMinVram(model: RegistryModel): number {
  if (!model.quantizations.length) return model.minVram
  return Math.min(...model.quantizations.map((q) => q.vramRequiredGb))
}

/** RAM the model's CPU build needs, or null when it has none. */
function modelCpuRam(model: RegistryModel): number | null {
  const q = cpuQuantization(model)
  return q ? estimateCpuRamGb(q.fileSizeGb ?? q.vramRequiredGb) : null
}

export function ModelStep({
  models,
  modelsLoading,
  modelsError,
  selectedModelId,
  selectedQuantization,
  kvCacheEnabled,
  dflashEnabled,
  onSelectModel,
  onSelectQuantization,
  onKvCacheChange,
  onDflashChange,
  cpuMode,
}: ModelStepProps) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("name")

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null
  const drafter = resolveDflashDrafter(selectedModel?.huggingfaceId)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.family.toLowerCase().includes(q) ||
            m.huggingfaceId.toLowerCase().includes(q) ||
            m.tags.some((tag) => tag.toLowerCase().includes(q))
        )
      : models
    return [...filtered].sort((a, b) => {
      // On the CPU, models that can run come first.
      if (cpuMode) {
        const aCpu = modelCpuRam(a) != null ? 0 : 1
        const bCpu = modelCpuRam(b) != null ? 0 : 1
        if (aCpu !== bCpu) return aCpu - bCpu
      }
      if (sort === "vram") return modelMinVram(a) - modelMinVram(b)
      if (sort === "family") return a.family.localeCompare(b.family) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
  }, [models, query, sort, cpuMode])

  if (modelsLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-32 shrink-0" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.75rem] w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (modelsError) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
        {modelsError}
      </div>
    )
  }

  return (
    <motion.div variants={stepContainer} initial="hidden" animate="show" className="space-y-4">
      {/* Toolbar */}
      <motion.div variants={stepItem} className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Select model
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {visible.length} of {models.length}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, family, tag, or HF ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="vram">Min VRAM</SelectItem>
              <SelectItem value="family">Family</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Model list */}
      <motion.div
        variants={stepItem}
        role="radiogroup"
        aria-label="Model"
        className="max-h-[19rem] space-y-2 overflow-y-auto pr-1 px-2"
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed py-10 text-center">
            <p className="text-sm font-medium">No models found</p>
            <p className="text-xs text-muted-foreground">Try a different search.</p>
          </div>
        ) : (
          visible.map((model) => {
            const selected = model.id === selectedModelId
            const cpuRam = cpuMode ? modelCpuRam(model) : null
            const unavailable = cpuMode && cpuRam == null
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={unavailable}
                onClick={() => onSelectModel(model.id)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-[color,background-color,border-color,box-shadow]",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  unavailable ? "cursor-not-allowed opacity-50" : "active:scale-[0.99]",
                  selected
                    ? "border-primary bg-accent/60 shadow-sm ring-1 ring-primary"
                    : !unavailable && "border-border hover:border-foreground/25 hover:bg-accent/40"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input group-hover:border-foreground/40"
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{model.name}</p>
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {model.family}
                    </Badge>
                    {unavailable && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
                        No CPU build
                      </span>
                    )}
                  </div>
                  {model.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground text-pretty">
                      {model.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {cpuRam != null ? `~${cpuRam} GB RAM` : `${modelMinVram(model)} GB min VRAM`}
                    </span>
                    {model.quantizations.slice(0, 4).map((q) => (
                      <Badge
                        key={q.format}
                        variant={q.recommended ? "default" : "outline"}
                        className="text-[10px] uppercase"
                      >
                        {q.format}
                      </Badge>
                    ))}
                    {model.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="blue" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </motion.div>

      {/* Quantization picker */}
      {selectedModel && (
        <motion.div variants={stepItem} className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quantization
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* On the CPU the GGUF build is the only option. */}
            {(cpuMode
              ? selectedModel.quantizations.filter((q) => q === cpuQuantization(selectedModel))
              : selectedModel.quantizations
            ).map((q: RegistryQuantization) => {
              const active = selectedQuantization === q.format
              return (
                <button
                  key={q.format}
                  type="button"
                  onClick={() => onSelectQuantization(q.format)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-[color,background-color,border-color,box-shadow] active:scale-[0.97]",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    active
                      ? "border-primary bg-accent/60 shadow-sm ring-1 ring-primary"
                      : "border-border hover:border-foreground/25 hover:bg-accent/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold uppercase">{q.format}</p>
                    {q.recommended && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-success">
                        <Sparkles className="size-2.5" strokeWidth={2.5} /> Rec
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    {cpuMode
                      ? `~${estimateCpuRamGb(q.fileSizeGb ?? q.vramRequiredGb)} GB RAM`
                      : `${q.vramRequiredGb} GB VRAM`}
                  </p>
                  {q.fileSizeGb != null && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {q.fileSizeGb} GB file
                    </p>
                  )}
                  {q.notes && (
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                      {q.notes}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Engine options are vLLM's: llama.cpp always caches prompts and has
          no DFlash, so CPU deployments skip both toggles. */}
      {!cpuMode && (
        <>
          {/* KV Cache toggle */}
          <motion.label
            variants={stepItem}
            htmlFor="kv-cache"
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">KV cache</p>
              <p className="text-xs text-muted-foreground text-pretty">
                Enable prefix caching to speed up repeated prompts.
              </p>
            </div>
            <Switch id="kv-cache" checked={kvCacheEnabled} onCheckedChange={onKvCacheChange} />
          </motion.label>

          {/* DFlash 2 speculative decoding — only meaningful when a drafter exists
              for the selected model; the switch is disabled otherwise. */}
          <motion.label
            variants={stepItem}
            htmlFor="dflash"
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border p-3",
              drafter ? "cursor-pointer" : "cursor-not-allowed opacity-60"
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">DFlash 2 speculative decoding</p>
              <p className="text-xs text-muted-foreground text-pretty">
                {drafter ? (
                  <>
                    Block‑diffusion drafter{" "}
                    <code className="font-mono text-[11px]">{drafter.model}</code>
                    {" "}— up to ~3× faster decoding, identical output.
                  </>
                ) : selectedModel ? (
                  "No DFlash drafter is available for this model yet."
                ) : (
                  "Select a model to see if a drafter is available."
                )}
              </p>
            </div>
            <Switch
              id="dflash"
              checked={!!drafter && dflashEnabled}
              disabled={!drafter}
              onCheckedChange={onDflashChange}
            />
          </motion.label>
        </>
      )}
    </motion.div>
  )
}

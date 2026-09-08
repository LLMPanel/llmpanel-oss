"use client"

import { useMemo, useState } from "react"
import {
  Loader2,
  Database,
  Cloud,
  Cpu,
  Server,
  Globe,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { createRagCollection } from "@/hooks/use-rag"
import {
  type EmbeddingSource,
  BUILTIN_MODEL,
  BUILTIN_DIMENSIONS,
  CUSTOM_MODEL,
  findPreset,
  presetsForSource,
} from "./embedding-models"

interface CollectionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deploymentId: string
  onCreated: () => void
}

const STEPS = ["Basics", "Vector Store", "Embedding", "Tuning"] as const

/** Shared chrome for the selectable option cards (vector store, source, model). */
const CARD =
  "rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

export function CollectionForm({
  open,
  onOpenChange,
  deploymentId,
  onCreated,
}: CollectionFormProps) {
  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [vectorStoreType, setVectorStoreType] = useState<"local" | "qdrant">("local")
  const [embeddingSource, setEmbeddingSource] = useState<EmbeddingSource>("builtin")
  const [modelOption, setModelOption] = useState(BUILTIN_MODEL)
  const [embeddingModel, setEmbeddingModel] = useState(BUILTIN_MODEL)
  const [embeddingDimensions, setEmbeddingDimensions] = useState(String(BUILTIN_DIMENSIONS))
  const [chunkSize, setChunkSize] = useState("512")
  const [chunkOverlap, setChunkOverlap] = useState("50")
  const [topK, setTopK] = useState("5")
  const [scoreThreshold, setScoreThreshold] = useState("0.3")
  // External embedding
  const [externalEmbeddingUrl, setExternalEmbeddingUrl] = useState("")
  const [externalEmbeddingApiKey, setExternalEmbeddingApiKey] = useState("")
  // Qdrant
  const [qdrantUrl, setQdrantUrl] = useState("")
  const [qdrantApiKey, setQdrantApiKey] = useState("")
  const [qdrantCollectionName, setQdrantCollectionName] = useState("")

  const isCustomModel = modelOption === CUSTOM_MODEL
  const dimensionsLocked = embeddingSource === "builtin" || !isCustomModel

  const reset = () => {
    setStep(0)
    setName("")
    setDescription("")
    setVectorStoreType("local")
    setEmbeddingSource("builtin")
    setModelOption(BUILTIN_MODEL)
    setEmbeddingModel(BUILTIN_MODEL)
    setEmbeddingDimensions(String(BUILTIN_DIMENSIONS))
    setChunkSize("512")
    setChunkOverlap("50")
    setTopK("5")
    setScoreThreshold("0.3")
    setExternalEmbeddingUrl("")
    setExternalEmbeddingApiKey("")
    setQdrantUrl("")
    setQdrantApiKey("")
    setQdrantCollectionName("")
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  // When the embedding source changes, snap the model + dimensions to a sensible
  // default for that source so the two never get out of sync.
  const handleSourceChange = (source: EmbeddingSource) => {
    setEmbeddingSource(source)
    const first = presetsForSource(source)[0]
    if (first) {
      setModelOption(first.value)
      setEmbeddingModel(first.value)
      setEmbeddingDimensions(String(first.dimensions))
    } else {
      setModelOption(CUSTOM_MODEL)
      setEmbeddingModel("")
    }
  }

  const handleModelOptionChange = (value: string) => {
    setModelOption(value)
    if (value === CUSTOM_MODEL) {
      setEmbeddingModel("")
      return
    }
    const preset = findPreset(value)
    if (preset) {
      setEmbeddingModel(preset.value)
      setEmbeddingDimensions(String(preset.dimensions))
    }
  }

  // ── Per-step validation ───────────────────────────────────────────
  const dims = Number(embeddingDimensions)
  const size = Number(chunkSize)
  const overlap = Number(chunkOverlap)
  const topKNum = Number(topK)
  const thresholdNum = Number(scoreThreshold)

  const stepValid = useMemo(
    () => [
      name.trim().length > 0,
      vectorStoreType === "local" || qdrantUrl.trim().length > 0,
      (embeddingSource !== "external" || externalEmbeddingUrl.trim().length > 0) &&
        embeddingModel.trim().length > 0 &&
        Number.isFinite(dims) &&
        dims > 0,
      Number.isFinite(size) &&
        size > 0 &&
        Number.isFinite(overlap) &&
        overlap >= 0 &&
        overlap < size &&
        Number.isInteger(topKNum) &&
        topKNum >= 1 &&
        topKNum <= 20 &&
        Number.isFinite(thresholdNum) &&
        thresholdNum >= 0 &&
        thresholdNum <= 1,
    ],
    [
      name,
      vectorStoreType,
      qdrantUrl,
      embeddingSource,
      externalEmbeddingUrl,
      embeddingModel,
      dims,
      size,
      overlap,
      topKNum,
      thresholdNum,
    ]
  )

  const canContinue = stepValid[step]
  const isLastStep = step === STEPS.length - 1

  const handleSubmit = async () => {
    if (!stepValid.every(Boolean)) {
      toast.error("Please complete all steps before creating the collection")
      return
    }

    setIsSubmitting(true)
    try {
      await createRagCollection(deploymentId, {
        name: name.trim(),
        description: description.trim() || undefined,
        vectorStoreType,
        embeddingSource,
        embeddingModel: embeddingModel.trim() || undefined,
        embeddingDimensions: dims,
        chunkSize: size,
        chunkOverlap: overlap,
        topK: topKNum,
        scoreThreshold: thresholdNum,
        ...(embeddingSource === "external" && {
          externalEmbeddingUrl: externalEmbeddingUrl.trim(),
          externalEmbeddingApiKey: externalEmbeddingApiKey.trim() || undefined,
        }),
        ...(vectorStoreType === "qdrant" && {
          qdrantUrl: qdrantUrl.trim(),
          qdrantApiKey: qdrantApiKey.trim() || undefined,
          qdrantCollectionName:
            qdrantCollectionName.trim() || name.toLowerCase().replace(/\s+/g, "_"),
        }),
      })

      toast.success("Collection created")
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create collection")
    } finally {
      setIsSubmitting(false)
    }
  }

  const sourceModels = presetsForSource(embeddingSource)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
        <DialogHeader className="gap-4">
          <div className="space-y-1.5 pr-8">
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Set up a knowledge base — where vectors live, how text is embedded
              and how it is retrieved.
            </DialogDescription>
          </div>

          {/* Progress + step rail */}
          <div className="space-y-2">
            <Progress
              value={step + 1}
              max={STEPS.length}
              className="h-1"
              indicatorClassName="bg-violet-500"
            />
            <div className="flex items-center justify-between gap-2">
              {STEPS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  disabled={i > step && !stepValid.slice(0, i).every(Boolean)}
                  onClick={() => setStep(i)}
                  className={`flex min-w-0 items-center gap-1.5 rounded text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${
                    i === step
                      ? "font-medium text-violet-500"
                      : i < step
                        ? "text-foreground hover:text-violet-500"
                        : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] tabular-nums ${
                      i < step
                        ? "bg-violet-500 text-white"
                        : i === step
                          ? "border border-violet-500 text-violet-500"
                          : "border border-border"
                    }`}
                  >
                    {i < step ? <Check className="size-2.5" /> : i + 1}
                  </span>
                  {/* On narrow dialogs only the current step keeps its label */}
                  <span className={`truncate ${i === step ? "" : "hidden sm:inline"}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="max-h-[min(60vh,30rem)] min-h-[15rem] space-y-5">
          {/* ── Step 0: Basics ─────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="My Knowledge Base"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description of what this collection contains..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                A collection is one searchable knowledge base. The next steps
                pick where its vectors are stored and which embedding model
                indexes them — you can upload documents once it exists.
              </p>
            </div>
          )}

          {/* ── Step 1: Vector Store ───────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <Label>Vector Store</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVectorStoreType("local")}
                  className={`${CARD} flex items-center gap-2.5 p-3 ${
                    vectorStoreType === "local"
                      ? "border-violet-500 bg-violet-500/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Database className="size-4 shrink-0 text-violet-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Local (zvec)</p>
                    <p className="text-[10px] text-muted-foreground">
                      Embedded HNSW index — zero setup
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVectorStoreType("qdrant")}
                  className={`${CARD} flex items-center gap-2.5 p-3 ${
                    vectorStoreType === "qdrant"
                      ? "border-blue-500 bg-blue-500/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Cloud className="size-4 shrink-0 text-blue-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Qdrant</p>
                    <p className="text-[10px] text-muted-foreground">
                      Connect your own cluster
                    </p>
                  </div>
                </button>
              </div>

              {vectorStoreType === "local" && (
                <p className="rounded-md bg-violet-500/5 px-3 py-2 text-[11px] text-violet-600 dark:text-violet-400">
                  Powered by zvec — an in-process vector database with an HNSW
                  index stored on this server. No external service, scales to
                  millions of chunks.
                </p>
              )}

              {vectorStoreType === "qdrant" && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    Qdrant Configuration
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="qdrant-url" className="text-xs">
                      URL
                    </Label>
                    <Input
                      id="qdrant-url"
                      placeholder="https://your-cluster.qdrant.io:6333"
                      value={qdrantUrl}
                      onChange={(e) => setQdrantUrl(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qdrant-key" className="text-xs">
                      API Key
                    </Label>
                    <Input
                      id="qdrant-key"
                      type="password"
                      placeholder="Your Qdrant API key"
                      value={qdrantApiKey}
                      onChange={(e) => setQdrantApiKey(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qdrant-collection" className="text-xs">
                      Collection Name
                    </Label>
                    <Input
                      id="qdrant-collection"
                      placeholder="Auto-generated from name"
                      value={qdrantCollectionName}
                      onChange={(e) => setQdrantCollectionName(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Embedding ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <Label>Embedding Source</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      v: "builtin",
                      icon: Cpu,
                      label: "Built-in",
                      hint: "Local, no key",
                      color: "text-success",
                      active: "border-success bg-success/5",
                    },
                    {
                      v: "deployment",
                      icon: Server,
                      label: "Deployment",
                      hint: "Your endpoint",
                      color: "text-violet-500",
                      active: "border-violet-500 bg-violet-500/5",
                    },
                    {
                      v: "external",
                      icon: Globe,
                      label: "External",
                      hint: "OpenAI etc.",
                      color: "text-blue-500",
                      active: "border-blue-500 bg-blue-500/5",
                    },
                  ] as const
                ).map(({ v, icon: Icon, label, hint, color, active }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleSourceChange(v)}
                    className={`${CARD} flex flex-col items-start gap-1 p-2.5 ${
                      embeddingSource === v ? active : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Icon className={`size-4 shrink-0 ${color}`} />
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>

              {embeddingSource === "builtin" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {presetsForSource("builtin").map((preset) => {
                      const selected = embeddingModel === preset.value
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            setModelOption(preset.value)
                            setEmbeddingModel(preset.value)
                            setEmbeddingDimensions(String(preset.dimensions))
                          }}
                          className={`${CARD} flex flex-col gap-1 p-2.5 ${
                            selected
                              ? "border-success bg-success/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{preset.label}</span>
                            {selected && <Check className="size-3.5 shrink-0 text-success" />}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {preset.hint}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                              {preset.dimensions}d
                            </Badge>
                            <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                              ~{preset.sizeMb} MB
                            </Badge>
                            <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                              {preset.languages}
                            </Badge>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="rounded-md bg-success/5 px-3 py-2 text-[11px] text-success">
                    Runs locally in the API via ONNX (Transformers.js). Weights
                    are downloaded once on first use — no endpoint or API key
                    required.
                  </p>
                </div>
              )}

              {embeddingSource === "external" && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ext-url" className="text-xs">
                      Embedding API URL
                    </Label>
                    <Input
                      id="ext-url"
                      placeholder="https://api.openai.com"
                      value={externalEmbeddingUrl}
                      onChange={(e) => setExternalEmbeddingUrl(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ext-key" className="text-xs">
                      API Key
                    </Label>
                    <Input
                      id="ext-key"
                      type="password"
                      placeholder="sk-..."
                      value={externalEmbeddingApiKey}
                      onChange={(e) => setExternalEmbeddingApiKey(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}

              {embeddingSource !== "builtin" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emb-model" className="text-xs">
                    Model
                  </Label>
                  <Select value={modelOption} onValueChange={handleModelOptionChange}>
                    <SelectTrigger id="emb-model" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceModels.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="text-xs">
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_MODEL} className="text-xs">
                        Custom…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {isCustomModel && (
                    <Input
                      placeholder="model-id"
                      value={embeddingModel}
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                      className="mt-1.5 text-xs"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emb-dim" className="text-xs">
                    Dimensions
                  </Label>
                  <Input
                    id="emb-dim"
                    type="number"
                    value={embeddingDimensions}
                    onChange={(e) => setEmbeddingDimensions(e.target.value)}
                    disabled={dimensionsLocked}
                    className="text-xs disabled:opacity-70"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {dimensionsLocked
                      ? "Set automatically by the model"
                      : "Must match your model's output size"}
                  </p>
                </div>
              </div>
              )}
            </div>
          )}

          {/* ── Step 3: Chunking ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                Chunking
                <Badge variant="secondary" className="text-[9px]">
                  Recursive
                </Badge>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="chunk-size" className="text-xs">
                    Chunk Size
                  </Label>
                  <Input
                    id="chunk-size"
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="chunk-overlap" className="text-xs">
                    Overlap
                  </Label>
                  <Input
                    id="chunk-overlap"
                    type="number"
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
              {Number.isFinite(size) && Number.isFinite(overlap) && overlap >= size && (
                <p className="text-[11px] text-destructive">
                  Overlap must be smaller than chunk size.
                </p>
              )}

              <Label className="pt-1">Retrieval</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="top-k" className="text-xs">
                    Top K results
                  </Label>
                  <Input
                    id="top-k"
                    type="number"
                    min={1}
                    max={20}
                    value={topK}
                    onChange={(e) => setTopK(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Chunks returned per query (1–20)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="score-threshold" className="text-xs">
                    Score threshold
                  </Label>
                  <Input
                    id="score-threshold"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={scoreThreshold}
                    onChange={(e) => setScoreThreshold(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Minimum similarity (0–1)
                  </p>
                </div>
              </div>

              {/* Review summary */}
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-[11px]">
                <p className="font-medium text-muted-foreground">Summary</p>
                <SummaryRow label="Name" value={name.trim() || "—"} />
                <SummaryRow
                  label="Vector store"
                  value={vectorStoreType === "qdrant" ? "Qdrant" : "Local (zvec)"}
                />
                <SummaryRow
                  label="Embedding"
                  value={`${embeddingSource} · ${embeddingModel || "—"} (${embeddingDimensions}d)`}
                />
                <SummaryRow label="Chunking" value={`${chunkSize} / ${chunkOverlap} overlap`} />
                <SummaryRow label="Retrieval" value={`top ${topK} · min score ${scoreThreshold}`} />
              </div>
            </div>
          )}
        </DialogBody>

        {/* Footer nav */}
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {step === 0 ? (
            <Button
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={isSubmitting}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          )}

          {isLastStep ? (
            <Button
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || !stepValid.every(Boolean)}
              className="gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Database className="size-4" />
              )}
              Create Collection
            </Button>
          ) : (
            <Button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canContinue}
              className="gap-1"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}

"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  Copy,
  Dices,
  Download,
  ExternalLink,
  History,
  ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ApiKeySelector, PLACEHOLDER_KEY } from "@/components/api-reference/api-key-selector"
import { CurlSnippet } from "@/components/api-reference/curl-snippet"
import { PageHeader } from "@/components/deployments/page-header"
import { useApiKeys } from "@/hooks/use-api-keys"
import { useDeployment } from "@/hooks/use-deployments"
import { findImageModelByHfId } from "@/lib/image-models"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────

interface GenerationMeta {
  prompt: string
  negativePrompt: string | null
  width: number
  height: number
  steps: number
  guidance: number | null
  seed: number | null
  latencyMs: number | null
}

interface ViewerImage {
  url: string
  meta: GenerationMeta
}

interface HistoryItem {
  id: string
  url: string
  prompt: string
  negativePrompt: string | null
  width: number | null
  height: number | null
  steps: number | null
  guidanceScale: number | null
  seed: number | null
  latencyMs: number | null
  createdAt: string
}

// ── Aspect ratio presets ───────────────────────────────────────────────
// Sizes are area-preserving around the model's native resolution, snapped
// to multiples of 64 (diffusion models want /8 at minimum, /64 is safest).

const ASPECTS = [
  { label: "1:1", w: 1, h: 1 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
] as const

function snap64(value: number): number {
  return Math.min(2048, Math.max(256, Math.round(value / 64) * 64))
}

function sizeForAspect(base: number, w: number, h: number): { width: number; height: number } {
  const scale = Math.sqrt(w / h)
  return { width: snap64(base * scale), height: snap64(base / scale) }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ── Page ───────────────────────────────────────────────────────────────

export default function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { deployment } = useDeployment(id)

  const model = findImageModelByHfId(deployment?.huggingfaceId)
  const defaults = model?.generation

  // ── Form state ──
  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  const [steps, setSteps] = useState(8)
  const [guidance, setGuidance] = useState(3.5)
  const [count, setCount] = useState(1)
  const [seed, setSeed] = useState("")
  const defaultsApplied = useRef(false)

  // Seed the form with the model's recommended settings once we know the model.
  useEffect(() => {
    if (!defaults || defaultsApplied.current) return
    defaultsApplied.current = true
    setWidth(defaults.width)
    setHeight(defaults.height)
    setSteps(defaults.steps)
    setGuidance(defaults.guidance)
  }, [defaults])

  const supportsNegative = defaults?.supportsNegativePrompt ?? true

  // ── Generation state ──
  const [generating, setGenerating] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [results, setResults] = useState<ViewerImage[]>([])
  const [viewer, setViewer] = useState<ViewerImage | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const isRunning = deployment?.status === "running"

  useEffect(() => {
    if (!generating) return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 100)
    return () => clearInterval(timer)
  }, [generating])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/deployments/${id}/images?limit=30`, {
        credentials: "include",
      })
      if (!res.ok) return
      const data = (await res.json()) as { images: HistoryItem[] }
      setHistory(data.images)
    } catch {
      /* non-fatal */
    }
  }, [id])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const generate = useCallback(async () => {
    if (!prompt.trim() || generating || !isRunning) return
    setGenerating(true)
    setElapsedMs(0)

    // Always send an explicit seed so every generation is reproducible and
    // the seed can be shown alongside the result.
    const usedSeed =
      seed.trim() !== "" && !Number.isNaN(Number(seed)) ? Number(seed) : randomSeed()

    const meta: GenerationMeta = {
      prompt: prompt.trim(),
      negativePrompt: supportsNegative && negativePrompt.trim() ? negativePrompt.trim() : null,
      width,
      height,
      steps,
      guidance,
      seed: usedSeed,
      latencyMs: null,
    }

    const body: Record<string, unknown> = {
      prompt: meta.prompt,
      negative_prompt: meta.negativePrompt ?? undefined,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidance,
      n: count,
      seed: usedSeed,
    }

    const start = Date.now()
    try {
      const res = await fetch(`/api/v1/deployments/${id}/images/generations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as {
        data?: Array<{ url: string }>
        error?: string | { message?: string }
      }

      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ?? "Generation failed"
        throw new Error(msg)
      }

      const latencyMs = Date.now() - start
      const images: ViewerImage[] = (data.data ?? []).map((img) => ({
        url: img.url,
        meta: { ...meta, latencyMs },
      }))
      setResults(images)
      setViewer(images[0] ?? null)
      void loadHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }, [
    prompt,
    negativePrompt,
    supportsNegative,
    width,
    height,
    steps,
    guidance,
    count,
    seed,
    generating,
    isRunning,
    id,
    loadHistory,
  ])

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void generate()
    }
  }

  const applySettings = useCallback((meta: GenerationMeta) => {
    setPrompt(meta.prompt)
    setNegativePrompt(meta.negativePrompt ?? "")
    if (meta.width) setWidth(meta.width)
    if (meta.height) setHeight(meta.height)
    if (meta.steps) setSteps(meta.steps)
    if (meta.guidance != null) setGuidance(meta.guidance)
    setSeed(meta.seed != null ? String(meta.seed) : "")
    toast.success("Settings restored")
  }, [])

  const viewHistoryItem = (item: HistoryItem) => {
    setViewer({
      url: item.url,
      meta: {
        prompt: item.prompt,
        negativePrompt: item.negativePrompt,
        width: item.width ?? 0,
        height: item.height ?? 0,
        steps: item.steps ?? 0,
        guidance: item.guidanceScale,
        seed: item.seed,
        latencyMs: item.latencyMs,
      },
    })
  }

  const modelName = model?.name ?? deployment?.huggingfaceId ?? "Image model"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Generate"
        description={`Text-to-image playground for ${modelName}.`}
        icon={Sparkles}
        actions={
          <Badge variant={isRunning ? "default" : "secondary"} className="text-[11px]">
            {isRunning ? "Running" : deployment?.status ?? "…"}
          </Badge>
        }
      />

      <Tabs defaultValue="playground" className="flex flex-col gap-6">
        <TabsList className="w-fit">
          <TabsTrigger value="playground" className="gap-1.5">
            <Wand2 className="size-3.5" /> Playground
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <Terminal className="size-3.5" /> API
          </TabsTrigger>
        </TabsList>

        {/* ════════════════ Playground ════════════════ */}
        <TabsContent value="playground" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
            {/* ── Parameter panel ── */}
            <div className="space-y-5 rounded-xl border bg-card p-4 h-fit lg:sticky lg:top-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="prompt">Prompt</Label>
                  <span className="text-[10px] text-muted-foreground">⌘↵ to generate</span>
                </div>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="A red panda astronaut floating in space, studio lighting, ultra detailed"
                  rows={4}
                  className="resize-none"
                />
              </div>

              {supportsNegative && (
                <div className="space-y-1.5">
                  <Label htmlFor="negative">Negative prompt</Label>
                  <Textarea
                    id="negative"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="blurry, low quality, distorted"
                    rows={2}
                    className="resize-none"
                  />
                </div>
              )}

              {/* Aspect ratio */}
              <div className="space-y-1.5">
                <Label>Aspect ratio</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {ASPECTS.map((a) => {
                    const base = defaults?.width ?? 1024
                    const size = sizeForAspect(base, a.w, a.h)
                    const active = size.width === width && size.height === height
                    return (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          setWidth(size.width)
                          setHeight(size.height)
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50"
                        )}
                      >
                        <span
                          className={cn(
                            "rounded-[3px] border",
                            active ? "border-primary" : "border-muted-foreground/60"
                          )}
                          style={{
                            width: a.w >= a.h ? 18 : Math.round((a.w / a.h) * 18),
                            height: a.h >= a.w ? 18 : Math.round((a.h / a.w) * 18),
                          }}
                        />
                        {a.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="h-8 text-xs"
                    aria-label="Width"
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="h-8 text-xs"
                    aria-label="Height"
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Steps</Label>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{steps}</span>
                </div>
                <Slider
                  value={[steps]}
                  min={1}
                  max={60}
                  step={1}
                  onValueChange={([v]) => setSteps(v)}
                />
              </div>

              {/* Guidance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Guidance (CFG)</Label>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {guidance.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[guidance]}
                  min={0}
                  max={15}
                  step={0.5}
                  onValueChange={([v]) => setGuidance(v)}
                />
              </div>

              {/* Count + Seed */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Images</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCount(n)}
                        className={cn(
                          "rounded-md border py-1.5 text-xs font-medium transition-colors",
                          count === n
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="seed">Seed</Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="seed"
                      type="number"
                      placeholder="random"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 shrink-0"
                      title="Randomize seed"
                      onClick={() => setSeed(String(randomSeed()))}
                    >
                      <Dices className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => void generate()}
                disabled={!prompt.trim() || generating || !isRunning}
                className="w-full gap-2"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating… {(elapsedMs / 1000).toFixed(1)}s
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" /> Generate
                  </>
                )}
              </Button>

              {!isRunning && (
                <p className="text-center text-xs text-muted-foreground">
                  Deployment must be running to generate images.
                </p>
              )}
            </div>

            {/* ── Output ── */}
            <div className="space-y-6 min-w-0">
              {/* Viewer */}
              {generating ? (
                <div
                  className="relative flex w-full max-w-2xl flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border bg-muted/30"
                  style={{ aspectRatio: `${width} / ${height}` }}
                >
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 to-muted" />
                  <Loader2 className="relative size-8 animate-spin text-muted-foreground" />
                  <p className="relative font-mono text-sm text-muted-foreground">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </p>
                </div>
              ) : viewer ? (
                <ViewerPanel
                  viewer={viewer}
                  onApplySettings={() => applySettings(viewer.meta)}
                  onReuseSeed={() =>
                    setSeed(viewer.meta.seed != null ? String(viewer.meta.seed) : "")
                  }
                />
              ) : (
                <div className="flex aspect-[4/3] w-full max-w-2xl flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
                  <ImageIcon className="size-8 opacity-40" />
                  <p className="text-sm">Your generated images will appear here.</p>
                  <p className="text-xs opacity-70">Write a prompt and press Generate.</p>
                </div>
              )}

              {/* Batch thumbnails */}
              {!generating && results.length > 1 && (
                <div className="flex gap-2">
                  {results.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setViewer(img)}
                      className={cn(
                        "size-20 overflow-hidden rounded-lg border-2 transition-colors",
                        viewer?.url === img.url ? "border-primary" : "border-transparent hover:border-muted-foreground/40"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`Result ${i + 1}`} className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <History className="size-4" /> History
                  </h2>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => viewHistoryItem(item)}
                        title={item.prompt}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-lg border transition-colors",
                          viewer?.url === item.url && "ring-2 ring-primary"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={item.prompt}
                          loading="lazy"
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 transition-transform group-hover:translate-y-0">
                          <p className="line-clamp-2 text-left text-[10px] leading-tight text-white">
                            {item.prompt}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ════════════════ API ════════════════ */}
        <TabsContent value="api" className="mt-0">
          <ApiTab
            deploymentId={id}
            body={{
              prompt: prompt.trim() || "A red panda astronaut floating in space, studio lighting",
              ...(supportsNegative && negativePrompt.trim()
                ? { negative_prompt: negativePrompt.trim() }
                : {}),
              width,
              height,
              num_inference_steps: steps,
              guidance_scale: guidance,
              n: count,
              ...(seed.trim() !== "" && !Number.isNaN(Number(seed)) ? { seed: Number(seed) } : {}),
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Viewer panel ───────────────────────────────────────────────────────

function ViewerPanel({
  viewer,
  onApplySettings,
  onReuseSeed,
}: {
  viewer: ViewerImage
  onApplySettings: () => void
  onReuseSeed: () => void
}) {
  const [copied, setCopied] = useState(false)
  const { meta } = viewer

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(viewer.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Failed to copy URL")
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="group relative overflow-hidden rounded-xl border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={viewer.url} alt={meta.prompt} className="w-full object-contain" />
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <a
            href={viewer.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
            className="flex size-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
          >
            <Download className="size-4" />
          </a>
          <a
            href={viewer.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="flex size-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
          >
            <ExternalLink className="size-4" />
          </a>
          <button
            type="button"
            onClick={() => void copyUrl()}
            title="Copy URL"
            className="flex size-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </button>
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {meta.width > 0 && meta.height > 0 && (
          <MetaItem label="Size" value={`${meta.width}×${meta.height}`} />
        )}
        {meta.steps > 0 && <MetaItem label="Steps" value={String(meta.steps)} />}
        {meta.guidance != null && <MetaItem label="CFG" value={meta.guidance.toFixed(1)} />}
        {meta.seed != null && <MetaItem label="Seed" value={String(meta.seed)} />}
        {meta.latencyMs != null && (
          <MetaItem label="Time" value={`${(meta.latencyMs / 1000).toFixed(1)}s`} />
        )}
        <span className="ml-auto flex gap-1">
          {meta.seed != null && (
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={onReuseSeed}>
              <Dices className="size-3" /> Reuse seed
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={onApplySettings}>
            <RotateCcw className="size-3" /> Use settings
          </Button>
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground" title={meta.prompt}>
        {meta.prompt}
      </p>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="opacity-60">{label}</span>{" "}
      <span className="font-mono text-foreground/80">{value}</span>
    </span>
  )
}

// ── API tab ────────────────────────────────────────────────────────────
// fal.ai-style: the snippets always mirror the playground's current settings.

function ApiTab({
  deploymentId,
  body,
}: {
  deploymentId: string
  body: Record<string, unknown>
}) {
  const { apiKeys } = useApiKeys(deploymentId)
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)

  const selectedKey = apiKeys.find((k) => k.id === selectedKeyId)
  const key = selectedKey ? selectedKey.prefix : PLACEHOLDER_KEY
  const url = `${API_BASE}/v1/deployments/${deploymentId}/images/generations`

  const bodyJson = useMemo(() => JSON.stringify(body, null, 2), [body])

  const curl = `curl ${url} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '${bodyJson}'`

  const python = `import requests

response = requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${key}"},
    json=${bodyJson.replace(/\n/g, "\n    ")},
)
response.raise_for_status()

for image in response.json()["data"]:
    print(image["url"])`

  const javascript = `const response = await fetch("${url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer ${key}",
  },
  body: JSON.stringify(${bodyJson.replace(/\n/g, "\n  ")}),
})

const { data } = await response.json()
for (const image of data) console.log(image.url)`

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4">
        <ApiKeySelector apiKeys={apiKeys} selectedKeyId={selectedKeyId} onSelect={setSelectedKeyId} />
        <p className="mt-2 text-xs text-muted-foreground">
          Requests are authenticated with a bearer API key that has the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">images</code> scope. Every call
          is logged and generated images are stored and returned as hosted URLs. The snippets below
          mirror your current playground settings.
        </p>
      </div>

      <Tabs defaultValue="curl">
        <TabsList className="h-8">
          <TabsTrigger value="curl" className="px-3 text-xs">cURL</TabsTrigger>
          <TabsTrigger value="python" className="px-3 text-xs">Python</TabsTrigger>
          <TabsTrigger value="javascript" className="px-3 text-xs">JavaScript</TabsTrigger>
        </TabsList>
        <TabsContent value="curl" className="mt-3">
          <CurlSnippet code={curl} label="cURL" />
        </TabsContent>
        <TabsContent value="python" className="mt-3">
          <CurlSnippet code={python} label="Python" />
        </TabsContent>
        <TabsContent value="javascript" className="mt-3">
          <CurlSnippet code={javascript} label="JavaScript" />
        </TabsContent>
      </Tabs>

      {key === PLACEHOLDER_KEY && (
        <p className="text-xs text-muted-foreground">
          💡 Select an API key above, or create one on the API Keys page. Only the key prefix is
          shown — the full key is displayed once at creation time.
        </p>
      )}
    </div>
  )
}

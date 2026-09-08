"use client"

import { use, useState, useEffect, useRef, useMemo, useCallback } from "react"
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  ArrowDown,
  Download,
  X,
} from "lucide-react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useDeployment } from "@/hooks/use-deployments"
import { providerMeta } from "@/lib/provider-registry"
import { useContainerLogs } from "@/hooks/use-container-logs"
import { useDeploymentLogs } from "@/hooks/use-deployment-logs"
import { cn } from "@/lib/utils"

type LogMode = "snapshot" | "live"
type TailOption = "100" | "250" | "500" | "1000"

const MODES = [
  { value: "snapshot", label: "Snapshot" },
  { value: "live", label: "Live" },
] as const satisfies readonly { value: LogMode; label: string }[]

const TAILS = [
  { value: "100", label: "100" },
  { value: "250", label: "250" },
  { value: "500", label: "500" },
  { value: "1000", label: "1k" },
] as const satisfies readonly { value: TailOption; label: string }[]

const spring = { type: "spring", bounce: 0, duration: 0.35 } as const

// How close to the bottom (px) still counts as "pinned".
const PIN_THRESHOLD = 24

export default function ContainerLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const { deployment, isLoading: deploymentLoading, error: deploymentError } = useDeployment(id)

  const [mode, setMode] = useState<LogMode>("snapshot")
  const [tailLines, setTailLines] = useState<TailOption>("500")
  const [searchQuery, setSearchQuery] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(false)
  // Pinned = the viewport is following the newest line. Scrolling up unpins;
  // the "Latest" pill re-pins. No separate toggle to remember.
  const [pinned, setPinned] = useState(true)

  const viewportRef = useRef<HTMLDivElement>(null)

  const {
    lines: snapshotLines,
    providerType,
    isLoading: snapshotLoading,
    isFetching: snapshotFetching,
    error: snapshotError,
    refetch: refetchSnapshot,
  } = useContainerLogs(id, {
    tail: Number(tailLines),
    enabled: mode === "snapshot",
    refetchInterval: autoRefresh ? 5_000 : false,
  })

  const { lines: liveLines, isConnected } = useDeploymentLogs(
    id,
    mode === "live" ? (deployment?.externalId ?? null) : null
  )

  const activeLines = mode === "snapshot" ? snapshotLines : liveLines
  const isLoading = deploymentLoading || (mode === "snapshot" && snapshotLoading)

  const filteredLines = useMemo(() => {
    if (!searchQuery) return activeLines
    const q = searchQuery.toLowerCase()
    return activeLines.filter((line) => line.toLowerCase().includes(q))
  }, [activeLines, searchQuery])

  // Follow new output while pinned. Instant, not smooth: a stream that
  // animates every tick reads as jitter.
  useEffect(() => {
    const el = viewportRef.current
    if (pinned && el) el.scrollTop = el.scrollHeight
  }, [filteredLines, pinned])

  const handleScroll = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD
    setPinned(atBottom)
  }, [])

  const jumpToLatest = useCallback(() => {
    const el = viewportRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    setPinned(true)
  }, [])

  const handleDownload = useCallback(() => {
    const content = activeLines.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `container-logs-${id}-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [activeLines, id])

  if (deploymentLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">Loading deployment…</p>
      </div>
    )
  }

  if (deploymentError || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
        <p className="text-[15px] font-semibold tracking-[-0.01em]">
          {deploymentError ?? "Deployment not found"}
        </p>
      </div>
    )
  }

  const statusLabel =
    mode === "live"
      ? isConnected ? "Connected" : "Connecting…"
      : snapshotFetching ? "Fetching…" : autoRefresh ? "Refreshing every 5 s" : "Snapshot"

  return (
    <MotionConfig reducedMotion="user">
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      {/* ── Large title ── */}
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">
              Container Logs
            </h1>
            {providerType && (
              <Badge variant={providerMeta(providerType).badgeVariant}>
                {providerMeta(providerType).label}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Standard output from the inference container.
          </p>
        </div>
      </header>

      {/* ── Translucent toolbar ── */}
      <div className="shrink-0">
        <div
          className={cn(
            "rounded-2xl border border-black/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.06]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.4)]",
            "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
            <SegmentedControl label="Source" value={mode} options={MODES} onChange={setMode} />

            <AnimatePresence initial={false}>
              {mode === "snapshot" && (
                <motion.div
                  key="tail"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={spring}
                  className="flex items-center gap-2.5 overflow-hidden"
                >
                  <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">Tail</span>
                  <SegmentedControl label="Tail lines" value={tailLines} options={TAILS} onChange={setTailLines} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <div className="relative min-w-[180px] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Filter"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-[9px] bg-muted pl-8 pr-8 text-[12px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/20 text-background transition-transform active:scale-90"
                >
                  <X className="size-3" strokeWidth={3} />
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {mode === "snapshot" && (
                <>
                  <ToolbarButton
                    label={autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
                    pressed={autoRefresh}
                    onClick={() => setAutoRefresh((v) => !v)}
                  >
                    <span className={cn("size-1.5 rounded-full", autoRefresh ? "bg-primary-foreground" : "bg-muted-foreground")} />
                    Auto
                  </ToolbarButton>
                  <ToolbarButton
                    label="Refresh"
                    onClick={() => void refetchSnapshot()}
                    disabled={snapshotFetching}
                  >
                    <RefreshCw className={cn("size-3.5", snapshotFetching && "animate-spin")} />
                  </ToolbarButton>
                </>
              )}
              <ToolbarButton
                label="Download"
                onClick={handleDownload}
                disabled={activeLines.length === 0}
              >
                <Download className="size-3.5" />
              </ToolbarButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── Viewer ── */}
      <section
        aria-label="Log output"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
      >
        {/* Floating status strip; output scrolls underneath it. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-zinc-950/70 px-5 py-2.5 backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:bg-zinc-950">
          <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
            <span className="relative flex size-2">
              {mode === "live" && isConnected && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  mode === "live"
                    ? isConnected ? "bg-success" : "bg-zinc-600"
                    : snapshotFetching || autoRefresh ? "bg-primary" : "bg-zinc-600"
                )}
              />
            </span>
            {statusLabel}
          </div>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {searchQuery ? `${filteredLines.length} of ${activeLines.length}` : activeLines.length} lines
          </span>
        </div>

        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-12 font-mono text-[12px] leading-[1.6] text-zinc-300"
        >
          {isLoading ? (
            <Centered><Loader2 className="size-5 animate-spin text-zinc-600" /></Centered>
          ) : snapshotError ? (
            <Centered>
              <AlertCircle className="size-5 text-destructive" />
              <p className="font-sans text-[13px] text-zinc-400">{snapshotError}</p>
              <button
                type="button"
                onClick={() => void refetchSnapshot()}
                className="mt-1 rounded-full bg-white/10 px-3.5 py-1.5 font-sans text-[12px] font-medium text-zinc-100 transition-transform active:scale-95"
              >
                Retry
              </button>
            </Centered>
          ) : !deployment.externalId ? (
            <Quiet>Waiting for the container to start…</Quiet>
          ) : filteredLines.length === 0 ? (
            <Quiet>
              {searchQuery
                ? "No lines match the filter."
                : mode === "live"
                  ? isConnected ? "Waiting for output…" : "Connecting to the log stream…"
                  : "No logs yet."}
            </Quiet>
          ) : (
            filteredLines.map((line, i) => (
              <LogLine key={i} lineNumber={i + 1} content={line} searchQuery={searchQuery} />
            ))
          )}
        </div>

        {/* "Latest" pill — appears only once the reader has scrolled away. */}
        <AnimatePresence>
          {!pinned && filteredLines.length > 0 && (
            <motion.button
              key="latest"
              type="button"
              onClick={jumpToLatest}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={spring}
              className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-zinc-100 px-3.5 py-1.5 text-[12px] font-medium text-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-transform active:scale-95"
            >
              <ArrowDown className="size-3.5" />
              Latest
            </motion.button>
          )}
        </AnimatePresence>
      </section>
    </div>
    </MotionConfig>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-medium select-none",
        "transition-[transform,background-color] duration-100 ease-out active:scale-[0.96]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
        pressed ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2">{children}</div>
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-[13px] text-zinc-500">{children}</p>
}

function LogLine({
  lineNumber,
  content,
  searchQuery,
}: {
  lineNumber: number
  content: string
  searchQuery: string
}) {
  const lower = content.toLowerCase()
  const isError = lower.includes("error") || lower.includes("traceback") || lower.includes("exception")
  const isWarning = lower.includes("warn")
  const isInfo = lower.includes("info:")

  let textClass = "text-zinc-300"
  if (isError) textClass = "text-red-400"
  else if (isWarning) textClass = "text-yellow-400"
  else if (isInfo) textClass = "text-zinc-400"

  return (
    <p className={cn("-mx-1.5 whitespace-pre-wrap break-all rounded-md px-1.5 hover:bg-white/[0.04]", textClass)}>
      <span className="mr-3 inline-block w-10 select-none text-right tabular-nums text-zinc-600">
        {lineNumber}
      </span>
      {searchQuery ? <HighlightedText text={content} query={searchQuery} /> : content}
    </p>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const parts: Array<{ text: string; highlight: boolean }> = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let lastIndex = 0

  let idx = lower.indexOf(q)
  while (idx !== -1) {
    if (idx > lastIndex) parts.push({ text: text.slice(lastIndex, idx), highlight: false })
    parts.push({ text: text.slice(idx, idx + q.length), highlight: true })
    lastIndex = idx + q.length
    idx = lower.indexOf(q, lastIndex)
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), highlight: false })

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="rounded-sm bg-yellow-500/30 px-0.5 text-yellow-200">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

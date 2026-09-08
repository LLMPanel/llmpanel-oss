"use client"

import { useState } from "react"
import { Search, Loader2, FileText, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  searchRagCollection,
  type RagCollection,
  type RetrievalResult,
} from "@/hooks/use-rag"

// Retrieval playground: runs the exact search the LLM context (and the agent
// knowledge_search tool) would receive — no model call, just ranked chunks.
export function RetrievalTest({
  collection,
  deploymentId,
}: {
  collection: RagCollection
  deploymentId: string
}) {
  const [query, setQuery] = useState("")
  const [topK, setTopK] = useState(String(collection.topK))
  const [threshold, setThreshold] = useState(String(collection.scoreThreshold))
  const [showTuning, setShowTuning] = useState(false)
  const [results, setResults] = useState<RetrievalResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed || isSearching) return
    setIsSearching(true)
    setError(null)
    try {
      const hits = await searchRagCollection(deploymentId, collection.id, {
        query: trimmed,
        topK: Math.min(Math.max(Number(topK) || collection.topK, 1), 20),
        scoreThreshold: Math.min(Math.max(Number(threshold) || 0, 0), 1),
      })
      setResults(hits)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
      setResults(null)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Type a question to see which chunks would be retrieved…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
            className="text-sm"
          />
          <Button
            onClick={() => void runSearch()}
            disabled={!query.trim() || isSearching}
            size="sm"
            className="gap-1.5 shrink-0 h-9"
          >
            {isSearching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Search
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowTuning((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal className="size-3" />
          Tuning
          <span className="text-muted-foreground/60">
            (top {topK} · min score {threshold})
          </span>
        </button>

        {showTuning && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="rt-topk" className="text-xs">
                Top K
              </Label>
              <Input
                id="rt-topk"
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-threshold" className="text-xs">
                Score threshold
              </Label>
              <Input
                id="rt-threshold"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <p className="col-span-2 text-[10px] text-muted-foreground">
              Overrides apply to this test only. Save new defaults in Settings.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {results !== null && !error && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {results.length} chunk{results.length === 1 ? "" : "s"} retrieved
          </p>
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              Nothing above the score threshold. Try a different query or lower
              the threshold.
            </div>
          ) : (
            results.map((r, i) => <ResultCard key={r.chunkId} rank={i + 1} result={r} />)
          )}
        </div>
      )}

      {results === null && !error && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Search className="size-7 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground max-w-sm">
            Test retrieval quality without calling the model. Results show the
            similarity score and source document for each chunk.
          </p>
        </div>
      )}
    </div>
  )
}

function ResultCard({ rank, result }: { rank: number; result: RetrievalResult }) {
  const [expanded, setExpanded] = useState(false)
  const scorePct = Math.round(result.score * 100)

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium text-muted-foreground">
          {rank}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              result.score >= 0.7
                ? "bg-success"
                : result.score >= 0.45
                  ? "bg-warning"
                  : "bg-destructive"
            )}
            style={{ width: `${Math.max(scorePct, 4)}%` }}
          />
        </div>
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums">
          {result.score.toFixed(3)}
        </Badge>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="size-2.5" />
          chunk {result.chunkIndex}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-3"
        )}
      >
        {result.content}
      </p>
    </button>
  )
}

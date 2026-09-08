"use client"

import { ChevronLeft, ChevronRight, Zap, Radio } from "lucide-react"
import { motion } from "motion/react"
import type { RequestLog, LogPagination } from "@/hooks/use-logs"
import { cn } from "@/lib/utils"

// ── Shared glyphs ─────────────────────────────────────────────────────────────

export function StatusDot({ code, className }: { code: number; className?: string }) {
  const isSuccess = code >= 200 && code < 300
  const isClientErr = code >= 400 && code < 500
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        isSuccess ? "bg-success" : isClientErr ? "bg-warning" : "bg-destructive",
        className
      )}
    />
  )
}

function latencyLabel(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`
}

function latencyTone(ms: number) {
  return ms < 500 ? "text-foreground" : ms < 2000 ? "text-warning" : "text-destructive"
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString()
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-1.5 py-20 text-center">
      <Radio className="mb-1 size-7 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-[15px] font-semibold tracking-[-0.01em]">No Requests</p>
      <p className="text-[13px] text-muted-foreground">
        Widen the time range or clear the status filter.
      </p>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

const COLUMNS =
  "grid-cols-[88px_minmax(0,1.6fr)_minmax(0,1fr)_64px_76px_88px_minmax(0,0.9fr)_72px_20px]"

function Row({ log, index, onSelect }: { log: RequestLog; index: number; onSelect: () => void }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(index, 12) * 0.02 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group grid w-full items-center gap-3 px-4 py-2.5 text-left",
          COLUMNS,
          // Highlight on press, instantly; hover is the pointer-only hint.
          "transition-colors duration-100 hover:bg-muted/60 active:bg-muted",
          "focus-visible:outline-none focus-visible:bg-muted/60"
        )}
      >
        {/* Time */}
        <div className="min-w-0">
          <p className="text-[12px] font-medium tabular-nums">{relativeTime(log.createdAt)}</p>
          <p className="truncate text-[11px] tabular-nums text-muted-foreground">
            {new Date(log.createdAt).toLocaleTimeString()}
          </p>
        </div>

        {/* Method + path */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold tracking-[0.04em] text-muted-foreground">
              {log.method}
            </span>
            <span className="truncate font-mono text-[12px]">{log.path}</span>
          </div>
          {log.deploymentName && (
            <p className="truncate text-[11px] text-muted-foreground">{log.deploymentName}</p>
          )}
        </div>

        {/* Model */}
        <p className="truncate font-mono text-[12px] text-muted-foreground">
          {log.model ?? "—"}
        </p>

        {/* Status */}
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tabular-nums">
          <StatusDot code={log.statusCode} />
          {log.statusCode}
        </span>

        {/* Latency */}
        <span className={cn("text-[12px] tabular-nums", latencyTone(log.latencyMs))}>
          {latencyLabel(log.latencyMs)}
        </span>

        {/* Tokens */}
        {log.totalTokens != null ? (
          <div className="min-w-0">
            <p className="text-[12px] font-medium tabular-nums">{formatNum(log.totalTokens)}</p>
            <p className="truncate text-[11px] tabular-nums text-muted-foreground">
              {formatNum(log.promptTokens ?? 0)} in · {formatNum(log.completionTokens ?? 0)} out
            </p>
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        )}

        {/* API key */}
        {log.apiKeyName ? (
          <div className="min-w-0">
            <p className="truncate text-[12px]">{log.apiKeyName}</p>
            {log.apiKeyPrefix && (
              <p className="truncate font-mono text-[11px] text-muted-foreground">{log.apiKeyPrefix}</p>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        )}

        {/* Type */}
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium",
            log.isStreaming ? "text-primary" : "text-muted-foreground"
          )}
        >
          {log.isStreaming ? <Radio className="size-3" /> : <Zap className="size-3" />}
          {log.isStreaming ? "Stream" : "Sync"}
        </span>

        {/* Disclosure chevron — the universal "there's more here" */}
        <ChevronRight className="size-3.5 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </button>
    </motion.li>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

interface LogsTableProps {
  logs: RequestLog[]
  pagination: LogPagination | null
  isLoading: boolean
  onSelectLog: (log: RequestLog) => void
  onPageChange: (page: number) => void
}

export function LogsTable({
  logs,
  pagination,
  isLoading,
  onSelectLog,
  onPageChange,
}: LogsTableProps) {
  return (
    <section
      aria-label="Requests"
      className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          {/* Header */}
          <div
            className={cn(
              "grid items-center gap-3 border-b border-black/[0.06] px-4 py-2 text-[11px] font-medium text-muted-foreground dark:border-white/[0.06]",
              COLUMNS
            )}
          >
            <span>Time</span>
            <span>Request</span>
            <span>Model</span>
            <span>Status</span>
            <span>Latency</span>
            <span>Tokens</span>
            <span>API key</span>
            <span>Type</span>
            <span />
          </div>

          <ul
            className={cn(
              "divide-y divide-black/[0.05] transition-opacity duration-200 dark:divide-white/[0.05]",
              isLoading && "pointer-events-none opacity-40"
            )}
          >
            {logs.length === 0 && !isLoading ? (
              <li><EmptyState /></li>
            ) : (
              logs.map((log, i) => (
                <Row key={log.id} log={log} index={i} onSelect={() => onSelectLog(log)} />
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.06]">
          <p className="text-[12px] tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground">{pagination.total.toLocaleString()}</span>
          </p>
          <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-muted p-[3px]">
            <PagerButton
              label="Previous page"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </PagerButton>
            <span className="px-2 text-[12px] tabular-nums">
              {pagination.page} / {pagination.totalPages}
            </span>
            <PagerButton
              label="Next page"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              <ChevronRight className="size-3.5" />
            </PagerButton>
          </div>
        </div>
      )}
    </section>
  )
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded-[7px] transition-[transform,background-color] duration-100 hover:bg-card active:scale-[0.94] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

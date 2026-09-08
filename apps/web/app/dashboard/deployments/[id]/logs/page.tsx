"use client"

import { use, useState, useCallback } from "react"
import { MotionConfig } from "motion/react"
import { useLogs, fetchSingleLog, type LogFilters, type RequestLog } from "@/hooks/use-logs"
import { LogsFilters, type DatePreset, presetToRange } from "@/components/logs/logs-filters"
import { LogsStatsBar } from "@/components/logs/logs-stats-bar"
import { LogsTable } from "@/components/logs/logs-table"
import { LogDetailSheet } from "@/components/logs/log-detail-sheet"

// ── Local datetime string helpers ─────────────────────────────────────────────

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso)
  // format: YYYY-MM-DDTHH:mm  (as required by <input type="datetime-local">)
  return d.toISOString().slice(0, 16)
}

function fromLocalDatetimeValue(local: string): string {
  return new Date(local).toISOString()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  // Date preset state
  const [datePreset, setDatePreset] = useState<DatePreset>("24h")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  // Filters state — always pinned to this deployment
  const [filters, setFilters] = useState<LogFilters>(() => {
    const range = presetToRange("24h")
    return { deploymentId: id, from: range.from, to: range.to, page: 1, limit: 50 }
  })

  // Detail sheet state
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { logs, summary, pagination, isLoading, refetch } = useLogs(filters)

  // When preset changes, update from/to in filters
  const handlePresetChange = useCallback((preset: DatePreset) => {
    setDatePreset(preset)
    if (preset !== "custom") {
      const range = presetToRange(preset)
      setFilters((f) => ({ ...f, from: range.from, to: range.to, page: 1 }))
    } else {
      // Seed custom inputs with current range
      setCustomFrom(toLocalDatetimeValue(filters.from ?? new Date(Date.now() - 86400000).toISOString()))
      setCustomTo(toLocalDatetimeValue(filters.to ?? new Date().toISOString()))
    }
  }, [filters.from, filters.to])

  // When custom inputs change, update filters
  const handleCustomFromChange = useCallback((v: string) => {
    setCustomFrom(v)
    if (v) setFilters((f) => ({ ...f, from: fromLocalDatetimeValue(v), page: 1 }))
  }, [])

  const handleCustomToChange = useCallback((v: string) => {
    setCustomTo(v)
    if (v) setFilters((f) => ({ ...f, to: fromLocalDatetimeValue(v), page: 1 }))
  }, [])

  const handleFiltersChange = useCallback((partial: Partial<LogFilters>) => {
    // deploymentId stays pinned to the current deployment
    setFilters((f) => ({ ...f, ...partial, deploymentId: id }))
  }, [id])

  const handleSelectLog = useCallback((log: RequestLog) => {
    setSelectedLog(log)
    setSheetOpen(true)
    // The list omits request/response bodies — fetch the full log for the sheet.
    void fetchSingleLog(log.id)
      .then((full) => setSelectedLog((current) => (current?.id === log.id ? full : current)))
      .catch(() => { /* sheet still shows the summary fields */ })
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="space-y-5">
      {/* ── Large title: tight leading + negative tracking at display size ── */}
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Requests</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Every inference call this deployment served.
        </p>
      </header>

      {/* ── Filters ── */}
      <LogsFilters
        filters={filters}
        datePreset={datePreset}
        customFrom={customFrom}
        customTo={customTo}
        deployments={[]}
        onPresetChange={handlePresetChange}
        onCustomFromChange={handleCustomFromChange}
        onCustomToChange={handleCustomToChange}
        onFiltersChange={handleFiltersChange}
        onRefresh={refetch}
        isLoading={isLoading}
      />

      {/* ── Stats bar ── */}
      {summary && <LogsStatsBar summary={summary} />}

      {/* ── Table ── */}
      <LogsTable
        logs={logs}
        pagination={pagination}
        isLoading={isLoading}
        onSelectLog={handleSelectLog}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />

      {/* ── Detail sheet ── */}
      <LogDetailSheet
        log={selectedLog}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
    </MotionConfig>
  )
}
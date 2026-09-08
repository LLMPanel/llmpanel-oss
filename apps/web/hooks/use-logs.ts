"use client"

import { useState, useEffect, useCallback } from "react"

export interface RequestLog {
  id: string
  apiKeyId: string | null
  deploymentId: string | null
  userId: string | null
  method: string
  path: string
  ipAddress: string | null
  userAgent: string | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean | null
  createdAt: string
  // Full payloads — only present on the single-log endpoint (fetchSingleLog)
  requestBody?: string | null
  responseBody?: string | null
  // enriched
  deploymentName: string | null
  apiKeyName: string | null
  apiKeyPrefix: string | null
}

export interface LogSummary {
  totalRequests: number
  avgLatencyMs: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  successRate: number
}

export interface LogPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface LogFilters {
  deploymentId?: string
  apiKeyId?: string
  status?: "success" | "error"
  from?: string   // ISO date
  to?: string     // ISO date
  page?: number
  limit?: number
}

export function useLogs(filters: LogFilters) {
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [summary, setSummary] = useState<LogSummary | null>(null)
  const [pagination, setPagination] = useState<LogPagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.deploymentId) params.set("deploymentId", filters.deploymentId)
      if (filters.apiKeyId) params.set("apiKeyId", filters.apiKeyId)
      if (filters.status) params.set("status", filters.status)
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
      if (filters.page) params.set("page", String(filters.page))
      if (filters.limit) params.set("limit", String(filters.limit))

      const res = await globalThis.fetch(
        `/api/v1/analytics/requests?${params.toString()}`,
        { credentials: "include" }
      )
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? "Failed to fetch logs")
      }
      const data = (await res.json()) as {
        logs: RequestLog[]
        summary: LogSummary
        pagination: LogPagination
      }
      setLogs(data.logs)
      setSummary(data.summary)
      setPagination(data.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [
    filters.deploymentId,
    filters.apiKeyId,
    filters.status,
    filters.from,
    filters.to,
    filters.page,
    filters.limit,
  ])

  useEffect(() => { void load() }, [load])

  return { logs, summary, pagination, isLoading, error, refetch: load }
}

export async function fetchSingleLog(logId: string): Promise<RequestLog> {
  const res = await globalThis.fetch(`/api/v1/analytics/requests/${logId}`, {
    credentials: "include",
  })
  if (!res.ok) {
    const d = (await res.json()) as { error?: string }
    throw new Error(d.error ?? "Failed to fetch log")
  }
  const data = (await res.json()) as { log: RequestLog }
  return data.log
}

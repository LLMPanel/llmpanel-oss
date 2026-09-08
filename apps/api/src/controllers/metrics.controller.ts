// apps/api/src/controllers/metrics.controller.ts
import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { deployments, requestLogs, apiKeys } from "@llmpanel/db/schema"
import { createProvider } from "@llmpanel/providers"
import { resolveProvider } from "../services/deployment-provider.service"
import type { ProviderType } from "../services/deployment-provider.service"
import {
  getPeriodStart,
  getUsageByDay,
  aggregateTokenUsage,
  getModelBreakdown,
  getDeploymentInferenceStats,
  getDeploymentRequestSeries,
  getUsageWindowTotals,
  getLatencyPercentiles,
  getUsageSeries,
  getModelUsageBreakdown,
  getApiKeyUsageBreakdown,
  getMetricSamplesSeries,
  attachPerGpuSeries,
  PERIOD_MS,
  METRICS_WINDOWS,
  METRICS_WINDOW_MS,
  METRICS_BUCKET_SECONDS,
} from "../services/metrics.service"
import type { Period, UsageBucket, MetricsWindow } from "../services/metrics.service"
import { eq, and, gte, lte, count, sum, avg, desc, like, or, lt, gte as gteOp } from "drizzle-orm"
import { getWorkspaceId } from "../lib/workspace-context"

// ── GET /api/v1/deployments/:id/metrics ─────────────────────────────
export const getDeploymentMetrics = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.id, id),
      eq(deployments.workspaceId, workspaceId)
    ),
    with: { providerConnection: true },
  })

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404)
  }

  if (deployment.status !== "running" || !deployment.externalId) {
    // 409 (not 400) with the current status so the frontend can tell a
    // transitional state apart from a broken request.
    return c.json({ error: "Deployment is not running", status: deployment.status }, 409)
  }

  try {
    const provider = await resolveProvider(deployment)
    const metricsCtx = { metricsToken: deployment.metricsToken }
    const gpuMetrics = await provider.getMetrics(deployment.externalId, metricsCtx)

    // Also pull request stats from DB for last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const [requestStats] = await db
      .select({
        requestCount: count(),
        avgLatencyMs: avg(requestLogs.latencyMs),
        totalTokens: sum(requestLogs.totalTokens),
      })
      .from(requestLogs)
      .where(
        and(
          eq(requestLogs.deploymentId, id),
          gte(requestLogs.createdAt, fiveMinutesAgo)
        )
      )

    return c.json({
      capabilities: provider.getMetricsCapabilities(metricsCtx),
      metrics: {
        // GPU metrics (live from provider); null = provider can't report it
        gpuCount: gpuMetrics.gpuCount,
        gpuUtilization: gpuMetrics.gpuUtilization,
        vramUsedGb: gpuMetrics.vramUsedGb,
        vramTotalGb: gpuMetrics.vramTotalGb,
        vramUsedPercent: gpuMetrics.vramTotalGb > 0
          ? Math.round((gpuMetrics.vramUsedGb / gpuMetrics.vramTotalGb) * 100)
          : 0,
        temperatureCelsius: gpuMetrics.temperatureCelsius,
        powerDrawWatts: gpuMetrics.powerDrawWatts,

        // Container-level metrics (cloud providers)
        containerCpuPercent: gpuMetrics.containerCpuPercent ?? null,
        containerMemoryPercent: gpuMetrics.containerMemoryPercent ?? null,
        uptimeSeconds: gpuMetrics.uptimeSeconds ?? null,
        costPerHour: gpuMetrics.costPerHour ?? deployment.costPerHour ?? null,

        // Per-GPU detailed breakdown
        gpus: gpuMetrics.gpus ?? [],

        // Request stats (last 5 minutes from DB)
        requestsPerMinute: Math.round(Number(requestStats.requestCount) / 5),
        averageLatencyMs: Math.round(Number(requestStats.avgLatencyMs ?? 0)),
        tokensLastFiveMinutes: Number(requestStats.totalTokens ?? 0),
      },
    })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Failed to fetch metrics",
    }, 500)
  }
}

// ── GET /api/v1/metrics/deployments/:id/history ──────────────────────
// Bucketed time-series from metric_samples (written by the background
// collector). Available even for stopped deployments — history outlives
// the pod for the 24h retention window.

export const getDeploymentMetricsHistory = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const windowParam = c.req.query("window") ?? "1h"
  const window: MetricsWindow = METRICS_WINDOWS.includes(windowParam as MetricsWindow)
    ? (windowParam as MetricsWindow)
    : "1h"

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
    with: { providerConnection: true },
  })

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404)
  }

  // Capabilities are static per provider type — no network call. For
  // deployments whose key can't be resolved (e.g. connection deleted),
  // fall back to a keyless instantiation just to read capabilities.
  let capabilities
  const metricsCtx = { metricsToken: deployment.metricsToken }
  try {
    const provider = await resolveProvider(deployment)
    capabilities = provider.getMetricsCapabilities(metricsCtx)
  } catch {
    try {
      capabilities = createProvider(deployment.providerType as ProviderType, "capabilities-only")
        .getMetricsCapabilities(metricsCtx)
    } catch {
      capabilities = null
    }
  }

  const until = new Date()
  const since = new Date(until.getTime() - METRICS_WINDOW_MS[window])
  const bucketSeconds = METRICS_BUCKET_SECONDS[window]

  const points = await getMetricSamplesSeries(id, since, until, bucketSeconds)

  // Per-GPU series is opt-in — parsing gpus_json rows costs more than the
  // aggregate query and single-GPU deployments don't need it.
  if (c.req.query("perGpu") === "1") {
    await attachPerGpuSeries(id, since, until, bucketSeconds, points)
  }

  return c.json({
    history: {
      window,
      bucketSeconds,
      since: since.toISOString(),
      until: until.toISOString(),
      capabilities,
      points,
    },
  })
}

// ── GET /api/v1/metrics/deployments/:id/inference ────────────────────
// Real inference stats (last 24h, from request_logs) + a per-minute
// request/token series (last 30 min, gap-filled) for the overview charts.
// Sourced entirely from our gateway usage — works for every provider,
// including RunPod/Vast.ai where hardware GPU metrics aren't available.

const STATS_WINDOW_MS = 24 * 60 * 60 * 1000   // stat cards cover last 24h
const SERIES_MINUTES = 30                       // charts show last 30 min

// "YYYY-MM-DD HH:MM" in UTC — matches the SQLite strftime bucket keys.
function utcMinuteKey(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export const getDeploymentInference = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const id = c.req.param("id")

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
    columns: { id: true, createdAt: true },
  })

  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404)
  }

  const now = Date.now()
  const statsSince = new Date(now - STATS_WINDOW_MS)
  const seriesSince = new Date(now - SERIES_MINUTES * 60 * 1000)

  const [stats, series] = await Promise.all([
    getDeploymentInferenceStats(workspaceId, id, statsSince),
    getDeploymentRequestSeries(workspaceId, id, seriesSince),
  ])

  // Rates are averaged over the elapsed window, capped at 24h so a freshly
  // created deployment isn't divided by a full day of idle time.
  const createdMs = new Date(deployment.createdAt).getTime()
  const elapsedSec = Math.max(1, Math.min(STATS_WINDOW_MS, now - createdMs) / 1000)
  const requestsPerSecond = stats.totalRequests / elapsedSec
  const tokensPerSecond = stats.totalTokens / elapsedSec

  // Gap-fill: one aligned point per minute across the whole window, so the
  // chart is continuous even when some minutes had no traffic.
  const byBucket = new Map(series.map((b) => [b.bucket, b]))
  const nowMinute = Math.floor(now / 60000) * 60000
  const points = []
  for (let i = SERIES_MINUTES - 1; i >= 0; i--) {
    const t = nowMinute - i * 60000
    const b = byBucket.get(utcMinuteKey(t))
    points.push({
      t,
      successful: b?.successful ?? 0,
      failed: b?.failed ?? 0,
      input: b?.promptTokens ?? 0,
      output: b?.completionTokens ?? 0,
    })
  }

  return c.json({
    stats: {
      totalRequests: stats.totalRequests,
      successfulRequests: stats.successfulRequests,
      failedRequests: stats.failedRequests,
      errorRate: stats.totalRequests > 0
        ? (stats.failedRequests / stats.totalRequests) * 100
        : 0,
      requestsPerMinute: requestsPerSecond * 60,
      requestsPerSecond,
      inputTokens: stats.promptTokens,
      outputTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      tokensPerSecond,
      averageLatencyMs: stats.averageLatencyMs,
    },
    points,
  })
}

// ── GET /api/v1/analytics/overview ───────────────────────────────────
export const getAnalyticsOverview = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Active deployments count
  const activeDeployments = await db.query.deployments.findMany({
    where: and(
      eq(deployments.workspaceId, workspaceId),
      eq(deployments.status, "running")
    ),
    columns: { id: true, costPerHour: true },
  })

  // Today's request stats
  const [todayStats] = await db
    .select({
      totalRequests: count(),
      totalTokens: sum(requestLogs.totalTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.workspaceId, workspaceId),
        gte(requestLogs.createdAt, todayStart)
      )
    )

  // Estimated cost today
  const estimatedCostToday = activeDeployments.reduce((sum, d) => {
    return sum + (d.costPerHour ?? 0) * hoursRunningToday(d)
  }, 0)

  return c.json({
    overview: {
      activeDeployments: activeDeployments.length,
      totalRequestsToday: Number(todayStats.totalRequests),
      totalTokensToday: Number(todayStats.totalTokens ?? 0),
      averageLatencyMs: Math.round(Number(todayStats.avgLatencyMs ?? 0)),
      estimatedCostToday: Math.round(estimatedCostToday * 100) / 100,
    },
  })
}

// ── GET /api/v1/analytics/requests ───────────────────────────────────
export const getAnalyticsRequests = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const page = Number(c.req.query("page") ?? 1)
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200)
  const deploymentId = c.req.query("deploymentId")
  const apiKeyId = c.req.query("apiKeyId")
  const status = c.req.query("status") // "success" | "error" | undefined
  const from = c.req.query("from")     // ISO date string
  const to = c.req.query("to")         // ISO date string

  const offset = (page - 1) * limit

  const conditions = [eq(requestLogs.workspaceId, workspaceId)]
  if (deploymentId) conditions.push(eq(requestLogs.deploymentId, deploymentId))
  if (apiKeyId) conditions.push(eq(requestLogs.apiKeyId, apiKeyId))
  if (from) conditions.push(gte(requestLogs.createdAt, new Date(from)))
  if (to) conditions.push(lte(requestLogs.createdAt, new Date(to)))
  if (status === "success") {
    // statusCode 200–299
    conditions.push(gte(requestLogs.statusCode, 200))
    conditions.push(lt(requestLogs.statusCode, 300))
  } else if (status === "error") {
    conditions.push(gteOp(requestLogs.statusCode, 400))
  }

  const [logs, [{ total }], [summary]] = await Promise.all([
    db.query.requestLogs.findMany({
      where: and(...conditions),
      orderBy: [desc(requestLogs.createdAt)],
      limit,
      offset,
      // Bodies can be up to 100KB each — only the single-log endpoint returns them.
      columns: { requestBody: false, responseBody: false },
    }),
    db.select({ total: count() }).from(requestLogs).where(and(...conditions)),
    db
      .select({
        totalRequests: count(),
        avgLatencyMs: avg(requestLogs.latencyMs),
        totalTokens: sum(requestLogs.totalTokens),
        totalPromptTokens: sum(requestLogs.promptTokens),
        totalCompletionTokens: sum(requestLogs.completionTokens),
      })
      .from(requestLogs)
      .where(and(...conditions)),
  ])

  // Enrich with deployment + api key names
  const allDeployments = await db.query.deployments.findMany({
    where: eq(deployments.workspaceId, workspaceId),
    columns: { id: true, huggingfaceId: true },
    with: { model: { columns: { name: true } } },
  })
  const allApiKeys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.workspaceId, workspaceId),
    columns: { id: true, name: true, prefix: true },
  })

  const depMap = new Map(allDeployments.map((d) => [d.id, d]))
  const keyMap = new Map(allApiKeys.map((k) => [k.id, k]))

  const enriched = logs.map((log) => ({
    ...log,
    deploymentName: log.deploymentId ? (depMap.get(log.deploymentId)?.model?.name ?? null) : null,
    apiKeyName: log.apiKeyId ? (keyMap.get(log.apiKeyId)?.name ?? null) : null,
    apiKeyPrefix: log.apiKeyId ? (keyMap.get(log.apiKeyId)?.prefix ?? null) : null,
  }))

  const totalNum = Number(total)
  const successRate = totalNum > 0
    ? Math.round((logs.filter((l) => l.statusCode < 400).length / logs.length) * 100)
    : 100

  return c.json({
    logs: enriched,
    summary: {
      totalRequests: Number(summary.totalRequests),
      avgLatencyMs: Math.round(Number(summary.avgLatencyMs ?? 0)),
      totalTokens: Number(summary.totalTokens ?? 0),
      totalPromptTokens: Number(summary.totalPromptTokens ?? 0),
      totalCompletionTokens: Number(summary.totalCompletionTokens ?? 0),
      successRate,
    },
    pagination: {
      page,
      limit,
      total: totalNum,
      totalPages: Math.ceil(totalNum / limit),
    },
  })
}

// ── GET /api/v1/analytics/requests/:logId ────────────────────────────
export const getSingleLog = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const logId = c.req.param("logId")

  const log = await db.query.requestLogs.findFirst({
    where: and(eq(requestLogs.id, logId), eq(requestLogs.workspaceId, workspaceId)),
  })

  if (!log) return c.json({ error: "Log not found" }, 404)

  // Enrich with names
  const [dep, key] = await Promise.all([
    log.deploymentId
      ? db.query.deployments.findFirst({
          where: eq(deployments.id, log.deploymentId),
          columns: { id: true },
          with: { model: { columns: { name: true, slug: true } } },
        })
      : Promise.resolve(null),
    log.apiKeyId
      ? db.query.apiKeys.findFirst({
          where: eq(apiKeys.id, log.apiKeyId),
          columns: { id: true, name: true, prefix: true },
        })
      : Promise.resolve(null),
  ])

  return c.json({
    log: {
      ...log,
      deploymentName: dep?.model?.name ?? null,
      modelSlug: dep?.model?.slug ?? null,
      apiKeyName: key?.name ?? null,
      apiKeyPrefix: key?.prefix ?? null,
    },
  })
}

// ── GET /api/v1/analytics/usage ───────────────────────────────────────
const USAGE_PERIODS: readonly Period[] = ["24h", "7d", "30d", "90d"]

export const getAnalyticsUsage = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const periodParam = c.req.query("period") ?? "7d"
  const period: Period = USAGE_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "7d"
  const deploymentId = c.req.query("deploymentId")
  const apiKeyId = c.req.query("apiKeyId")

  const until = new Date()
  const since = getPeriodStart(period)
  const previousSince = new Date(since.getTime() - PERIOD_MS[period])
  const bucket: UsageBucket = period === "24h" ? "hour" : "day"

  const window = { workspaceId, since, deploymentId, apiKeyId }

  const previousWindow = { ...window, since: previousSince, until: since }

  const [totals, latency, previousTotals, previousLatency, series, byModel, byApiKey] =
    await Promise.all([
      getUsageWindowTotals(window),
      getLatencyPercentiles(window),
      getUsageWindowTotals(previousWindow),
      getLatencyPercentiles(previousWindow),
      getUsageSeries(window, bucket),
      getModelUsageBreakdown(window),
      // Breakdown always spans all keys — the apiKeyId filter applies to the
      // charts/totals, the table lets you compare keys side by side.
      getApiKeyUsageBreakdown({ workspaceId, since, deploymentId }),
    ])

  return c.json({
    usage: {
      period,
      bucket,
      since: since.toISOString(),
      until: until.toISOString(),
      previousSince: previousSince.toISOString(),
      totals: { ...totals, latency },
      previousTotals: { ...previousTotals, latency: previousLatency },
      series,
      byModel,
      byApiKey,
    },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────
function hoursRunningToday(deployment: { costPerHour: number | null }): number {
  // Rough estimate — assume running since start of today
  const now = new Date()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60)
}
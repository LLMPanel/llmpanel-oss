import { z } from "zod"
import { db } from "@llmpanel/db"
import { requestLogs, apiKeys, metricSamples } from "@llmpanel/db/schema"
import { eq, and, gte, count, sum, avg, sql, lt, isNotNull } from "drizzle-orm"

// ── Period Utilities ──────────────────────────────────────────────────

export type Period = "24h" | "7d" | "30d" | "90d"

export const PERIOD_MS: Record<Period, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
}

export function getPeriodStart(period: Period): Date {
  return new Date(Date.now() - PERIOD_MS[period])
}

// ── Token Usage Aggregation ───────────────────────────────────────────

export interface TokenUsageStats {
  totalRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageLatencyMs: number
}

export async function aggregateTokenUsage(
  workspaceId: string,
  since: Date,
  deploymentId?: string,
  apiKeyId?: string,
): Promise<TokenUsageStats> {
  const conditions = [
    eq(requestLogs.workspaceId, workspaceId),
    gte(requestLogs.createdAt, since),
    ...(deploymentId ? [eq(requestLogs.deploymentId, deploymentId)] : []),
    ...(apiKeyId ? [eq(requestLogs.apiKeyId, apiKeyId)] : []),
  ]

  const [stats] = await db
    .select({
      totalRequests: count(),
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(and(...conditions))

  return {
    totalRequests: Number(stats.totalRequests),
    totalTokens: Number(stats.totalTokens ?? 0),
    promptTokens: Number(stats.promptTokens ?? 0),
    completionTokens: Number(stats.completionTokens ?? 0),
    averageLatencyMs: Math.round(Number(stats.avgLatencyMs ?? 0)),
  }
}

// ── Daily Usage Breakdown (for charts) ───────────────────────────────

export interface DailyUsage {
  date: string          // "2025-03-01"
  requests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  errors: number
  avgLatencyMs: number
}

export async function getUsageByDay(
  workspaceId: string,
  since: Date,
  deploymentId?: string,
  apiKeyId?: string,
): Promise<DailyUsage[]> {
  // createdAt is epoch SECONDS (drizzle integer mode:"timestamp") — no /1000.
  const dateBucket = sql<string>`strftime('%Y-%m-%d', datetime(${requestLogs.createdAt}, 'unixepoch'))`

  const conditions = [
    eq(requestLogs.workspaceId, workspaceId),
    gte(requestLogs.createdAt, since),
    ...(deploymentId ? [eq(requestLogs.deploymentId, deploymentId)] : []),
    ...(apiKeyId ? [eq(requestLogs.apiKeyId, apiKeyId)] : []),
  ]

  const rows = await db
    .select({
      date: dateBucket,
      requests: count(),
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      errors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 ELSE 0 END)`,
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(and(...conditions))
    .groupBy(dateBucket)
    .orderBy(dateBucket)

  return rows.map((r) => ({
    date: r.date,
    requests: Number(r.requests),
    totalTokens: Number(r.totalTokens ?? 0),
    promptTokens: Number(r.promptTokens ?? 0),
    completionTokens: Number(r.completionTokens ?? 0),
    errors: Number(r.errors ?? 0),
    avgLatencyMs: Math.round(Number(r.avgLatencyMs ?? 0)),
  }))
}

// ── Model Breakdown ───────────────────────────────────────────────────

export interface ModelBreakdown {
  model: string
  requests: number
  totalTokens: number
}

export async function getModelBreakdown(
  workspaceId: string,
  since: Date,
  deploymentId?: string,
  apiKeyId?: string,
): Promise<ModelBreakdown[]> {
  const conditions = [
    eq(requestLogs.workspaceId, workspaceId),
    gte(requestLogs.createdAt, since),
    ...(deploymentId ? [eq(requestLogs.deploymentId, deploymentId)] : []),
    ...(apiKeyId ? [eq(requestLogs.apiKeyId, apiKeyId)] : []),
  ]

  const rows = await db
    .select({
      model: requestLogs.model,
      requests: count(),
      totalTokens: sum(requestLogs.totalTokens),
    })
    .from(requestLogs)
    .where(and(...conditions))
    .groupBy(requestLogs.model)
    .orderBy(sql`count() DESC`)

  return rows.map((r) => ({
    model: r.model ?? "unknown",
    requests: Number(r.requests),
    totalTokens: Number(r.totalTokens ?? 0),
  }))
}

// ── Deployment Inference Stats (totals with success/failed split) ─────
// Powers the deployment overview "Traffic" stat cards. Unlike
// aggregateTokenUsage, this splits requests into successful vs failed
// (statusCode < 400 vs >= 400 — matches the convention in getAnalyticsRequests).

export interface DeploymentInferenceStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageLatencyMs: number
}

export async function getDeploymentInferenceStats(
  workspaceId: string,
  deploymentId: string,
  since: Date,
): Promise<DeploymentInferenceStats> {
  const [stats] = await db
    .select({
      totalRequests: count(),
      successfulRequests: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} < 400 THEN 1 ELSE 0 END)`,
      failedRequests: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 ELSE 0 END)`,
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.workspaceId, workspaceId),
        eq(requestLogs.deploymentId, deploymentId),
        gte(requestLogs.createdAt, since),
      ),
    )

  return {
    totalRequests: Number(stats.totalRequests),
    successfulRequests: Number(stats.successfulRequests ?? 0),
    failedRequests: Number(stats.failedRequests ?? 0),
    totalTokens: Number(stats.totalTokens ?? 0),
    promptTokens: Number(stats.promptTokens ?? 0),
    completionTokens: Number(stats.completionTokens ?? 0),
    averageLatencyMs: Math.round(Number(stats.avgLatencyMs ?? 0)),
  }
}

// ── Per-minute Request Series (for the live overview charts) ──────────
// Buckets request_logs by UTC minute (strftime, matching getUsageByDay's
// day bucketing). Rows are sparse — minutes with no traffic are absent and
// are gap-filled by the caller.

export interface RequestMinuteBucket {
  bucket: string        // "2025-03-01 14:23" (UTC, minute precision)
  successful: number
  failed: number
  promptTokens: number
  completionTokens: number
}

export async function getDeploymentRequestSeries(
  workspaceId: string,
  deploymentId: string,
  since: Date,
): Promise<RequestMinuteBucket[]> {
  const minuteBucket = sql<string>`strftime('%Y-%m-%d %H:%M', datetime(${requestLogs.createdAt}, 'unixepoch'))`

  const rows = await db
    .select({
      bucket: minuteBucket,
      successful: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} < 400 THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 ELSE 0 END)`,
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
    })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.workspaceId, workspaceId),
        eq(requestLogs.deploymentId, deploymentId),
        gte(requestLogs.createdAt, since),
      ),
    )
    .groupBy(minuteBucket)
    .orderBy(minuteBucket)

  return rows.map((r) => ({
    bucket: r.bucket,
    successful: Number(r.successful ?? 0),
    failed: Number(r.failed ?? 0),
    promptTokens: Number(r.promptTokens ?? 0),
    completionTokens: Number(r.completionTokens ?? 0),
  }))
}

// ── Usage Page Aggregations ───────────────────────────────────────────
// Powers GET /api/v1/analytics/usage. Kept separate from the older
// aggregate helpers above (still used by the overview endpoint) so the
// usage page can evolve independently.

export type UsageBucket = "hour" | "day"

interface UsageFilter {
  workspaceId: string
  since: Date
  /** Exclusive upper bound — used to query the previous comparison window. */
  until?: Date
  deploymentId?: string
  apiKeyId?: string
}

function usageConditions({ workspaceId, since, until, deploymentId, apiKeyId }: UsageFilter) {
  return [
    eq(requestLogs.workspaceId, workspaceId),
    gte(requestLogs.createdAt, since),
    ...(until ? [lt(requestLogs.createdAt, until)] : []),
    ...(deploymentId ? [eq(requestLogs.deploymentId, deploymentId)] : []),
    ...(apiKeyId ? [eq(requestLogs.apiKeyId, apiKeyId)] : []),
  ]
}

export interface UsageWindowTotals {
  totalRequests: number
  successfulRequests: number
  clientErrors: number
  serverErrors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  averageLatencyMs: number
  /** Generation throughput: completion tokens ÷ wall time of the requests that produced them. */
  tokensPerSecond: number
}

export async function getUsageWindowTotals(filter: UsageFilter): Promise<UsageWindowTotals> {
  const [row] = await db
    .select({
      totalRequests: count(),
      successfulRequests: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} < 400 THEN 1 ELSE 0 END)`,
      clientErrors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 AND ${requestLogs.statusCode} < 500 THEN 1 ELSE 0 END)`,
      serverErrors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 500 THEN 1 ELSE 0 END)`,
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
      completionLatencyMs: sql<number>`SUM(CASE WHEN ${requestLogs.completionTokens} > 0 THEN ${requestLogs.latencyMs} ELSE 0 END)`,
    })
    .from(requestLogs)
    .where(and(...usageConditions(filter)))

  const completionTokens = Number(row.completionTokens ?? 0)
  const completionLatencyMs = Number(row.completionLatencyMs ?? 0)

  return {
    totalRequests: Number(row.totalRequests),
    successfulRequests: Number(row.successfulRequests ?? 0),
    clientErrors: Number(row.clientErrors ?? 0),
    serverErrors: Number(row.serverErrors ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
    promptTokens: Number(row.promptTokens ?? 0),
    completionTokens,
    averageLatencyMs: Math.round(Number(row.avgLatencyMs ?? 0)),
    tokensPerSecond: completionLatencyMs > 0
      ? Math.round((completionTokens / (completionLatencyMs / 1000)) * 10) / 10
      : 0,
  }
}

export interface LatencyPercentiles {
  p50: number
  p95: number
  p99: number
}

// SQLite has no percentile aggregate — pick the value at the target rank
// with ORDER BY + OFFSET. One COUNT plus one row-lookup per percentile.
export async function getLatencyPercentiles(filter: UsageFilter): Promise<LatencyPercentiles> {
  const conditions = and(...usageConditions(filter))

  const [{ n }] = await db
    .select({ n: count() })
    .from(requestLogs)
    .where(conditions)

  const total = Number(n)
  if (total === 0) return { p50: 0, p95: 0, p99: 0 }

  const valueAt = async (fraction: number): Promise<number> => {
    const rank = Math.min(total - 1, Math.floor(fraction * total))
    const [row] = await db
      .select({ v: requestLogs.latencyMs })
      .from(requestLogs)
      .where(conditions)
      .orderBy(requestLogs.latencyMs)
      .limit(1)
      .offset(rank)
    return Number(row?.v ?? 0)
  }

  const [p50, p95, p99] = await Promise.all([valueAt(0.5), valueAt(0.95), valueAt(0.99)])
  return { p50, p95, p99 }
}

export interface UsageSeriesPoint {
  /** Bucket start as UTC ISO string, e.g. "2026-07-04T13:00:00.000Z" */
  bucket: string
  requests: number
  successful: number
  clientErrors: number
  serverErrors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

const BUCKET_FORMAT: Record<UsageBucket, string> = {
  hour: "%Y-%m-%dT%H:00:00.000Z",
  day: "%Y-%m-%dT00:00:00.000Z",
}

const BUCKET_MS: Record<UsageBucket, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
}

function floorToBucket(date: Date, bucket: UsageBucket): Date {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  if (bucket === "day") d.setUTCHours(0)
  return d
}

/**
 * Time series of usage, gap-filled: buckets with no traffic are returned
 * as zero rows so charts show quiet periods instead of skipping them.
 */
export async function getUsageSeries(
  filter: UsageFilter,
  bucket: UsageBucket,
): Promise<UsageSeriesPoint[]> {
  const bucketExpr = sql<string>`strftime(${BUCKET_FORMAT[bucket]}, datetime(${requestLogs.createdAt}, 'unixepoch'))`

  const rows = await db
    .select({
      bucket: bucketExpr,
      requests: count(),
      successful: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} < 400 THEN 1 ELSE 0 END)`,
      clientErrors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 AND ${requestLogs.statusCode} < 500 THEN 1 ELSE 0 END)`,
      serverErrors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 500 THEN 1 ELSE 0 END)`,
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(and(...usageConditions(filter)))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr)

  const byBucket = new Map(rows.map((r) => [r.bucket, r]))

  const points: UsageSeriesPoint[] = []
  const end = filter.until ?? new Date()
  for (
    let t = floorToBucket(filter.since, bucket).getTime();
    t <= end.getTime();
    t += BUCKET_MS[bucket]
  ) {
    const iso = new Date(t).toISOString()
    const row = byBucket.get(iso)
    points.push({
      bucket: iso,
      requests: Number(row?.requests ?? 0),
      successful: Number(row?.successful ?? 0),
      clientErrors: Number(row?.clientErrors ?? 0),
      serverErrors: Number(row?.serverErrors ?? 0),
      totalTokens: Number(row?.totalTokens ?? 0),
      promptTokens: Number(row?.promptTokens ?? 0),
      completionTokens: Number(row?.completionTokens ?? 0),
      avgLatencyMs: Math.round(Number(row?.avgLatencyMs ?? 0)),
    })
  }
  return points
}

export interface ModelUsageBreakdown {
  model: string
  requests: number
  errors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

export async function getModelUsageBreakdown(filter: UsageFilter): Promise<ModelUsageBreakdown[]> {
  const rows = await db
    .select({
      model: requestLogs.model,
      requests: count(),
      errors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 ELSE 0 END)`,
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .where(and(...usageConditions(filter)))
    .groupBy(requestLogs.model)
    .orderBy(sql`count() DESC`)

  return rows.map((r) => ({
    model: r.model ?? "unknown",
    requests: Number(r.requests),
    errors: Number(r.errors ?? 0),
    totalTokens: Number(r.totalTokens ?? 0),
    promptTokens: Number(r.promptTokens ?? 0),
    completionTokens: Number(r.completionTokens ?? 0),
    avgLatencyMs: Math.round(Number(r.avgLatencyMs ?? 0)),
  }))
}

export interface ApiKeyUsageBreakdown {
  apiKeyId: string | null
  /** Key name at query time — null when the key row no longer exists. */
  name: string | null
  prefix: string | null
  requests: number
  errors: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
}

export async function getApiKeyUsageBreakdown(
  filter: Omit<UsageFilter, "apiKeyId">,
): Promise<ApiKeyUsageBreakdown[]> {
  const rows = await db
    .select({
      apiKeyId: requestLogs.apiKeyId,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      requests: count(),
      errors: sql<number>`SUM(CASE WHEN ${requestLogs.statusCode} >= 400 THEN 1 ELSE 0 END)`,
      totalTokens: sum(requestLogs.totalTokens),
      promptTokens: sum(requestLogs.promptTokens),
      completionTokens: sum(requestLogs.completionTokens),
      avgLatencyMs: avg(requestLogs.latencyMs),
    })
    .from(requestLogs)
    .leftJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
    .where(and(...usageConditions(filter)))
    .groupBy(requestLogs.apiKeyId)
    .orderBy(sql`count() DESC`)

  return rows.map((r) => ({
    apiKeyId: r.apiKeyId,
    name: r.name,
    prefix: r.prefix,
    requests: Number(r.requests),
    errors: Number(r.errors ?? 0),
    totalTokens: Number(r.totalTokens ?? 0),
    promptTokens: Number(r.promptTokens ?? 0),
    completionTokens: Number(r.completionTokens ?? 0),
    avgLatencyMs: Math.round(Number(r.avgLatencyMs ?? 0)),
  }))
}

// ── GPU Metrics History (from metric_samples) ────────────────────────
// Powers GET /api/v1/metrics/deployments/:id/history. Samples are written
// by the background collector (~20s); here they are averaged into fixed
// buckets and gap-filled with nulls so charts show real gaps (collector
// down, deployment stopped) instead of interpolating across them.

export type MetricsWindow = "1h" | "6h" | "24h"

export const METRICS_WINDOWS: readonly MetricsWindow[] = ["1h", "6h", "24h"]

export const METRICS_WINDOW_MS: Record<MetricsWindow, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
}

// 1h keeps raw collector resolution; longer windows downsample.
export const METRICS_BUCKET_SECONDS: Record<MetricsWindow, number> = {
  "1h": 20,
  "6h": 120,
  "24h": 300,
}

export interface MetricsHistoryPoint {
  /** Bucket start, epoch ms (recharts numeric X axis). */
  t: number
  gpuUtilization: number | null
  vramUsedGb: number | null
  vramTotalGb: number | null
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  containerCpuPercent: number | null
  containerMemoryPercent: number | null
  /** Collector samples aggregated into this bucket — 0 marks a gap. */
  samples: number
  /** Per-GPU bucket averages — only populated when requested (?perGpu=1). */
  gpus?: PerGpuHistoryPoint[]
}

export interface PerGpuHistoryPoint {
  index: number
  gpuUtilization: number | null
  vramUsedGb: number | null
  temperatureCelsius: number | null
  powerDrawWatts: number | null
  clockSmMhz: number | null
}

export async function getMetricSamplesSeries(
  deploymentId: string,
  since: Date,
  until: Date,
  bucketSeconds: number,
): Promise<MetricsHistoryPoint[]> {
  // timestamp is epoch SECONDS; integer division floors to the bucket start.
  // bucketSeconds is inlined (not bound) — bound number params arrive as
  // REAL, turning this into float division and misaligning bucket keys.
  const bucketLiteral = sql.raw(String(Math.max(1, Math.floor(bucketSeconds))))
  const bucketExpr = sql<number>`(${metricSamples.timestamp} / ${bucketLiteral}) * ${bucketLiteral}`

  const rows = await db
    .select({
      bucket: bucketExpr,
      gpuUtilization: avg(metricSamples.gpuUtilization),
      vramUsedGb: avg(metricSamples.vramUsedGb),
      vramTotalGb: sql<number>`MAX(${metricSamples.vramTotalGb})`,
      temperatureCelsius: avg(metricSamples.temperatureCelsius),
      powerDrawWatts: avg(metricSamples.powerDrawWatts),
      containerCpuPercent: avg(metricSamples.containerCpuPercent),
      containerMemoryPercent: avg(metricSamples.containerMemoryPercent),
      samples: count(),
    })
    .from(metricSamples)
    .where(
      and(
        eq(metricSamples.deploymentId, deploymentId),
        gte(metricSamples.timestamp, since),
        lt(metricSamples.timestamp, until),
      ),
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr)

  const num = (v: string | number | null): number | null =>
    v == null ? null : Math.round(Number(v) * 10) / 10

  const byBucket = new Map(rows.map((r) => [Number(r.bucket), r]))

  const points: MetricsHistoryPoint[] = []
  const sinceSec = Math.floor(since.getTime() / 1000 / bucketSeconds) * bucketSeconds
  const untilSec = Math.floor(until.getTime() / 1000)
  for (let t = sinceSec; t < untilSec; t += bucketSeconds) {
    const row = byBucket.get(t)
    points.push({
      t: t * 1000,
      gpuUtilization: num(row?.gpuUtilization ?? null),
      vramUsedGb: num(row?.vramUsedGb ?? null),
      vramTotalGb: num(row?.vramTotalGb ?? null),
      temperatureCelsius: num(row?.temperatureCelsius ?? null),
      powerDrawWatts: num(row?.powerDrawWatts ?? null),
      containerCpuPercent: num(row?.containerCpuPercent ?? null),
      containerMemoryPercent: num(row?.containerMemoryPercent ?? null),
      samples: Number(row?.samples ?? 0),
    })
  }
  return points
}

// ── Per-GPU history (from metric_samples.gpus_json) ─────────────────
// The collector stores the full per-GPU snapshot as JSON on every sample.
// SQLite can't aggregate inside JSON arrays sensibly, so raw rows are pulled
// (≤4320 at 24h/20s cadence) and averaged per (bucket, gpuIndex) in JS.
// Only fetched when the client asks (?perGpu=1) — single-GPU deployments
// gain nothing from it.

const StoredGpuSchema = z.object({
  index: z.number(),
  gpuUtilization: z.number(),
  vramUsedGb: z.number(),
  temperatureCelsius: z.number().nullable().optional(),
  powerDrawWatts: z.number().nullable().optional(),
  clockSmMhz: z.number().nullable().optional(),
})

export async function attachPerGpuSeries(
  deploymentId: string,
  since: Date,
  until: Date,
  bucketSeconds: number,
  points: MetricsHistoryPoint[],
): Promise<void> {
  const rows = await db
    .select({ timestamp: metricSamples.timestamp, gpusJson: metricSamples.gpusJson })
    .from(metricSamples)
    .where(
      and(
        eq(metricSamples.deploymentId, deploymentId),
        gte(metricSamples.timestamp, since),
        lt(metricSamples.timestamp, until),
        isNotNull(metricSamples.gpusJson),
      ),
    )

  if (rows.length === 0) return

  type Acc = { n: number; util: number; vram: number; temp: number; tempN: number; power: number; powerN: number; clock: number; clockN: number }
  // bucket epoch-seconds -> gpu index -> accumulator
  const acc = new Map<number, Map<number, Acc>>()

  for (const row of rows) {
    if (!row.gpusJson) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(row.gpusJson)
    } catch {
      continue
    }
    const gpus = z.array(StoredGpuSchema.loose()).safeParse(parsed)
    if (!gpus.success) continue

    const tSec = Math.floor(row.timestamp.getTime() / 1000 / bucketSeconds) * bucketSeconds
    let byGpu = acc.get(tSec)
    if (!byGpu) { byGpu = new Map(); acc.set(tSec, byGpu) }

    for (const g of gpus.data) {
      let a = byGpu.get(g.index)
      if (!a) { a = { n: 0, util: 0, vram: 0, temp: 0, tempN: 0, power: 0, powerN: 0, clock: 0, clockN: 0 }; byGpu.set(g.index, a) }
      a.n += 1
      a.util += g.gpuUtilization
      a.vram += g.vramUsedGb
      if (g.temperatureCelsius != null) { a.temp += g.temperatureCelsius; a.tempN += 1 }
      if (g.powerDrawWatts != null) { a.power += g.powerDrawWatts; a.powerN += 1 }
      if (g.clockSmMhz != null) { a.clock += g.clockSmMhz; a.clockN += 1 }
    }
  }

  const round1 = (v: number): number => Math.round(v * 10) / 10

  for (const point of points) {
    const byGpu = acc.get(point.t / 1000)
    if (!byGpu) continue
    point.gpus = [...byGpu.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, a]) => ({
        index,
        gpuUtilization: round1(a.util / a.n),
        vramUsedGb: round1(a.vram / a.n),
        temperatureCelsius: a.tempN > 0 ? round1(a.temp / a.tempN) : null,
        powerDrawWatts: a.powerN > 0 ? round1(a.power / a.powerN) : null,
        clockSmMhz: a.clockN > 0 ? round1(a.clock / a.clockN) : null,
      }))
  }
}

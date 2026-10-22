// Background GPU-metrics collector.
//
// Samples every running deployment's provider on a fixed interval and
// persists the snapshot into `metric_samples`, powering the metrics
// history charts. Rows older than the retention window are pruned
// periodically — telemetry is ephemeral, no soft delete.
import { eq, lt, and, isNotNull } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { deployments, metricSamples } from "@llmpanel/db/schema"
import { resolveProvider } from "./deployment-provider.service"

const COLLECT_INTERVAL_MS = 20_000
const SAMPLE_TIMEOUT_MS = 15_000
const PRUNE_INTERVAL_MS = 10 * 60_000
const RETENTION_MS = 24 * 60 * 60 * 1000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) },
    )
  })
}

class MetricsCollector {
  private collectTimer: NodeJS.Timeout | null = null
  private pruneTimer: NodeJS.Timeout | null = null
  private collecting = false
  // Deployments that failed last tick — logged once on state change, not every 20s.
  private failing = new Set<string>()

  start(): void {
    if (this.collectTimer) return
    this.collectTimer = setInterval(() => void this.collectOnce(), COLLECT_INTERVAL_MS)
    this.pruneTimer = setInterval(() => void this.pruneOnce(), PRUNE_INTERVAL_MS)
    void this.collectOnce()
    void this.pruneOnce()
    console.log("[MetricsCollector] Started (interval 20s, retention 24h)")
  }

  stop(): void {
    if (this.collectTimer) { clearInterval(this.collectTimer); this.collectTimer = null }
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = null }
    console.log("[MetricsCollector] Stopped")
  }

  private async collectOnce(): Promise<void> {
    if (this.collecting) return
    this.collecting = true
    try {
      const running = await db.query.deployments.findMany({
        where: and(eq(deployments.status, "running"), isNotNull(deployments.externalId)),
        columns: { id: true, externalId: true, providerType: true, providerConnectionId: true, metricsToken: true, inferenceEngine: true },
      })

      await Promise.allSettled(running.map((dep) => this.sampleDeployment(dep)))
    } catch (error) {
      console.warn(`[MetricsCollector] Tick failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.collecting = false
    }
  }

  private async sampleDeployment(dep: {
    id: string
    externalId: string | null
    providerType: string
    providerConnectionId: string | null
    metricsToken: string | null
    inferenceEngine: string
  }): Promise<void> {
    if (!dep.externalId) return
    try {
      const provider = await resolveProvider(dep)
      const metricsCtx = { metricsToken: dep.metricsToken, inferenceEngine: dep.inferenceEngine }

      // Providers with no metrics API (Vast.ai, Hot Aisle, ...) would throw
      // every tick — skip them outright.
      const caps = provider.getMetricsCapabilities(metricsCtx)
      if (!caps.gpuUtilization && !caps.vram && !caps.container) return

      const m = await withTimeout(provider.getMetrics(dep.externalId, metricsCtx), SAMPLE_TIMEOUT_MS)

      await db.insert(metricSamples).values({
        id: crypto.randomUUID(),
        deploymentId: dep.id,
        timestamp: new Date(),
        gpuCount: m.gpuCount,
        gpuUtilization: m.gpuUtilization,
        vramUsedGb: m.vramUsedGb,
        vramTotalGb: m.vramTotalGb,
        temperatureCelsius: m.temperatureCelsius,
        powerDrawWatts: m.powerDrawWatts,
        containerCpuPercent: m.containerCpuPercent ?? null,
        containerMemoryPercent: m.containerMemoryPercent ?? null,
        uptimeSeconds: m.uptimeSeconds ?? null,
        gpusJson: m.gpus ? JSON.stringify(m.gpus) : null,
      })

      if (this.failing.delete(dep.id)) {
        console.log(`[MetricsCollector] ${dep.id}: recovered`)
      }
    } catch (error) {
      // No row on failure — gaps in the series are meaningful.
      if (!this.failing.has(dep.id)) {
        this.failing.add(dep.id)
        console.warn(
          `[MetricsCollector] ${dep.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  private async pruneOnce(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - RETENTION_MS)
      await db.delete(metricSamples).where(lt(metricSamples.timestamp, cutoff))
    } catch (error) {
      console.warn(`[MetricsCollector] Prune failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export const metricsCollector = new MetricsCollector()

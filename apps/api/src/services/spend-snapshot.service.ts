// Background spend snapshot collector.
//
// Provider APIs only report the *current* burn rate, so a spend-over-time
// chart needs someone to write history down. This service periodically walks
// every active cloud provider connection, fetches its live stats, and records
// one spend_snapshots row per connection. Telemetry-style soft-fail: one
// provider's API blip must never block the others or crash the loop.
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { providerConnections, spendSnapshots } from "@llmpanel/db/schema"
import { decrypt, aadFor } from "./encryption.service"
import {
  fetchStatsForProvider,
  isStatsCapableProvider,
  STATS_CAPABLE_PROVIDERS,
} from "./provider-stats.service"

const COLLECT_INTERVAL_MS = 30 * 60_000
const RETENTION_DAYS = 90

class SpendSnapshotCollector {
  private timer: NodeJS.Timeout | null = null
  private collecting = false

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.collectOnce(), COLLECT_INTERVAL_MS)
    void this.collectOnce()
    console.log("[SpendSnapshots] Started (interval 30m)")
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    console.log("[SpendSnapshots] Stopped")
  }

  private async collectOnce(): Promise<void> {
    if (this.collecting) return
    this.collecting = true
    try {
      const connections = await db.query.providerConnections.findMany({
        where: and(
          eq(providerConnections.isActive, true),
          inArray(providerConnections.providerType, [...STATS_CAPABLE_PROVIDERS]),
          isNotNull(providerConnections.encryptedApiKey),
        ),
      })

      const now = new Date()
      for (const conn of connections) {
        if (!conn.encryptedApiKey || !isStatsCapableProvider(conn.providerType)) continue
        try {
          const apiKey = await decrypt(conn.encryptedApiKey, aadFor.providerApiKey(conn.id))
          const stats = await fetchStatsForProvider(conn.providerType, apiKey)
          await db.insert(spendSnapshots).values({
            id: crypto.randomUUID(),
            userId: conn.userId,
            workspaceId: conn.workspaceId,
            providerConnectionId: conn.id,
            providerType: stats.providerType,
            timestamp: now,
            costPerHour: stats.totalCostPerHour,
            balance: stats.balance,
            runningInstances: stats.runningInstances,
            totalInstances: stats.totalInstances,
          })
        } catch (e) {
          console.warn(
            `[SpendSnapshots] ${conn.providerType} (${conn.id}) skipped:`,
            e instanceof Error ? e.message : e,
          )
        }
      }

      await this.pruneOld()
    } catch (e) {
      console.error("[SpendSnapshots] collect failed:", e)
    } finally {
      this.collecting = false
    }
  }

  private async pruneOld(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000)
    await db.delete(spendSnapshots).where(lt(spendSnapshots.timestamp, cutoff))
  }
}

export const spendSnapshotCollector = new SpendSnapshotCollector()

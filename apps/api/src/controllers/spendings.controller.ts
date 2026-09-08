import type { Context } from "hono"
import { db } from "@llmpanel/db"
import { spendSnapshots } from "@llmpanel/db/schema"
import { and, eq, gte, asc } from "drizzle-orm"
import { getWorkspaceId } from "../lib/workspace-context"

export interface SpendSnapshotPoint {
  providerConnectionId: string
  providerType: string
  timestamp: string // ISO
  costPerHour: number
  balance: number | null
  runningInstances: number
  totalInstances: number
}

const MAX_RANGE_DAYS = 90

// GET /api/v1/spendings/history?days=7
// Raw per-provider snapshots in range, oldest first. The frontend buckets
// them into chart points — the row cadence (~30min) is small enough that
// shipping raw rows keeps this endpoint dumb.
export const getSpendHistory = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const daysParam = Number(c.req.query("days") ?? 7)
  const days = Number.isFinite(daysParam)
    ? Math.min(Math.max(daysParam, 1), MAX_RANGE_DAYS)
    : 7

  const since = new Date(Date.now() - days * 24 * 60 * 60_000)

  const rows = await db
    .select()
    .from(spendSnapshots)
    .where(and(eq(spendSnapshots.workspaceId, workspaceId), gte(spendSnapshots.timestamp, since)))
    .orderBy(asc(spendSnapshots.timestamp))

  const snapshots: SpendSnapshotPoint[] = rows.map((r) => ({
    providerConnectionId: r.providerConnectionId,
    providerType: r.providerType,
    timestamp: r.timestamp.toISOString(),
    costPerHour: r.costPerHour,
    balance: r.balance,
    runningInstances: r.runningInstances,
    totalInstances: r.totalInstances,
  }))

  return c.json({ days, snapshots })
}

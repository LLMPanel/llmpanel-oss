import type { SpendSnapshotPoint } from "@/hooks/use-spend-history"

// The collector writes one row per provider connection every ~30 minutes.
// Accumulated spend = integral of $/hr over the range: each snapshot's rate
// is assumed to hold until that connection's next snapshot. The gap is capped
// at 1.5× the cadence so collector downtime never fabricates spend.
const CADENCE_MS = 30 * 60_000
const MAX_GAP_MS = CADENCE_MS * 1.5
const HOUR_MS = 3_600_000

export function integrateSpend(
  snapshots: SpendSnapshotPoint[],
  now: number = Date.now(),
): number {
  const byConnection = new Map<string, SpendSnapshotPoint[]>()
  for (const s of snapshots) {
    const list = byConnection.get(s.providerConnectionId)
    if (list) list.push(s)
    else byConnection.set(s.providerConnectionId, [s])
  }

  let totalUsd = 0
  for (const list of byConnection.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    for (let i = 0; i < sorted.length; i++) {
      const t = new Date(sorted[i].timestamp).getTime()
      const next = i + 1 < sorted.length ? new Date(sorted[i + 1].timestamp).getTime() : now
      const dtMs = Math.min(Math.max(next - t, 0), MAX_GAP_MS)
      totalUsd += sorted[i].costPerHour * (dtMs / HOUR_MS)
    }
  }
  return totalUsd
}

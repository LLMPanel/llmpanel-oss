// Background status reconciler.
//
// The DB `deployments.status` column is only written during provisioning and
// by explicit user actions, so it drifts from reality: a pod that outlives a
// health-check timeout stays "failed" forever, and a pod that dies on the
// provider side stays "running". This service periodically compares the DB
// status against the provider's live view and repairs the drift, which in
// turn lets the metrics collector (which only samples "running" rows) do its
// job. Telemetry-style soft-fail: a provider API blip must never rewrite
// status.
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { deployments } from "@llmpanel/db/schema"
import type { DeploymentInfo } from "@llmpanel/providers"
import { resolveProvider } from "./deployment-provider.service"
import { activeProvisioning } from "./deployment.service"
import { fireDeploymentAlert } from "./alert.service"
import { env } from "../env"

const RECONCILE_INTERVAL_MS = 45_000
const INFO_TIMEOUT_MS = 10_000
const HEALTH_TIMEOUT_MS = 5_000

// "stopped" is deliberately absent — a user-paused pod must never resurrect.
const RECONCILABLE = [
  "running",
  "failed",
  "provisioning",
  "downloading",
  "loading",
  "health_check",
] as const

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) },
    )
  })
}

async function probeHealth(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

type ReconcilableRow = {
  id: string
  externalId: string | null
  providerType: string
  providerConnectionId: string | null
  status: string
  costPerHour: number | null
  startedAt: Date | null
}

class StatusReconciler {
  private timer: NodeJS.Timeout | null = null
  private reconciling = false

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.reconcileOnce(), RECONCILE_INTERVAL_MS)
    void this.reconcileOnce()
    console.log("[StatusReconciler] Started (interval 45s)")
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    console.log("[StatusReconciler] Stopped")
  }

  private async reconcileOnce(): Promise<void> {
    // The mock provider always reports "running" — reconciling against it
    // would fight the mock provisioning flow.
    if (env.MOCK_DEPLOYMENT) return
    if (this.reconciling) return
    this.reconciling = true
    try {
      const rows = await db.query.deployments.findMany({
        where: and(
          inArray(deployments.status, [...RECONCILABLE]),
          isNotNull(deployments.externalId),
        ),
        columns: {
          id: true,
          externalId: true,
          providerType: true,
          providerConnectionId: true,
          status: true,
          costPerHour: true,
          startedAt: true,
        },
      })

      await Promise.allSettled(rows.map((dep) => this.reconcileOne(dep)))
    } catch (error) {
      console.warn(`[StatusReconciler] Tick failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.reconciling = false
    }
  }

  private async reconcileOne(dep: ReconcilableRow): Promise<void> {
    if (!dep.externalId) return
    // An in-flight provisionDeployment owns this row's status — hands off.
    if (activeProvisioning.has(dep.id)) return

    let info: DeploymentInfo
    try {
      const provider = await resolveProvider(dep)
      info = await withTimeout(provider.getDeploymentInfo(dep.externalId), INFO_TIMEOUT_MS)
    } catch (error) {
      // A 404 from the provider REST API means the instance no longer exists
      // (destroyed outside LLMPanel) — that's a fact, not a blip. It ends a
      // "running" row and also unsticks transitional rows (health_check etc.)
      // whose pod is gone. "failed" rows keep their status + error message.
      // Anything else (auth, network, timeout) is a soft-fail: never rewrite.
      const message = error instanceof Error ? error.message : ""
      if (dep.status !== "failed" && message.includes("(404)")) {
        await db.update(deployments)
          .set({
            status: "stopped",
            stoppedAt: new Date(),
            statusMessage: "Instance no longer exists on the provider",
          })
          .where(and(eq(deployments.id, dep.id), eq(deployments.status, dep.status)))
        console.log(`[StatusReconciler] ${dep.id}: ${dep.status} -> stopped (instance gone)`)
      }
      return
    }

    // Downgrade: DB thinks the pod is alive, the provider says otherwise.
    //
    // A "failed" verdict applies from any non-terminal status, not just
    // running: RunPod REST v2 has a real ERROR status (v1 only ever reported
    // what the pod was *meant* to be), so a pod that dies during provisioning
    // now says so instead of leaving the row spinning until the pod is
    // eventually garbage-collected. "stopped" stays a running-only downgrade —
    // a transitional row whose pod has not started yet is not a stopped
    // deployment.
    const downgradable =
      info.status === "failed" ? dep.status !== "failed" : dep.status === "running"
    if (downgradable && (info.status === "stopped" || info.status === "failed")) {
      await db.update(deployments)
        .set({
          status: info.status,
          stoppedAt: new Date(),
          statusMessage: `Provider reports instance ${info.status}`,
          ...(info.status === "failed"
            ? { errorMessage: info.statusDetail ?? "Provider reports instance failed" }
            : {}),
        })
        // Guarded write: don't clobber a concurrent user action.
        .where(and(eq(deployments.id, dep.id), eq(deployments.status, dep.status)))
      console.log(`[StatusReconciler] ${dep.id}: ${dep.status} -> ${info.status}`)
      if (info.status === "failed") {
        fireDeploymentAlert(dep.id, "deployment.failed", {
          errorMessage: "Provider reports instance failed",
        }).catch(console.error)
      }
      return
    }

    // Recovery: DB stuck/failed but the pod is actually up. RunPod reports
    // RUNNING long before the engine finishes loading, so only flip once the
    // inference server answers /health.
    if (dep.status !== "running" && info.status === "running" && info.endpoint) {
      const healthy = await probeHealth(`${info.endpoint}/health`, HEALTH_TIMEOUT_MS)
      if (!healthy) return

      await db.update(deployments)
        .set({
          status: "running",
          endpoint: info.endpoint,
          costPerHour: info.costPerHour ?? dep.costPerHour,
          startedAt: dep.startedAt ?? new Date(),
          errorMessage: null,
          stoppedAt: null,
          statusMessage: "Model is live!",
          progress: 100,
        })
        // Optimistic guard: bail if a concurrent restart already moved it.
        .where(and(eq(deployments.id, dep.id), eq(deployments.status, dep.status)))
      console.log(`[StatusReconciler] ${dep.id}: ${dep.status} -> running`)
      fireDeploymentAlert(dep.id, "deployment.running", {
        message: "Model recovered and is accepting requests.",
      }).catch(console.error)
    }
  }
}

export const statusReconciler = new StatusReconciler()

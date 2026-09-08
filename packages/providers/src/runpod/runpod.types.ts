import type { RunPodApiVersion } from "./runpod.client"

/**
 * Version-agnostic internals for the RunPod provider.
 *
 * v1 and v2 differ in paths, request shape, status vocabulary, metrics source
 * and log transport. Rather than branch inside each of the 13 IGPUProvider
 * methods, both API versions normalize into the shapes below and
 * `runpod.provider.ts` stays single-path. The v1 implementation is deleted
 * wholesale when REST v1 retires on 2026-12-01.
 */

// ── Pods ──────────────────────────────────────────────────────────────

/**
 * v2's status vocabulary, which v1's `desiredStatus` is mapped onto.
 *
 * `UNKNOWN` covers statuses a future API version may add — callers treat it as
 * "still settling", never as a terminal state.
 */
export type NormalizedPodStatus =
  | "PROVISIONING"
  | "STARTING"
  | "RUNNING"
  | "EXITED"
  | "ERROR"
  | "TERMINATED"
  | "UNKNOWN"

export interface NormalizedPortMapping {
  privatePort: number
  publicPort: number | null
  /**
   * The address RunPod reports for this mapping. Frequently a CGNAT address
   * (100.64/10) on proxy pods and therefore not routable — never build an
   * endpoint from this without checking (see `isPubliclyRoutableIp`).
   */
  ip: string | null
  /** "http" | "tcp" upstream, kept open for anything new. */
  type: string
}

export interface NormalizedPodRuntime {
  uptimeSeconds: number | null
  /** Per-GPU live utilization. Empty when the provider reports none. */
  gpus: Array<{ utilPercent: number; memoryUtilPercent: number }>
  containerCpuPercent: number | null
  containerMemoryPercent: number | null
}

export interface NormalizedPod {
  id: string
  name: string | null
  status: NormalizedPodStatus
  /**
   * Lifecycle transitions valid for the current status (v2 `actions`). null on
   * v1, which does not report them.
   */
  actions: string[] | null
  gpuTypeId: string | null
  gpuDisplayName: string | null
  gpuCount: number
  costPerHour: number | null
  /** Declared port strings, e.g. "8000/http". */
  ports: string[]
  /**
   * Live port mappings. v2 reads them from `runtime.ports`; v1 from
   * `publicIp` + `portMappings`. Empty until the pod exposes any.
   */
  portMappings: NormalizedPortMapping[]
  /** Provider's own last lifecycle timestamp — v2 startedAt/createdAt, v1 lastStatusChange. */
  statusDetail: string | null
  /**
   * Serving-ready, in whatever way this API version can tell.
   *
   * On v2 `status` alone is not enough: create can return RUNNING immediately
   * while the container is still coming up, and a *stopped* pod can keep both a
   * populated `runtime` and a non-zero `cost` — so neither signal works alone.
   * RUNNING plus a live runtime block is the combination that holds. v1 has no
   * runtime in its REST response and falls back to status.
   */
  isReady: boolean
  /**
   * Live metrics block, or null when the API version or pod state has none.
   * v1 leaves this null — its runtime comes from a separate GraphQL query.
   */
  runtime: NormalizedPodRuntime | null
}

export type PodAction = "start" | "stop" | "restart" | "terminate"

/** What the provider hands the API layer to create a pod, before version-specific shaping. */
export interface CreatePodInput {
  name: string
  image: string
  gpuTypeId: string
  gpuCount: number
  cloud: "SECURE" | "COMMUNITY"
  /**
   * Container entrypoint override, e.g. `["bash", "-c", "..."]`. v1 sends it
   * as `dockerEntrypoint`; v2 has no such field and takes it JSON-encoded in
   * `args` — undocumented, but verified live in both directions.
   */
  entrypoint: string[]
  env: Record<string, string>
  /** Port declarations, e.g. ["8000/http"]. */
  ports: string[]
  containerDiskGb: number
  volumeGb: number
  volumeMountPath: string
}

// ── GPU catalog ───────────────────────────────────────────────────────

export type GpuAvailability = "HIGH" | "MEDIUM" | "LOW" | "NONE"

export interface NormalizedGpuType {
  id: string
  displayName: string
  vramGb: number
  securePricePerHour: number | null
  communityPricePerHour: number | null
  /** null on v1, which reports stock only through a separate GraphQL field. */
  availability: GpuAvailability | null
  /** Max pods rentable per cloud. 0 in both means the SKU is not deployable as a pod. */
  maxCountSecure: number | null
  maxCountCommunity: number | null
  dataCenterIds: string[]
  cudaVersions: string[]
}

// ── Logs ──────────────────────────────────────────────────────────────

/**
 * `container` is the container's own stdout/stderr; `system` is host lifecycle
 * (image pull, container create/start) — the messages the RunPod console shows
 * while a pod boots.
 */
export type LogSource = "container" | "system"

export interface LogOptions {
  source?: LogSource
  /** Lines of history to replay before following. */
  tail?: number
  /** v1 only — the in-pod agent serves logs there, and it requires this token. */
  agentToken?: string | null
  signal?: AbortSignal
}

// ── The version boundary ──────────────────────────────────────────────

/**
 * Everything `runpod.provider.ts` needs from the RunPod API, in one interface
 * with a v1 and a v2 implementation. Engine arguments, metrics aggregation and
 * endpoint resolution stay in the provider — they are identical either way.
 */
export interface RunPodApi {
  readonly version: RunPodApiVersion
  createPod(input: CreatePodInput): Promise<NormalizedPod>
  /**
   * `withRuntime` asks for live metrics alongside the pod. v2 always includes
   * them; v1 has to spend a second (GraphQL) round trip, so callers that only
   * need status and cost should leave it off.
   */
  getPod(podId: string, opts?: { withRuntime?: boolean }): Promise<NormalizedPod>
  podAction(podId: string, action: PodAction): Promise<void>
  deletePod(podId: string): Promise<void>
  streamLogs(podId: string, opts?: LogOptions): AsyncGenerator<string>
  fetchLogs(podId: string, opts?: LogOptions): Promise<string[]>
  listGpuTypes(): Promise<NormalizedGpuType[]>
}

// ── Helpers shared by both implementations ────────────────────────────

/**
 * Whether an address RunPod reports can actually be reached from outside.
 *
 * Proxy pods report a CGNAT address (100.64/10) for every mapped port, so the
 * obvious "prefer runtime.ports[] for the endpoint" rule would break every
 * deployment. Private ranges are rejected alongside it.
 */
export function isPubliclyRoutableIp(ip: string | null | undefined): boolean {
  if (!ip) return false
  const octets = ip.split(".").map(Number)
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false
  }
  const [a, b] = octets as [number, number, number, number]
  if (a === 10) return false // 10/8
  if (a === 172 && b >= 16 && b <= 31) return false // 172.16/12
  if (a === 192 && b === 168) return false // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return false // 100.64/10 — CGNAT, what RunPod uses
  if (a === 127) return false // loopback
  if (a === 169 && b === 254) return false // link-local
  return true
}

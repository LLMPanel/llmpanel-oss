import { runpodRestV2 } from "../runpod.client"
import type { RunPodApiVersion } from "../runpod.client"
import type {
  CreatePodInput,
  GpuAvailability,
  LogOptions,
  NormalizedGpuType,
  NormalizedPod,
  NormalizedPodRuntime,
  NormalizedPodStatus,
  PodAction,
  RunPodApi,
} from "../runpod.types"
import { fetchPodLogs, streamPodLogs } from "./runpod-logs"

// ── Wire shapes ───────────────────────────────────────────────────────

interface V2PodRuntime {
  uptime?: number | null
  gpus?: Array<{ util?: number | null; memoryUtil?: number | null }> | null
  cpu?: { util?: number | null } | null
  memory?: { util?: number | null } | null
  ports?: Array<{
    private?: number | null
    public?: number | null
    type?: string | null
    ip?: string | null
  }> | null
}

interface V2Pod {
  id: string
  name?: string | null
  status?: string | null
  actions?: string[] | null
  gpu?: { id?: string | null; count?: number | null } | null
  cost?: number | null
  ports?: string[] | null
  createdAt?: string | null
  startedAt?: string | null
  runtime?: V2PodRuntime | null
}

interface V2CatalogGpu {
  id: string
  name?: string | null
  manufacturer?: string | null
  memory?: number | null
  pool?: string | null
  secure?: boolean | null
  community?: boolean | null
  availability?: string | null
  price?: { secure?: number | null; community?: number | null; serverless?: number | null } | null
  maxCount?: { secure?: number | null; community?: number | null } | null
  dataCenters?: Array<{ id?: string | null; name?: string | null; availability?: string | null }> | null
  cudaVersions?: string[] | null
}

// ── Normalization ─────────────────────────────────────────────────────

const POD_STATUSES: readonly NormalizedPodStatus[] = [
  "PROVISIONING",
  "STARTING",
  "RUNNING",
  "EXITED",
  "ERROR",
  "TERMINATED",
]

function normalizeStatus(status: string | null | undefined): NormalizedPodStatus {
  const upper = status?.toUpperCase()
  return POD_STATUSES.find((s) => s === upper) ?? "UNKNOWN"
}

const AVAILABILITY_LEVELS: readonly GpuAvailability[] = ["HIGH", "MEDIUM", "LOW", "NONE"]

function normalizeAvailability(value: string | null | undefined): GpuAvailability | null {
  const upper = value?.toUpperCase()
  return AVAILABILITY_LEVELS.find((a) => a === upper) ?? null
}

function normalizeRuntime(runtime: V2PodRuntime | null | undefined): NormalizedPodRuntime | null {
  if (!runtime) return null
  return {
    uptimeSeconds: runtime.uptime ?? null,
    gpus: (runtime.gpus ?? []).map((g) => ({
      utilPercent: g.util ?? 0,
      memoryUtilPercent: g.memoryUtil ?? 0,
    })),
    containerCpuPercent: runtime.cpu?.util ?? null,
    containerMemoryPercent: runtime.memory?.util ?? null,
  }
}

function normalizePod(pod: V2Pod): NormalizedPod {
  const status = normalizeStatus(pod.status)
  const runtime = normalizeRuntime(pod.runtime)
  return {
    id: pod.id,
    name: pod.name ?? null,
    status,
    actions: pod.actions ?? null,
    // v2 has no separate display name — the id *is* the human-readable name
    // ("NVIDIA H100 80GB HBM3").
    gpuTypeId: pod.gpu?.id ?? null,
    gpuDisplayName: pod.gpu?.id ?? null,
    gpuCount: pod.gpu?.count ?? 0,
    costPerHour: pod.cost ?? null,
    ports: pod.ports ?? [],
    portMappings: (pod.runtime?.ports ?? []).map((p) => ({
      privatePort: p.private ?? 0,
      publicPort: p.public ?? null,
      ip: p.ip ?? null,
      type: p.type ?? "http",
    })),
    // v2 has no human-readable lifecycle message, and `statusDetail` is
    // rendered verbatim as the deployment's status text — a raw ISO timestamp
    // from `startedAt`/`createdAt` would read worse than the generic fallback.
    // The system-event SSE stream supplies the real "pulling image / starting
    // container" narration, which is better than v1's "Rented by User" noise.
    statusDetail: null,
    // Neither signal is sufficient alone — see NormalizedPod.isReady.
    isReady: status === "RUNNING" && runtime !== null,
    runtime,
  }
}

function normalizeGpuType(gpu: V2CatalogGpu): NormalizedGpuType {
  return {
    id: gpu.id,
    displayName: gpu.name ?? gpu.id,
    vramGb: gpu.memory ?? 0,
    securePricePerHour: gpu.price?.secure ?? null,
    communityPricePerHour: gpu.price?.community ?? null,
    availability: normalizeAvailability(gpu.availability),
    maxCountSecure: gpu.maxCount?.secure ?? null,
    maxCountCommunity: gpu.maxCount?.community ?? null,
    dataCenterIds: (gpu.dataCenters ?? []).flatMap((d) => (d.id ? [d.id] : [])),
    cudaVersions: gpu.cudaVersions ?? [],
  }
}

/**
 * Whether a catalog entry can actually back a pod.
 *
 * The catalog includes a literal `"unknown"` id and MIG SKUs that report
 * `maxCount {secure: 0, community: 0}` — neither is rentable. This is stock-
 * independent: an out-of-stock GPU still has a non-zero maxCount and stays in
 * the list with `availability: "NONE"`.
 */
function isDeployable(gpu: NormalizedGpuType): boolean {
  return (
    gpu.id !== "unknown" &&
    ((gpu.maxCountSecure ?? 0) > 0 || (gpu.maxCountCommunity ?? 0) > 0)
  )
}

// ── Implementation ────────────────────────────────────────────────────

export class RunPodV2Api implements RunPodApi {
  readonly version: RunPodApiVersion = "v2"
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async createPod(input: CreatePodInput): Promise<NormalizedPod> {
    // v2 dropped v1's `dockerEntrypoint`/`dockerStartCmd`; the entrypoint
    // override rides in `args` as a JSON-encoded object instead. Undocumented
    // — the schema describes `args` only as "Arguments passed to the container
    // entrypoint" — but verified in both directions against the live API: v2
    // renders v1-created entrypoints back in exactly this form, and a v2
    // create with this shape runs the override. If it ever stops working,
    // metrics degrade to Pod.runtime rather than breaking the deployment.
    const body: Record<string, unknown> = {
      name: input.name,
      image: input.image,
      gpu: { id: input.gpuTypeId, count: input.gpuCount },
      cloud: input.cloud,
      disk: input.containerDiskGb,
      ports: input.ports,
      env: input.env,
    }
    if (input.entrypoint.length > 0) {
      body.args = JSON.stringify({ entrypoint: input.entrypoint })
    }
    if (input.volumeGb > 0) {
      body.mounts = { persistent: { size: input.volumeGb, path: input.volumeMountPath } }
    }

    const pod = await runpodRestV2<V2Pod>(this.apiKey, "POST", "/v2/pods", body)
    return normalizePod(pod)
  }

  /** `withRuntime` is a no-op here — v2 always returns the runtime block. */
  async getPod(podId: string): Promise<NormalizedPod> {
    const pod = await runpodRestV2<V2Pod>(this.apiKey, "GET", `/v2/pods/${podId}`)
    return normalizePod(pod)
  }

  /** One endpoint replaces v1's four separate start/stop/restart/terminate calls. */
  async podAction(podId: string, action: PodAction): Promise<void> {
    await runpodRestV2(this.apiKey, "POST", `/v2/pods/${podId}/action`, { action })
  }

  async deletePod(podId: string): Promise<void> {
    await runpodRestV2(this.apiKey, "DELETE", `/v2/pods/${podId}`)
  }

  streamLogs(podId: string, opts: LogOptions = {}): AsyncGenerator<string> {
    return streamPodLogs(this.apiKey, podId, {
      source: opts.source ?? "container",
      tail: opts.tail ?? 200,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    })
  }

  fetchLogs(podId: string, opts: LogOptions = {}): Promise<string[]> {
    return fetchPodLogs(this.apiKey, podId, {
      source: opts.source ?? "container",
      tail: opts.tail ?? 500,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    })
  }

  /**
   * Replaces the GraphQL `gpuTypes` query and the hand-maintained id enum.
   * `include=AVAILABILITY` adds live stock levels; `product=POD` excludes
   * serverless-only SKUs.
   */
  async listGpuTypes(): Promise<NormalizedGpuType[]> {
    const res = await runpodRestV2<{ gpus?: V2CatalogGpu[] }>(
      this.apiKey,
      "GET",
      "/v2/catalog/gpus?include=AVAILABILITY&product=POD",
    )
    return (res.gpus ?? []).map(normalizeGpuType).filter(isDeployable)
  }
}

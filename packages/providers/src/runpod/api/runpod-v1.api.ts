import { gql } from "graphql-request"
import type { GraphQLClient } from "graphql-request"
import { createRunPodClient, runpodRest } from "../runpod.client"
import type { RunPodApiVersion } from "../runpod.client"
import type {
  CreatePodInput,
  LogOptions,
  NormalizedGpuType,
  NormalizedPod,
  NormalizedPodRuntime,
  NormalizedPodStatus,
  NormalizedPortMapping,
  PodAction,
  RunPodApi,
} from "../runpod.types"
import { fetchRunpodAgentLogs } from "../runpod-agent"
import { streamPodLogs } from "./runpod-logs"

/**
 * RunPod REST v1 + GraphQL, behind the shared `RunPodApi` interface.
 *
 * This is the pre-migration behaviour preserved verbatim so `RUNPOD_API_VERSION=v1`
 * remains a working fallback while v2 is in beta. **Delete this file, its export
 * from `index.ts`, and the version switch when REST v1 retires on 2026-12-01.**
 */

// ── Wire shapes ───────────────────────────────────────────────────────

interface V1Pod {
  id: string
  name?: string | null
  desiredStatus: string
  lastStatusChange?: string | null
  costPerHr?: string | number | null
  adjustedCostPerHr?: number | null
  publicIp: string | null
  ports: string[] | null
  portMappings: Record<string, number> | null
  gpu: { id: string; count: number; displayName: string } | null
}

interface GpuTypesResponse {
  gpuTypes: Array<{
    id: string
    displayName: string
    memoryInGb: number
    securePrice: number | null
    communityPrice?: number | null
  }>
}

interface PodMetricsResponse {
  pod: {
    gpuCount: number
    costPerHr: number | string | null
    machine: { gpuDisplayName: string } | null
    runtime: {
      uptimeInSeconds: number
      gpus: Array<{ id: string; gpuUtilPercent: number; memoryUtilPercent: number }> | null
      container: { cpuPercent: number; memoryPercent: number } | null
    } | null
  } | null
}

// ── Normalization ─────────────────────────────────────────────────────

/**
 * v1 reports `desiredStatus` — what the pod is *meant* to be, not what it is —
 * with no distinct provisioning, starting or error state. Anything unrecognised
 * therefore means "still coming up", which is why v1 can never surface a
 * failure; v2's real `ERROR` status is the fix.
 */
function normalizeStatus(desired: string): NormalizedPodStatus {
  switch (desired?.toUpperCase()) {
    case "RUNNING":
      return "RUNNING"
    case "EXITED":
    case "PAUSED":
      return "EXITED"
    case "TERMINATED":
      return "TERMINATED"
    default:
      return "PROVISIONING"
  }
}

function normalizePod(pod: V1Pod): NormalizedPod {
  const status = normalizeStatus(pod.desiredStatus)

  // v1 exposes mappings as {"8000": 43210} against a single public IP, which
  // stays null for proxy pods.
  const portMappings: NormalizedPortMapping[] = Object.entries(pod.portMappings ?? {}).map(
    ([privatePort, publicPort]) => ({
      privatePort: Number(privatePort),
      publicPort,
      ip: pod.publicIp,
      type: "tcp",
    }),
  )

  return {
    id: pod.id,
    name: pod.name ?? null,
    status,
    actions: null,
    gpuTypeId: pod.gpu?.id ?? null,
    gpuDisplayName: pod.gpu?.displayName ?? null,
    gpuCount: pod.gpu?.count ?? 0,
    costPerHour: pod.adjustedCostPerHr ?? (pod.costPerHr != null ? Number(pod.costPerHr) : null),
    ports: pod.ports ?? [],
    portMappings,
    statusDetail: pod.lastStatusChange ?? null,
    // No runtime block in the v1 REST response, so status is all there is.
    isReady: status === "RUNNING",
    runtime: null,
  }
}

// ── Implementation ────────────────────────────────────────────────────

export class RunPodV1Api implements RunPodApi {
  readonly version: RunPodApiVersion = "v1"
  private readonly apiKey: string
  private readonly gql: GraphQLClient

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.gql = createRunPodClient(apiKey)
  }

  async createPod(input: CreatePodInput): Promise<NormalizedPod> {
    const pod = await runpodRest<V1Pod>(this.apiKey, "POST", "/pods", {
      name: input.name,
      imageName: input.image,
      gpuTypeIds: [input.gpuTypeId],
      gpuCount: input.gpuCount,
      cloudType: input.cloud,
      dockerEntrypoint: input.entrypoint,
      dockerStartCmd: [],
      env: input.env,
      ports: input.ports,
      containerDiskInGb: input.containerDiskGb,
      volumeInGb: input.volumeGb,
    })
    return normalizePod(pod)
  }

  async getPod(podId: string, opts: { withRuntime?: boolean } = {}): Promise<NormalizedPod> {
    // v1's REST pod carries no live metrics, so the runtime block costs a
    // second round trip through GraphQL — only taken when asked for.
    const [pod, runtime] = await Promise.all([
      runpodRest<V1Pod>(this.apiKey, "GET", `/pods/${podId}`),
      opts.withRuntime ? this.fetchRuntime(podId) : Promise.resolve(null),
    ])
    return { ...normalizePod(pod), runtime }
  }

  /** v1 has a separate endpoint per transition; terminate is a DELETE. */
  async podAction(podId: string, action: PodAction): Promise<void> {
    if (action === "terminate") {
      await this.deletePod(podId)
      return
    }
    await runpodRest(this.apiKey, "POST", `/pods/${podId}/${action}`)
  }

  async deletePod(podId: string): Promise<void> {
    await runpodRest(this.apiKey, "DELETE", `/pods/${podId}`)
  }

  /** v1's only live metrics source — the REST pod object carries none. */
  private async fetchRuntime(podId: string): Promise<NormalizedPodRuntime | null> {
    const data = await this.gql.request<PodMetricsResponse>(
      gql`
        query PodMetrics($podId: String!) {
          pod(input: { podId: $podId }) {
            gpuCount
            costPerHr
            machine { gpuDisplayName }
            runtime {
              uptimeInSeconds
              gpus { id gpuUtilPercent memoryUtilPercent }
              container { cpuPercent memoryPercent }
            }
          }
        }
      `,
      { podId },
    )

    const runtime = data.pod?.runtime
    if (!runtime) return null
    return {
      uptimeSeconds: runtime.uptimeInSeconds,
      gpus: (runtime.gpus ?? []).map((g) => ({
        utilPercent: g.gpuUtilPercent,
        memoryUtilPercent: g.memoryUtilPercent,
      })),
      containerCpuPercent: runtime.container?.cpuPercent ?? null,
      containerMemoryPercent: runtime.container?.memoryPercent ?? null,
    }
  }

  /**
   * Container logs come from the in-pod agent: v1 has no logs API, so the
   * deploy entrypoint tees engine output to a file the agent serves.
   */
  async *streamLogs(podId: string, opts: LogOptions = {}): AsyncGenerator<string> {
    // Host lifecycle events are not an agent concern — they come from the v2
    // SSE endpoint, which authenticates with the same key and is what this
    // provider already used before the migration.
    if (opts.source === "system") {
      yield* streamPodLogs(this.apiKey, podId, {
        source: "system",
        tail: opts.tail ?? 20,
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      })
      return
    }

    const token = opts.agentToken
    if (!token) {
      yield NO_AGENT_MSG
      return
    }

    // Emit recent context first, then follow from the current end of file.
    let offset = 0
    try {
      const head = await fetchRunpodAgentLogs(podId, token, `tail=${opts.tail ?? 200}`)
      for (const line of head.lines ?? []) yield line
      offset = head.size
    } catch {
      yield "[RunPod] Waiting for the log agent to come up..."
    }

    // A partial line at the end of a chunk is carried into the next poll so
    // lines are never split across events.
    let carry = ""
    let failures = 0
    while (true) {
      await new Promise((r) => setTimeout(r, 2000))
      if (opts.signal?.aborted) return
      try {
        const body = await fetchRunpodAgentLogs(podId, token, `offset=${offset}`)
        failures = 0
        offset = body.offset ?? offset
        const text = carry + (body.chunk ?? "")
        const lines = text.split("\n")
        carry = lines.pop() ?? ""
        for (const line of lines) {
          if (line.trim()) yield line
        }
      } catch {
        failures++
        if (failures >= 5) {
          yield "[RunPod] Lost connection to the log agent — stream stopped. The pod may have been stopped or destroyed."
          return
        }
      }
    }
  }

  async fetchLogs(podId: string, opts: LogOptions = {}): Promise<string[]> {
    if (!opts.agentToken) return [NO_AGENT_MSG]
    try {
      const body = await fetchRunpodAgentLogs(podId, opts.agentToken, `tail=${opts.tail ?? 500}`)
      return body.lines ?? []
    } catch {
      return [
        "[RunPod] Log agent unreachable — the pod may still be starting or stopped. If this deployment predates log capture, redeploy it to enable logs.",
      ]
    }
  }

  /**
   * v1 has no GPU catalog endpoint — GraphQL `gpuTypes` is the only listing,
   * and it reports neither stock levels nor datacenters.
   */
  async listGpuTypes(): Promise<NormalizedGpuType[]> {
    const data = await this.gql.request<GpuTypesResponse>(gql`
      query GetGpuTypes {
        gpuTypes { id displayName memoryInGb securePrice communityPrice }
      }
    `)

    return data.gpuTypes.map((g) => ({
      id: g.id,
      displayName: g.displayName,
      vramGb: g.memoryInGb,
      securePricePerHour: g.securePrice ?? null,
      communityPricePerHour: g.communityPrice ?? null,
      availability: null,
      maxCountSecure: null,
      maxCountCommunity: null,
      dataCenterIds: [],
      cudaVersions: [],
    }))
  }
}

const NO_AGENT_MSG =
  "[RunPod] Container logs require the in-pod log agent. This deployment predates log capture — redeploy the model to enable logs, or view them in the RunPod console."

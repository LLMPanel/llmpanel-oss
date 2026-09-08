import { vllmSpeculativeArg, sglangSpeculativeArg } from "../shared/speculative"
import type {
  IGPUProvider,
  DeployModelInput,
  DeploymentInfo,
  GPUMetrics,
  MetricsCapabilities,
  MetricsContext,
  SingleGPUMetrics,
} from "../types"
import { getRunPodApiVersion } from "./runpod.client"
import type { RunPodApiVersion } from "./runpod.client"
import type {
  NormalizedPod,
  NormalizedPodStatus,
  NormalizedGpuType,
  RunPodApi,
} from "./runpod.types"
import { isPubliclyRoutableIp } from "./runpod.types"
import { RunPodV1Api } from "./api/runpod-v1.api"
import { RunPodV2Api } from "./api/runpod-v2.api"
import { fetchRunpodAgentGpus } from "./runpod-agent"
import { resolveRunpodGpuTypeId, lookupRunpodGpuVram } from "./gpu-types"
import { METRICS_AGENT_PY, METRICS_AGENT_PORT, ENGINE_LOG_FILE } from "../shared/agent-script"

const INFERENCE_PORT = 8000

const STATUS_MAP: Record<NormalizedPodStatus, DeploymentInfo["status"]> = {
  PROVISIONING: "provisioning",
  STARTING: "loading",
  RUNNING: "running",
  EXITED: "stopped",
  // Unreachable on v1, which has no failure status of its own.
  ERROR: "failed",
  TERMINATED: "stopped",
  // A status this client doesn't know yet — treat as still settling, never as
  // terminal, so the reconciler keeps polling instead of marking it stopped.
  UNKNOWN: "provisioning",
}

export class RunPodProvider implements IGPUProvider {
  private readonly api: RunPodApi

  /**
   * `apiVersion` overrides the process-wide setting from
   * `setRunPodApiVersion()` — used by tests and one-off scripts. Production
   * call sites pass nothing and follow `RUNPOD_API_VERSION`.
   */
  constructor(apiKey: string, opts?: { apiVersion?: RunPodApiVersion }) {
    const version = opts?.apiVersion ?? getRunPodApiVersion()
    this.api = version === "v1" ? new RunPodV1Api(apiKey) : new RunPodV2Api(apiKey)
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const gpuCount = input.gpuCount ?? 1
    const tensorParallelArg = gpuCount > 1 ? ` --tensor-parallel-size ${gpuCount}` : ""
    const kvCacheArg = (input.kvCacheEnabled ?? true) ? " --enable-prefix-caching" : " --no-prefix-caching"
    const vllmSpecArg = vllmSpeculativeArg(input)
    const sglangSpecArg = sglangSpeculativeArg(input)

    const engineImages: Record<string, string> = {
      vllm: "vllm/vllm-openai:latest",
      sglang: "lmsysorg/sglang:latest",
    }

    // Full commands (not flags-only): the metrics-agent wrapper below
    // replaces the image entrypoint, so the engine invocation must be
    // explicit. `python3 -m vllm.entrypoints.openai.api_server` is what the
    // vllm/vllm-openai entrypoint runs.
    const engineCmd: Record<string, string> = {
      vllm: `python3 -m vllm.entrypoints.openai.api_server --model ${input.huggingfaceId} --host 0.0.0.0 --port ${INFERENCE_PORT} --max-model-len ${input.maxModelLen}${tensorParallelArg}${kvCacheArg}${vllmSpecArg}`,
      sglang: `python3 -m sglang.launch_server --model-path ${input.huggingfaceId} --host 0.0.0.0 --port ${INFERENCE_PORT}${gpuCount > 1 ? ` --tp-size ${gpuCount}` : ""}${sglangSpecArg}`,
    }

    // Start-command wrapper: drop the agent into the pod, background it, then
    // exec the engine so it stays PID 1 (correct signal handling). Base64 has
    // no shell metacharacters, so single-quoting is safe. The agent dying
    // never affects the engine; metrics just fall back to the RunPod API path.
    //
    // On v1 the engine's output is also tee'd to a file, because v1 has no
    // logs API and the agent serves that file instead. v2 streams container
    // stdout directly, so the tee is dead weight there.
    const agentB64 = Buffer.from(METRICS_AGENT_PY, "utf8").toString("base64")
    const shellLine = [
      `printf '%s' '${agentB64}' | base64 -d > /llmpanel-agent.py`,
      `(python3 /llmpanel-agent.py >/dev/null 2>&1 &)`,
      ...(this.api.version === "v1" ? [`exec > >(tee -a ${ENGINE_LOG_FILE}) 2>&1`] : []),
      `exec ${engineCmd[input.inferenceEngine] ?? engineCmd.vllm}`,
    ].join(" && ")

    const gpuTypeId = await this.resolveGpuTypeId(input.gpuType)

    const pod = await this.api.createPod({
      name: `llmpanel-${input.deploymentId}`,
      image: engineImages[input.inferenceEngine] ?? engineImages.vllm,
      gpuTypeId,
      gpuCount,
      cloud: input.cloudType === "community" ? "COMMUNITY" : "SECURE",
      entrypoint: ["bash", "-c", shellLine],
      env: {
        HF_TOKEN: process.env.HF_TOKEN ?? "",
        HUGGING_FACE_HUB_TOKEN: process.env.HF_TOKEN ?? "",
        LLMPANEL_AGENT_PORT: String(METRICS_AGENT_PORT),
        ...(input.envVars ?? {}),
      },
      ports: [`${INFERENCE_PORT}/http`, `${METRICS_AGENT_PORT}/http`],
      containerDiskGb: 50,
      volumeGb: 20,
      volumeMountPath: "/workspace",
    })

    return {
      externalId: pod.id,
      // v2 can answer RUNNING in the create response while the container is
      // still coming up, so the deployment always starts as provisioning and
      // the reconciler promotes it once the pod is genuinely ready.
      status: "provisioning",
      endpoint: null,
      gpuType: input.gpuType,
      costPerHour: pod.costPerHour,
    }
  }

  async startDeployment(externalId: string): Promise<void> {
    await this.api.podAction(externalId, "start")
  }

  async stopDeployment(externalId: string): Promise<void> {
    await this.api.podAction(externalId, "stop")
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.api.podAction(externalId, "restart")
  }

  async destroyDeployment(externalId: string): Promise<void> {
    await this.api.deletePod(externalId)
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const pod = await this.api.getPod(externalId)
    return {
      externalId,
      status: STATUS_MAP[pod.status],
      endpoint: this.resolveEndpoint(pod),
      gpuType: pod.gpuDisplayName ?? "runpod",
      costPerHour: pod.costPerHour,
      statusDetail: pod.statusDetail,
    }
  }

  /**
   * Where the inference server can actually be reached.
   *
   * Port 8000 is declared as an HTTP port, so RunPod exposes it through its
   * proxy at https://<podId>-8000.proxy.runpod.net. The addresses RunPod
   * reports for mapped ports are CGNAT (100.64/10) on proxy pods and are not
   * reachable from here — a direct mapping is only used when its address is
   * genuinely public, which happens for pods launched with `8000/tcp` on a
   * public IP.
   */
  private resolveEndpoint(pod: NormalizedPod): string | null {
    const direct = pod.portMappings.find(
      (p) => p.privatePort === INFERENCE_PORT && p.publicPort !== null && isPubliclyRoutableIp(p.ip),
    )
    if (direct) return `http://${direct.ip}:${direct.publicPort}`
    return pod.isReady ? `https://${pod.id}-${INFERENCE_PORT}.proxy.runpod.net` : null
  }

  // ── Logs ────────────────────────────────────────────────────────────

  /** Host lifecycle events (image pull, container create/start) — what the RunPod console shows while a pod boots. */
  streamSystemEvents(externalId: string, signal?: AbortSignal): AsyncGenerator<string> {
    return this.api.streamLogs(externalId, {
      source: "system",
      tail: 20,
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  streamLogs(externalId: string, ctx?: MetricsContext): AsyncGenerator<string> {
    return this.api.streamLogs(externalId, {
      source: "container",
      agentToken: ctx?.metricsToken,
    })
  }

  fetchLogs(externalId: string, tail = 500, ctx?: MetricsContext): Promise<string[]> {
    return this.api.fetchLogs(externalId, { source: "container", tail, agentToken: ctx?.metricsToken })
  }

  // ── Metrics ─────────────────────────────────────────────────────────

  getMetricsCapabilities(ctx?: MetricsContext): MetricsCapabilities {
    // Temperature/power/clocks come from the in-pod nvidia-smi agent, which
    // only exists on deployments provisioned with a metrics token. Legacy
    // pods stay limited to the RunPod API fields.
    const hasAgent = Boolean(ctx?.metricsToken)
    return {
      gpuUtilization: true,
      vram: true,
      temperature: hasAgent,
      power: hasAgent,
      clocks: hasAgent,
      perGpu: true,
      container: true,
      uptime: true,
      costPerHour: true,
    }
  }

  async getMetrics(externalId: string, ctx?: MetricsContext): Promise<GPUMetrics> {
    const [agent, api] = await Promise.allSettled([
      fetchRunpodAgentGpus(externalId, ctx?.metricsToken),
      this.fetchApiMetrics(externalId),
    ])

    if (api.status === "fulfilled") {
      if (agent.status === "fulfilled" && agent.value.length > 0) {
        return this.mergeAgentIntoApi(api.value, agent.value)
      }
      // Legacy pods, agent still booting, or agent died — API-level metrics.
      return api.value
    }
    if (agent.status === "fulfilled" && agent.value.length > 0) {
      // RunPod API blip but the pod itself is reachable.
      return this.buildFromAgentOnly(agent.value)
    }
    throw api.reason instanceof Error ? api.reason : new Error(String(api.reason))
  }

  /**
   * Pod-level metrics from the RunPod API — utilization the agent duplicates,
   * plus the container CPU/memory, uptime and cost only the API can see.
   * VRAM is an estimate: the API reports memory *utilization*, so absolute GB
   * comes from catalog VRAM for the GPU type.
   */
  private async fetchApiMetrics(externalId: string): Promise<GPUMetrics> {
    const pod = await this.api.getPod(externalId, { withRuntime: true })
    if (!pod.runtime) {
      throw new Error("RunPod pod is not running — metrics unavailable")
    }

    const gpuName = pod.gpuDisplayName ?? "RunPod GPU"
    const perGpuVramGb = await this.resolveGpuVramGb(gpuName)
    const runtimeGpus = pod.runtime.gpus
    const gpuCount = pod.gpuCount || runtimeGpus.length || 1

    const gpus: SingleGPUMetrics[] = runtimeGpus.map((g, i) => {
      const usedGb = (g.memoryUtilPercent / 100) * perGpuVramGb
      return {
        index: i,
        name: gpuName,
        uuid: `${pod.id}-${i}`,
        gpuUtilization: g.utilPercent,
        memoryUtilization: g.memoryUtilPercent,
        vramUsedGb: usedGb,
        vramTotalGb: perGpuVramGb,
        vramFreeGb: perGpuVramGb - usedGb,
        temperatureCelsius: null,
        temperatureMemoryCelsius: null,
        fanSpeedPercent: null,
        powerDrawWatts: null,
        powerLimitWatts: null,
        clockGraphicsMhz: null,
        clockMemoryMhz: null,
        clockSmMhz: null,
        pcieGen: null,
        pcieLinkWidth: null,
        eccErrors: null,
      }
    })

    const avgUtil = runtimeGpus.length > 0
      ? runtimeGpus.reduce((sum, g) => sum + g.utilPercent, 0) / runtimeGpus.length
      : 0

    return {
      gpuCount,
      gpuUtilization: avgUtil,
      vramUsedGb: gpus.reduce((sum, g) => sum + g.vramUsedGb, 0),
      vramTotalGb: perGpuVramGb * gpuCount,
      temperatureCelsius: null,
      powerDrawWatts: null,
      containerCpuPercent: pod.runtime.containerCpuPercent,
      containerMemoryPercent: pod.runtime.containerMemoryPercent,
      uptimeSeconds: pod.runtime.uptimeSeconds,
      costPerHour: pod.costPerHour,
      gpus: gpus.length > 0 ? gpus : undefined,
    }
  }

  // Aggregation mirrors the local provider: mean utilization/temperature,
  // summed VRAM/power.
  private aggregateGpus(gpus: SingleGPUMetrics[]): Pick<GPUMetrics,
    "gpuCount" | "gpuUtilization" | "vramUsedGb" | "vramTotalGb" | "temperatureCelsius" | "powerDrawWatts"
  > {
    const count = gpus.length
    return {
      gpuCount: count,
      gpuUtilization: Math.round(gpus.reduce((s, g) => s + g.gpuUtilization, 0) / count),
      vramUsedGb: gpus.reduce((s, g) => s + g.vramUsedGb, 0),
      vramTotalGb: gpus.reduce((s, g) => s + g.vramTotalGb, 0),
      temperatureCelsius: Math.round(
        gpus.reduce((s, g) => s + (g.temperatureCelsius ?? 0), 0) / count,
      ),
      powerDrawWatts: gpus.reduce((s, g) => s + (g.powerDrawWatts ?? 0), 0),
    }
  }

  // Agent supplies measured per-GPU data (incl. temp/power/clocks and real
  // VRAM instead of the gpuType estimate); the API supplies pod-level facts
  // the agent can't see (container CPU/mem, uptime, cost).
  private mergeAgentIntoApi(apiMetrics: GPUMetrics, agentGpus: SingleGPUMetrics[]): GPUMetrics {
    return {
      ...apiMetrics,
      ...this.aggregateGpus(agentGpus),
      gpus: agentGpus,
    }
  }

  private buildFromAgentOnly(agentGpus: SingleGPUMetrics[]): GPUMetrics {
    return {
      ...this.aggregateGpus(agentGpus),
      containerCpuPercent: null,
      containerMemoryPercent: null,
      uptimeSeconds: null,
      costPerHour: null,
      gpus: agentGpus,
    }
  }

  // ── GPU catalog ─────────────────────────────────────────────────────

  // The catalog rarely changes — cache it for the metrics collector's 20s
  // polling cadence so it doesn't hammer the API.
  private gpuTypeCache: NormalizedGpuType[] | null = null
  private gpuTypeFetchedAt = 0
  private static readonly GPU_CATALOG_TTL_MS = 60 * 60 * 1000

  private async loadGpuTypes(): Promise<NormalizedGpuType[]> {
    const fresh =
      this.gpuTypeCache !== null &&
      Date.now() - this.gpuTypeFetchedAt < RunPodProvider.GPU_CATALOG_TTL_MS
    if (!fresh) {
      this.gpuTypeCache = await this.api.listGpuTypes()
      this.gpuTypeFetchedAt = Date.now()
    }
    return this.gpuTypeCache ?? []
  }

  /**
   * Resolve an arbitrary GPU label to the id RunPod will accept on create.
   *
   * The live catalog is authoritative — it lists GPUs the static enum in
   * `gpu-types.ts` never had, and those ids now reach the picker. The static
   * resolver stays as the fallback: it handles short and legacy LLMPanel
   * labels ("H100 SXM") that the catalog has no notion of, and covers the case
   * where the catalog call fails.
   */
  private async resolveGpuTypeId(gpuType: string): Promise<string> {
    const raw = (gpuType ?? "").trim()
    if (raw) {
      try {
        const gpus = await this.loadGpuTypes()
        const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
        const target = compact(raw)
        const match = gpus.find(
          (g) => compact(g.id) === target || compact(g.displayName) === target,
        )
        if (match) return match.id
      } catch {
        // Catalog unavailable — the static resolver below still knows the
        // common ids and every legacy alias.
      }
    }
    return resolveRunpodGpuTypeId(gpuType)
  }

  private async resolveGpuVramGb(displayName: string): Promise<number> {
    try {
      const gpus = await this.loadGpuTypes()
      const match = gpus.find((g) => g.displayName === displayName || g.id === displayName)
      if (match?.vramGb) return match.vramGb
    } catch {
      // Live lookup failed — fall through to the offline map.
    }
    return lookupRunpodGpuVram(displayName) ?? 80
  }

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    const gpus = await this.loadGpuTypes()
    return gpus.map((g) => ({
      type: g.id,
      vramGb: g.vramGb,
      costPerHour: g.securePricePerHour ?? g.communityPricePerHour,
    }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

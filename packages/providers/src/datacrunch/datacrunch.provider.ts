import { createHash } from "node:crypto"
import type {
  IGPUProvider,
  DeployModelInput,
  DeploymentInfo,
  GPUMetrics,
  MetricsCapabilities,
  MetricsContext,
} from "../types"
import { buildBootstrapScript, INFERENCE_PORT } from "../shared/cloud-init"
import {
  aggregateGpuMetrics,
  fetchAgentGpus,
  fetchAgentLogLines,
  streamAgentLogs,
} from "../shared/agent-client"
import { DataCrunchClient, fetchDataCrunchInstanceTypes } from "./datacrunch.client"

// ── API shapes ───────────────────────────────────────────────────────

interface DCInstanceType {
  id: string
  instance_type: string
  name: string
  model: string
  cpu: { description: string; number_of_cores: number }
  gpu: { description: string; number_of_gpus: number }
  gpu_memory: { description: string; size_in_gigabytes: number }
  memory: { description: string; size_in_gigabytes: number }
  /** Prices come back as strings on this endpoint (numbers on /instances). */
  price_per_hour: string
  spot_price: string | null
  currency: string
}

interface DCInstance {
  id: string
  ip: string | null
  private_ip: string | null
  status: string
  hostname: string
  description: string
  location: string
  price_per_hour: number
  instance_type: string
  image: string
  gpu: { description: string; number_of_gpus: number }
  gpu_memory: { size_in_gigabytes: number }
}

interface DCAvailability {
  location_code: string
  availabilities: string[]
}

interface DCScript {
  id: string
  name: string
  script: string
}

interface DCSSHKey {
  id: string
  name: string
  key: string
}

// ── Constants ────────────────────────────────────────────────────────

const LABEL = "DataCrunch"
/** Ubuntu 24.04 + CUDA 12.8 with Docker preinstalled. The `-docker` suffix is
 *  the marker for a Docker-bearing image; `-open` selects NVIDIA's open kernel
 *  modules, required for Blackwell-class parts. */
const DEFAULT_IMAGE = "ubuntu-24.04-cuda-12.8-open-docker"
const DEFAULT_LOCATION = "FIN-01"
const OS_VOLUME_GB = 150
const SSH_KEY_NAME = "llmpanel"

/** Map a DataCrunch status onto our deployment status enum. */
function mapStatus(status: string, hasIp: boolean): DeploymentInfo["status"] {
  switch (status) {
    case "running":
      return hasIp ? "running" : "provisioning"
    case "new":
    case "ordered":
    case "validating":
    case "provisioning":
      return "provisioning"
    case "offline":
      return "stopped"
    case "deleting":
      return "stopped"
    // `discontinued` covers both spot eviction and a zero account balance.
    case "discontinued":
    case "error":
    case "installation_failed":
    case "no_capacity":
      return "failed"
    default:
      return "provisioning"
  }
}

export class DataCrunchProvider implements IGPUProvider {
  private readonly client: DataCrunchClient

  constructor(apiKey: string) {
    this.client = new DataCrunchClient(apiKey)
  }

  private getInstance(externalId: string): Promise<DCInstance> {
    return this.client.request<DCInstance>("GET", `/instances/${externalId}`)
  }

  // ── Launch prerequisites ───────────────────────────────────────────

  /** DataCrunch has no inline user-data: the bootstrap must exist as its own
   *  `/scripts` resource first. Projects are capped at 100 scripts, so scripts
   *  are content-addressed by hash and reused instead of created per deploy. */
  private async ensureStartupScript(script: string): Promise<string> {
    const digest = createHash("sha256").update(script).digest("hex").slice(0, 16)
    const name = `llmpanel-${digest}`

    const existing = await this.client.request<DCScript[]>("GET", "/scripts")
    const match = existing.find((s) => s.name === name)
    if (match) return match.id

    return this.client.request<string>("POST", "/scripts", { name, script })
  }

  /** A key is required for SSH access to exist at all; provisioning itself
   *  runs from the startup script, so an existing key is reused when present. */
  private async ensureSshKey(): Promise<string[]> {
    const keys = await this.client.request<DCSSHKey[]>("GET", "/sshkeys")
    const existing = keys.find((k) => k.name === SSH_KEY_NAME)
    return existing ? [existing.id] : []
  }

  // ── IGPUProvider ───────────────────────────────────────────────────

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const types = await fetchDataCrunchInstanceTypes<DCInstanceType[]>()

    const wanted = input.gpuType.toLowerCase()
    const type =
      types.find((t) => t.instance_type === input.gpuType) ??
      types.find(
        (t) =>
          t.instance_type.toLowerCase() === wanted ||
          t.name.toLowerCase().includes(wanted),
      )
    if (!type) {
      throw new Error(`DataCrunch has no instance type matching "${input.gpuType}"`)
    }

    // Pick a location that currently has capacity, else fall back to the
    // default and let the API return its own 503.
    let location = DEFAULT_LOCATION
    try {
      const avail = await this.client.request<DCAvailability[]>(
        "GET",
        "/instance-availability",
      )
      const withCapacity = avail.find((a) =>
        a.availabilities.includes(type.instance_type),
      )
      if (withCapacity) location = withCapacity.location_code
    } catch {
      /* availability is advisory — proceed with the default location */
    }

    // GPU count is fixed by the instance type, so tensor parallelism follows
    // the hardware rather than the requested count.
    const gpuCount = type.gpu.number_of_gpus || 1
    const scriptId = await this.ensureStartupScript(
      buildBootstrapScript(input, { gpuCount }),
    )
    const sshKeyIds = await this.ensureSshKey()

    const hostname = `llmpanel-${input.deploymentId.toLowerCase().replace(/[^a-z0-9-]/g, "")}`
      .slice(0, 63)
      .replace(/-+$/, "")

    // POST /instances returns a bare quoted string — the new instance id.
    const instanceId = await this.client.request<string>("POST", "/instances", {
      instance_type: type.instance_type,
      image: input.dockerImage?.trim() ? DEFAULT_IMAGE : DEFAULT_IMAGE,
      hostname,
      description: `LLMPanel deployment ${input.deploymentId}`,
      location_code: location,
      startup_script_id: scriptId,
      os_volume: { name: `${hostname}-os`, size: OS_VOLUME_GB },
      is_spot: false,
      contract: "PAY_AS_YOU_GO",
      ...(sshKeyIds.length > 0 ? { ssh_key_ids: sshKeyIds } : {}),
    })

    return {
      externalId: instanceId,
      status: "provisioning",
      endpoint: null,
      gpuType: type.instance_type,
      costPerHour: Number(type.price_per_hour),
    }
  }

  private action(externalId: string, action: string, extra?: Record<string, unknown>) {
    // Instance actions go through PUT /instances (POST /instances/action is
    // deprecated upstream).
    return this.client.request("PUT", "/instances", {
      action,
      id: externalId,
      ...(extra ?? {}),
    })
  }

  async startDeployment(externalId: string): Promise<void> {
    await this.action(externalId, "start")
  }

  async stopDeployment(externalId: string): Promise<void> {
    // `shutdown` keeps billing at the full instance rate on DataCrunch, so a
    // stop that leaves the user paying would be a nasty surprise — delete is
    // the only way to stop charges.
    await this.destroyDeployment(externalId)
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.action(externalId, "shutdown")
    await this.action(externalId, "boot")
  }

  async destroyDeployment(externalId: string): Promise<void> {
    try {
      // Omitting `volume_ids` deletes the OS volume and detaches the rest;
      // we only ever create an OS volume, so this leaves nothing billing.
      await this.action(externalId, "delete")
    } catch (err) {
      if (err instanceof Error && /not_found|404/.test(err.message)) return
      throw err
    }
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const instance = await this.getInstance(externalId)
    const hasIp = Boolean(instance.ip)
    const status = mapStatus(instance.status, hasIp)

    return {
      externalId,
      status,
      endpoint: hasIp && status === "running" ? `http://${instance.ip}:${INFERENCE_PORT}` : null,
      gpuType: instance.instance_type,
      costPerHour: instance.price_per_hour,
      statusDetail: instance.status,
    }
  }

  // ── Logs & metrics (served by the on-instance agent) ───────────────

  async *streamLogs(externalId: string, ctx?: MetricsContext): AsyncGenerator<string> {
    if (!ctx?.metricsToken) {
      yield `[${LABEL}] Container logs require the on-instance log agent. This deployment predates log capture — redeploy the model to enable logs.`
      return
    }
    let ip: string | null = null
    try {
      ip = (await this.getInstance(externalId)).ip
    } catch {
      /* fall through */
    }
    if (!ip) {
      yield `[${LABEL}] Instance has no public IP yet — logs will be available once it finishes booting.`
      return
    }
    yield* streamAgentLogs(ip, ctx.metricsToken, LABEL)
  }

  async fetchLogs(externalId: string, tail = 500, ctx?: MetricsContext): Promise<string[]> {
    let ip: string | null = null
    try {
      ip = (await this.getInstance(externalId)).ip
    } catch {
      /* reported as unreachable below */
    }
    return fetchAgentLogLines(ip, ctx?.metricsToken, tail, LABEL)
  }

  getMetricsCapabilities(ctx?: MetricsContext): MetricsCapabilities {
    const hasAgent = Boolean(ctx?.metricsToken)
    return {
      gpuUtilization: hasAgent,
      vram: hasAgent,
      temperature: hasAgent,
      power: hasAgent,
      clocks: hasAgent,
      perGpu: hasAgent,
      container: false,
      uptime: false,
      costPerHour: true,
    }
  }

  async getMetrics(externalId: string, ctx?: MetricsContext): Promise<GPUMetrics> {
    if (!ctx?.metricsToken) {
      throw new Error("DataCrunch metrics require the on-instance agent (no metrics token)")
    }
    const instance = await this.getInstance(externalId)
    if (!instance.ip) {
      throw new Error("DataCrunch instance has no public IP yet — metrics unavailable")
    }
    const gpus = await fetchAgentGpus(instance.ip, ctx.metricsToken)
    if (gpus.length === 0) throw new Error("DataCrunch agent reported no GPUs")
    return aggregateGpuMetrics(gpus, instance.price_per_hour)
  }

  // ── Catalog ────────────────────────────────────────────────────────

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    // /instance-types is public, so it can't verify the key on its own —
    // hit an authenticated endpoint first so a bad credential fails here.
    await this.client.request<DCAvailability[]>("GET", "/instance-availability")

    const types = await fetchDataCrunchInstanceTypes<DCInstanceType[]>()
    return types
      .filter((t) => t.gpu.number_of_gpus > 0)
      .map((t) => ({
        type: t.instance_type,
        vramGb: t.gpu_memory.size_in_gigabytes,
        costPerHour: Number(t.price_per_hour),
      }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

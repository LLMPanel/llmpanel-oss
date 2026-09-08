import type { IGPUProvider, DeployModelInput, DeploymentInfo, GPUMetrics, MetricsCapabilities } from "../types"
import { thundercomputeRequest } from "./thundercompute.client"

// ── Thunder Compute API response shapes ──────────────────────────────

interface ThunderCreateResponse {
  identifier: number
  uuid: string
  // Generated private key, only returned once when no public_key was supplied
  key?: string
}

interface ThunderInstance {
  id: string
  uuid: string
  name: string
  status: string
  ip: string
  port: number          // SSH port
  httpPorts: number[]   // forwarded HTTP ports (proxied via thundercompute.net)
  cpuCores: string
  memory: string
  numGpus: string
  gpuType: string
  storage: number
  template: string
  mode: string
  createdAt: string
}

// The list endpoint returns an object keyed by instance id
type ThunderListResponse = Record<string, ThunderInstance>

interface ThunderPortsResponse {
  http_ports?: number[]
  identifier: string
  instance_name: string
}

// ── Deploy defaults ──────────────────────────────────────────────────
// Thunder's create endpoint requires fields that DeployModelInput doesn't
// carry. These mirror Hot Aisle's approach of deriving sane fixed specs.
const DEFAULT_CPU_CORES = 4
const DEFAULT_DISK_SIZE_GB = 100
const DEFAULT_MODE = "production"
const DEFAULT_TEMPLATE = "ubuntu-22.04"
// Port the inference server listens on inside the instance. Thunder exposes it
// through its HTTP proxy once forwarded (see endpointFor).
const INFERENCE_PORT = 8000
// Default login user for the ubuntu-22.04 template.
const SSH_USER = "ubuntu"

// Thunder Compute has no GPU-catalog endpoint, so we publish the supported
// types statically. VRAM is the per-GPU memory in GB; pricing isn't exposed.
const SUPPORTED_GPUS: Array<{ type: string; vramGb: number }> = [
  { type: "T4", vramGb: 16 },
  { type: "A100", vramGb: 40 },
  { type: "A100XL", vramGb: 80 },
  { type: "H100", vramGb: 80 },
]

// ── Provider ──────────────────────────────────────────────────────────

export class ThunderComputeProvider implements IGPUProvider {
  private readonly apiKey: string
  // Optional operator-supplied SSH public key. When set, it's seeded into the
  // instance's authorized_keys at create time so the box is reachable with a
  // key we control — rather than relying on Thunder's one-time private key.
  private readonly sshPublicKey: string | undefined

  constructor(apiKey: string, sshPublicKey?: string) {
    this.apiKey = apiKey
    this.sshPublicKey = (sshPublicKey ?? process.env.THUNDER_SSH_PUBLIC_KEY)?.trim() || undefined
  }

  private request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return thundercomputeRequest<T>(this.apiKey, method, path, body)
  }

  private async findInstance(externalId: string): Promise<ThunderInstance | undefined> {
    const instances = await this.request<ThunderListResponse>("GET", "/instances/list")
    return Object.values(instances).find((i) => String(i.id) === externalId)
  }

  /** Reachable URL for a forwarded HTTP port, via Thunder's proxy. */
  private endpointFor(instance: ThunderInstance, port: number): string {
    return `https://${instance.uuid}-${port}.thundercompute.net`
  }

  /** Map a Thunder instance status string onto our deployment status enum. */
  private mapStatus(status: string, hasIp: boolean): DeploymentInfo["status"] {
    const s = status.toLowerCase()
    if (s === "running" || s === "active") return hasIp ? "running" : "provisioning"
    if (s === "stopped" || s === "stopping") return "stopped"
    if (s === "error" || s === "failed") return "failed"
    // pending / starting / provisioning / restoring / unknown
    return "provisioning"
  }

  /** Idempotently forward an HTTP port; returns the resulting forwarded ports. */
  private async forwardPort(externalId: string, port: number): Promise<number[]> {
    const res = await this.request<ThunderPortsResponse>(
      "PATCH",
      `/instances/${externalId}/ports`,
      { add_ports: [port], remove_ports: [] }
    )
    return res.http_ports ?? [port]
  }

  /** Append an SSH public key to a running instance's authorized_keys. */
  async addSshKey(externalId: string, publicKey: string): Promise<void> {
    await this.request("POST", `/instances/${externalId}/add_key`, { public_key: publicKey })
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const numGpus = input.gpuCount ?? 1

    const res = await this.request<ThunderCreateResponse>("POST", "/instances/create", {
      cpu_cores: DEFAULT_CPU_CORES,
      disk_size_gb: DEFAULT_DISK_SIZE_GB,
      gpu_type: input.gpuType,
      num_gpus: numGpus,
      mode: DEFAULT_MODE,
      template: DEFAULT_TEMPLATE,
      // Seed our own key when configured so SSH access is deterministic.
      ...(this.sshPublicKey ? { public_key: this.sshPublicKey } : {}),
    })

    return {
      externalId: String(res.identifier),
      status: "provisioning",
      endpoint: null,
      gpuType: input.gpuType,
      costPerHour: null,
    }
  }

  async startDeployment(_externalId: string): Promise<void> {
    // Thunder Compute has no start endpoint — instances run once created.
  }

  async stopDeployment(externalId: string): Promise<void> {
    // Thunder Compute has no stop endpoint — release the instance instead.
    await this.destroyDeployment(externalId)
  }

  async restartDeployment(externalId: string): Promise<void> {
    // Thunder Compute has no restart endpoint — would require destroy + recreate.
    void externalId
  }

  async destroyDeployment(externalId: string): Promise<void> {
    await this.request("POST", `/instances/${externalId}/delete`)
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const instance = await this.findInstance(externalId)

    if (!instance) {
      return {
        externalId,
        status: "stopped",
        endpoint: null,
        gpuType: "Unknown GPU",
        costPerHour: null,
      }
    }

    const hasIp = Boolean(instance.ip)
    const status = this.mapStatus(instance.status, hasIp)

    // Ensure the inference port is forwarded once the box is reachable, so the
    // proxied endpoint actually resolves. Best-effort: a forwarding hiccup
    // shouldn't break status polling.
    let httpPorts = instance.httpPorts ?? []
    if (hasIp && !httpPorts.includes(INFERENCE_PORT)) {
      try {
        httpPorts = await this.forwardPort(externalId, INFERENCE_PORT)
      } catch {
        // leave endpoint null until forwarding succeeds on a later poll
      }
    }

    const endpoint = httpPorts.includes(INFERENCE_PORT)
      ? this.endpointFor(instance, INFERENCE_PORT)
      : null

    return {
      externalId,
      status,
      endpoint,
      gpuType: instance.gpuType || "Unknown GPU",
      costPerHour: null, // Thunder Compute does not expose pricing via the API
    }
  }

  /** Build the SSH connection hint for an instance, when its IP is known. */
  private sshGuidance(instance: ThunderInstance | undefined): string[] {
    if (!instance?.ip) {
      return [
        "[Thunder Compute] Container logs are not available via the API.",
        "[Thunder Compute] SSH into the instance once it's running and run: docker logs <container_id>",
      ]
    }
    return [
      "[Thunder Compute] Container logs are not available via the API.",
      `[Thunder Compute] Connect: ssh -p ${instance.port} ${SSH_USER}@${instance.ip}`,
      "[Thunder Compute] Then view logs: docker logs <container_id>",
    ]
  }

  async *streamLogs(externalId: string): AsyncGenerator<string> {
    // Thunder Compute does not expose instance console/logs via the API; surface
    // an accurate SSH command instead of a generic hint.
    let instance: ThunderInstance | undefined
    try {
      instance = await this.findInstance(externalId)
    } catch {
      // fall through to the generic guidance
    }
    for (const line of this.sshGuidance(instance)) yield line
  }

  async fetchLogs(externalId: string, _tail = 500): Promise<string[]> {
    try {
      const instance = await this.findInstance(externalId)
      return this.sshGuidance(instance)
    } catch {
      return this.sshGuidance(undefined)
    }
  }

  getMetricsCapabilities(): MetricsCapabilities {
    return {
      gpuUtilization: false,
      vram: false,
      temperature: false,
      power: false,
      clocks: false,
      perGpu: false,
      container: false,
      uptime: false,
      costPerHour: false,
    }
  }

  async getMetrics(_externalId: string): Promise<GPUMetrics> {
    throw new Error("Thunder Compute does not expose GPU metrics via its API")
  }

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    // Thunder Compute has no GPU-catalog endpoint. Hit /instances/list to
    // validate the API key (this is also used to verify keys on connect),
    // then return the static catalog of supported GPU types.
    await this.request<ThunderListResponse>("GET", "/instances/list")

    return SUPPORTED_GPUS.map((gpu) => ({
      type: gpu.type,
      vramGb: gpu.vramGb,
      costPerHour: null,
    }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

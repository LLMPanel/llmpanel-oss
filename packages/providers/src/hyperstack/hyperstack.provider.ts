import type {
  IGPUProvider,
  DeployModelInput,
  DeploymentInfo,
  GPUMetrics,
  MetricsCapabilities,
  MetricsContext,
} from "../types"
import { buildCloudInit, INFERENCE_PORT } from "../shared/cloud-init"
import {
  METRICS_AGENT_PORT,
  aggregateGpuMetrics,
  fetchAgentGpus,
  fetchAgentLogLines,
  streamAgentLogs,
} from "../shared/agent-client"
import { generateOpenSshEd25519PublicKey } from "../shared/ssh-key"
import { hyperstackRequest } from "./hyperstack.client"

// ── API shapes ───────────────────────────────────────────────────────

interface HSFlavor {
  id: number
  name: string
  region_name: string
  cpu: number
  ram: number
  disk: number
  gpu: string
  gpu_count: number
  stock_available: boolean
  features?: { api_only?: boolean }
}

interface HSFlavorGroup {
  gpu: string
  region_name: string
  flavors: HSFlavor[]
}

interface HSEnvironment {
  id: number
  name: string
  region: string
}

interface HSKeypair {
  id: number
  name: string
  environment?: { id: number; name: string }
}

interface HSSecurityRule {
  id?: number
  direction: string
  ethertype: string
  protocol: string
  remote_ip_prefix: string
  port_range_min?: number
  port_range_max?: number
  status?: string
}

interface HSInstance {
  id: number
  name: string
  status: string
  power_state: string | null
  vm_state: string | null
  fixed_ip: string | null
  floating_ip: string | null
  flavor: HSFlavor
  security_rules: HSSecurityRule[]
}

interface HSPricebookEntry {
  id: number
  name: string
  value: string
}

// ── Constants ────────────────────────────────────────────────────────

const LABEL = "Hyperstack"
/** One environment per region; created on demand. Names must be unique
 *  org-wide, even across regions, hence the region suffix. */
const ENV_PREFIX = "llmpanel"
const KEYPAIR_NAME = "llmpanel"
/** Ubuntu 22.04 with NVIDIA R535/CUDA 12.2 and Docker preinstalled. */
const DEFAULT_IMAGE = "Ubuntu Server 22.04 LTS R535 CUDA 12.2 with Docker"

/** Inbound is closed by default on Hyperstack — even SSH. */
function ingressRules(): HSSecurityRule[] {
  return [22, INFERENCE_PORT, METRICS_AGENT_PORT].map((port) => ({
    direction: "ingress",
    ethertype: "IPv4",
    protocol: "tcp",
    remote_ip_prefix: "0.0.0.0/0",
    port_range_min: port,
    port_range_max: port,
  }))
}

/** Map a Hyperstack VM status onto our deployment status enum. The API
 *  publishes no formal enum — this covers the 13 states documented across the
 *  billing and callback tables, and anything unknown is treated as
 *  transitional rather than failing the deployment. */
function mapStatus(status: string, hasIp: boolean): DeploymentInfo["status"] {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return hasIp ? "running" : "provisioning"
    case "CREATING":
    case "BUILD":
    case "STARTING":
    case "RESTORING":
      return "provisioning"
    case "STOPPING":
    case "SHUTOFF":
    case "HIBERNATING":
    case "HIBERNATED":
    case "DELETING":
    case "DELETED":
      return "stopped"
    case "REBOOTING":
      return "provisioning"
    case "ERROR":
      return "failed"
    default:
      return "provisioning"
  }
}

/** Hyperstack reports a missing floating IP as null *or* an empty string. */
function publicIp(instance: HSInstance): string | null {
  const ip = instance.floating_ip?.trim()
  return ip ? ip : null
}

export class HyperstackProvider implements IGPUProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return hyperstackRequest<T>(this.apiKey, method, path, body)
  }

  private async getInstance(externalId: string): Promise<HSInstance> {
    const res = await this.request<{ instance: HSInstance }>(
      "GET",
      `/core/virtual-machines/${externalId}`,
    )
    return res.instance
  }

  private async listFlavors(): Promise<HSFlavor[]> {
    const res = await this.request<{ data: HSFlavorGroup[] }>("GET", "/core/flavors")
    return res.data.flatMap((group) =>
      group.flavors.map((f) => ({ ...f, region_name: f.region_name || group.region_name })),
    )
  }

  /** GPU $/hr by model name. The pricebook is per-GPU, so an 8× flavor costs
   *  eight times the listed rate. Returns an empty map on failure — pricing is
   *  informational and must never block a deploy. */
  private async pricePerGpu(): Promise<Map<string, number>> {
    try {
      // No {status, message} envelope on this endpoint — it's a bare array.
      const entries = await this.request<HSPricebookEntry[]>("GET", "/pricebook")
      const map = new Map<string, number>()
      for (const e of entries) {
        // Values are strings and may use scientific notation ("0E-9").
        const value = Number(e.value)
        if (Number.isFinite(value)) map.set(e.name, value)
      }
      return map
    } catch {
      return new Map()
    }
  }

  // ── Launch prerequisites ───────────────────────────────────────────

  /** Environments are region-bound and mandatory. Reuse ours if it exists. */
  private async ensureEnvironment(region: string): Promise<string> {
    const name = `${ENV_PREFIX}-${region.toLowerCase()}`
    const res = await this.request<{ environments: HSEnvironment[] }>(
      "GET",
      "/core/environments",
    )
    const existing = res.environments.find((e) => e.name === name)
    if (existing) return existing.name

    try {
      await this.request("POST", "/core/environments", { name, region })
    } catch (err) {
      // A concurrent deploy may have created it between our list and create.
      if (!(err instanceof Error && /already_exist|409/.test(err.message))) throw err
    }
    return name
  }

  /** Keypairs are per-environment and mandatory at launch: a VM can only use a
   *  key belonging to its own environment, so the same public key has to be
   *  imported into each one. Hyperstack imports public keys only — never
   *  generates them — so we make one and discard the private half, since all
   *  provisioning happens through cloud-init rather than over SSH. */
  private async ensureKeypair(environmentName: string): Promise<string> {
    const res = await this.request<{ keypairs: HSKeypair[] }>("GET", "/core/keypairs")
    // Names repeat across environments, so match on both.
    const existing = res.keypairs.find(
      (k) => k.name === KEYPAIR_NAME && k.environment?.name === environmentName,
    )
    if (existing) return existing.name

    // Key names must be unique per environment; a collision elsewhere in the
    // org means we need a distinct name here.
    const nameTaken = res.keypairs.some((k) => k.name === KEYPAIR_NAME)
    const name = nameTaken ? `${KEYPAIR_NAME}-${environmentName}`.slice(0, 50) : KEYPAIR_NAME

    try {
      await this.request("POST", "/core/keypairs", {
        environment_name: environmentName,
        name,
        public_key: generateOpenSshEd25519PublicKey(),
      })
    } catch (err) {
      if (!(err instanceof Error && /already_exist|409/.test(err.message))) throw err
    }
    return name
  }

  // ── IGPUProvider ───────────────────────────────────────────────────

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const flavors = await this.listFlavors()
    const gpuFlavors = flavors.filter((f) => f.gpu_count > 0)

    const wanted = input.gpuType.toLowerCase()
    const flavor =
      gpuFlavors.find((f) => f.name === input.gpuType && f.stock_available) ??
      gpuFlavors.find((f) => f.name === input.gpuType) ??
      gpuFlavors.find((f) => f.name.toLowerCase() === wanted) ??
      gpuFlavors.find((f) => f.gpu.toLowerCase().includes(wanted) && f.stock_available)
    if (!flavor) {
      throw new Error(`Hyperstack has no flavor matching "${input.gpuType}"`)
    }
    if (!flavor.stock_available) {
      throw new Error(
        `No Hyperstack stock for ${flavor.name} in ${flavor.region_name} right now — try again later`,
      )
    }

    const environmentName = await this.ensureEnvironment(flavor.region_name)
    const keyName = await this.ensureKeypair(environmentName)

    const res = await this.request<{ instances: HSInstance[] }>(
      "POST",
      "/core/virtual-machines",
      {
        name: `llmpanel-${input.deploymentId}`.slice(0, 50),
        environment_name: environmentName,
        flavor_name: flavor.name,
        key_name: keyName,
        image_name: DEFAULT_IMAGE,
        count: 1,
        // A floating IP is required for the endpoint to be reachable at all.
        assign_floating_ip: true,
        // Defaults to true, which would publish the service on a random
        // external port instead of 8000 and break the endpoint URL.
        enable_port_randomization: false,
        security_rules: ingressRules(),
        user_data: buildCloudInit(input, { gpuCount: flavor.gpu_count || 1 }),
      },
    )

    const instance = res.instances[0]
    if (!instance) throw new Error("Hyperstack VM create returned no instance")

    const prices = await this.pricePerGpu()
    const perGpu = prices.get(flavor.gpu)
    return {
      externalId: String(instance.id),
      status: "provisioning",
      endpoint: null,
      gpuType: flavor.name,
      costPerHour: perGpu != null ? perGpu * (flavor.gpu_count || 1) : null,
    }
  }

  // Lifecycle actions are GETs with side effects on this API, and every one
  // is asynchronous — the response only confirms it was scheduled.
  async startDeployment(externalId: string): Promise<void> {
    // A hibernated VM has to be restored; only a SHUTOFF one can be started.
    let hibernated = false
    try {
      hibernated = (await this.getInstance(externalId)).status.toUpperCase() === "HIBERNATED"
    } catch {
      /* fall through to a plain start */
    }
    await this.request(
      "GET",
      `/core/virtual-machines/${externalId}/${hibernated ? "hibernate-restore" : "start"}`,
    )
  }

  async stopDeployment(externalId: string): Promise<void> {
    // Stopping a Hyperstack VM leaves it SHUTOFF, which still bills the full
    // flavor rate — GPUs included — because the hardware stays reserved.
    // Hibernation is the only state that deallocates it, so pausing must
    // hibernate. `retain_ip` keeps the endpoint address across the resume.
    try {
      await this.request(
        "GET",
        `/core/virtual-machines/${externalId}/hibernate?retain_ip=true`,
      )
    } catch (err) {
      // Spot and large-root-disk flavors can't hibernate. Fall back to a plain
      // stop so the workload still halts, but say so — this one keeps billing.
      await this.request("GET", `/core/virtual-machines/${externalId}/stop`)
      console.warn(
        `[Hyperstack] ${externalId} could not hibernate (${
          err instanceof Error ? err.message : String(err)
        }); stopped instead — this flavor keeps billing while SHUTOFF.`,
      )
    }
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.request("GET", `/core/virtual-machines/${externalId}/hard-reboot`)
  }

  async destroyDeployment(externalId: string): Promise<void> {
    try {
      await this.request("DELETE", `/core/virtual-machines/${externalId}`)
    } catch (err) {
      if (err instanceof Error && /not_found|404/.test(err.message)) return
      throw err
    }
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const instance = await this.getInstance(externalId)
    const ip = publicIp(instance)
    const status = mapStatus(instance.status, Boolean(ip))

    const prices = await this.pricePerGpu()
    const perGpu = prices.get(instance.flavor?.gpu ?? "")

    return {
      externalId,
      status,
      endpoint: ip && status === "running" ? `http://${ip}:${INFERENCE_PORT}` : null,
      gpuType: instance.flavor?.name ?? "hyperstack",
      costPerHour: perGpu != null ? perGpu * (instance.flavor?.gpu_count || 1) : null,
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
      ip = publicIp(await this.getInstance(externalId))
    } catch {
      /* fall through */
    }
    if (!ip) {
      yield `[${LABEL}] VM has no public IP yet — logs will be available once it finishes booting.`
      return
    }
    yield* streamAgentLogs(ip, ctx.metricsToken, LABEL)
  }

  async fetchLogs(externalId: string, tail = 500, ctx?: MetricsContext): Promise<string[]> {
    let ip: string | null = null
    try {
      ip = publicIp(await this.getInstance(externalId))
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
      throw new Error("Hyperstack metrics require the on-instance agent (no metrics token)")
    }
    const instance = await this.getInstance(externalId)
    const ip = publicIp(instance)
    if (!ip) throw new Error("Hyperstack VM has no public IP yet — metrics unavailable")

    const gpus = await fetchAgentGpus(ip, ctx.metricsToken)
    if (gpus.length === 0) throw new Error("Hyperstack agent reported no GPUs")

    const prices = await this.pricePerGpu()
    const perGpu = prices.get(instance.flavor?.gpu ?? "")
    return aggregateGpuMetrics(
      gpus,
      perGpu != null ? perGpu * (instance.flavor?.gpu_count || 1) : null,
    )
  }

  // ── Catalog ────────────────────────────────────────────────────────

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    // Doubles as the connect-time credential probe: fails on a bad key.
    const flavors = await this.listFlavors()
    const prices = await this.pricePerGpu()

    return flavors
      .filter((f) => f.gpu_count > 0)
      .map((f) => {
        const perGpu = prices.get(f.gpu)
        return {
          type: f.name,
          // VRAM isn't a field — it's encoded in the model name (H100-80G-PCIe).
          vramGb: parseGpuVram(f.gpu),
          costPerHour: perGpu != null ? perGpu * (f.gpu_count || 1) : null,
        }
      })
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

/** Per-GPU VRAM parsed out of a model name like "H100-80G-PCIe". */
export function parseGpuVram(gpuModel: string): number {
  const m = /-(\d+)G\b/i.exec(gpuModel)
  if (m) return Number(m[1])
  // Models that don't encode VRAM in the name.
  const known: Record<string, number> = {
    "RTX-A6000": 48,
    "RTX-A4000": 16,
    L40: 48,
    "RTX-PRO6000-SE": 96,
    "B200-SXM": 192,
  }
  return known[gpuModel] ?? 0
}

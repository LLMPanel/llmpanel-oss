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
  METRICS_AGENT_PORT,
  aggregateGpuMetrics,
  fetchAgentGpus,
  fetchAgentLogLines,
  streamAgentLogs,
} from "../shared/agent-client"
import { generateOpenSshEd25519PublicKey } from "../shared/ssh-key"
import { tensordockRequest, tensordockV1List } from "./tensordock.client"

// ── API shapes ───────────────────────────────────────────────────────

interface TDGpu {
  v0Name: string
  displayName: string
  max_count: number
  price_per_hr: number
  resources?: { max_vcpus: number; max_ram_gb: number; max_storage_gb: number }
  pricing?: { per_vcpu_hr: number; per_gb_ram_hr: number; per_gb_storage_hr: number }
  network_features?: {
    dedicated_ip_available?: boolean
    port_forwarding_available?: boolean
  }
}

interface TDLocation {
  id: string
  city: string
  stateprovince: string
  country: string
  tier: number
  gpus: TDGpu[]
}

interface TDPortForward {
  internal_port: number
  external_port: number
}

// Public v1 inventory (shapes verified against the live API).
interface TDV1Hostnode {
  id: string
  location_id: string
  available_resources: {
    gpus: Record<string, { count: number }>
    vcpu_count: number
    ram_gb: number
    storage_gb: number
  }
  pricing: {
    per_gpu_hr: Record<string, string>
    per_vcpu_hr: string
    per_gb_ram_hr: string
    per_gb_storage_hr: string
  }
  available_ports: number[]
}

interface TDV1Location {
  id: string
  city: string
  region: string
  country: string
  hostnodes: TDV1Hostnode[]
}

/** One deployable GPU option, normalized across the v2 and v1 inventory
 *  sources so the rest of the provider doesn't care which answered. */
interface TDOffer {
  gpuModel: string
  displayName: string
  availableCount: number
  pricePerGpuHr: number
  perVcpuHr: number
  perGbRamHr: number
  perGbStorageHr: number
  locationId: string
  /** Set only for v1 offers, which resolve down to a specific machine. */
  hostnodeId?: string
  datacenter: string
  dedicatedIpAvailable: boolean
  freePorts: number
}

interface TDInstanceDetail {
  type: string
  id: string
  name: string
  status: string
  ipAddress: string | null
  portForwards?: TDPortForward[]
  resources?: {
    vcpu_count: number
    ram_gb: number
    storage_gb: number
    gpus?: Record<string, { count: number; v0Name: string }>
  }
  rateHourly?: number
}

// ── Constants ────────────────────────────────────────────────────────

const LABEL = "TensorDock"
/** Ubuntu 24.04 with pinned NVIDIA 570 drivers. TensorDock images ship Docker
 *  preinstalled; the unpinned variants auto-update drivers on first boot and
 *  routinely break nvidia-smi, so the pinned image is the safer default. */
const DEFAULT_IMAGE = "ubuntu2404_nvidia_570"
const MIN_STORAGE_GB = 100
const DEFAULT_VCPUS = 8
const DEFAULT_RAM_GB = 32

/** TensorDock reports status in inconsistent casing across its surfaces
 *  (`running` in the REST docs, `Running`/`StoppedDisassociated` in the
 *  dashboard model), so matching is case-insensitive with a permissive
 *  default rather than an exhaustive enum. */
function mapStatus(status: string, hasIp: boolean): DeploymentInfo["status"] {
  const s = status.toLowerCase()
  if (s === "running" || s === "active") return hasIp ? "running" : "provisioning"
  if (s === "starting" || s === "pending" || s === "deploying") return "provisioning"
  // `stoppeddisassociated` means the VM was released from its physical host.
  if (s.startsWith("stopped") || s === "stopping" || s === "inactive") return "stopped"
  if (s === "error" || s === "failed") return "failed"
  return "provisioning"
}

/** VRAM parsed out of a GPU key like "h100-sxm5-80gb" or "geforcertx4090-pcie-24gb". */
export function parseTensorDockVram(v0Name: string): number {
  const m = /-(\d+)gb$/i.exec(v0Name)
  return m ? Number(m[1]) : 0
}

export class TensorDockProvider implements IGPUProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return tensordockRequest<T>(this.apiKey, method, path, body)
  }

  private async listLocations(): Promise<TDLocation[]> {
    const res = await this.request<{ data: { locations: TDLocation[] } }>(
      "GET",
      "/locations",
    )
    return res.data?.locations ?? []
  }

  /**
   * Deployable GPU options.
   *
   * v2's /locations is the documented source but returns an empty array
   * regardless of credentials, so when it comes back empty we fall back to the
   * public v1 inventory API — which also pins down a specific hostnode, and
   * v2's create accepts `hostnode_id` in place of `location_id`.
   */
  async listOffers(): Promise<TDOffer[]> {
    const v2 = await this.listLocations().catch(() => [] as TDLocation[])

    const offers: TDOffer[] = []
    for (const loc of v2) {
      for (const gpu of loc.gpus) {
        if (gpu.max_count <= 0) continue
        offers.push({
          gpuModel: gpu.v0Name,
          displayName: gpu.displayName || gpu.v0Name,
          availableCount: gpu.max_count,
          pricePerGpuHr: gpu.price_per_hr,
          perVcpuHr: gpu.pricing?.per_vcpu_hr ?? 0,
          perGbRamHr: gpu.pricing?.per_gb_ram_hr ?? 0,
          perGbStorageHr: gpu.pricing?.per_gb_storage_hr ?? 0,
          locationId: loc.id,
          datacenter: [loc.city, loc.stateprovince, loc.country].filter(Boolean).join(", "),
          dedicatedIpAvailable: gpu.network_features?.dedicated_ip_available === true,
          freePorts: Number.POSITIVE_INFINITY,
        })
      }
    }
    if (offers.length > 0) return offers

    const v1 = await tensordockV1List<TDV1Location>("/locations/")
    for (const loc of v1) {
      const datacenter = [loc.city, loc.region, loc.country].filter(Boolean).join(", ")
      for (const node of loc.hostnodes ?? []) {
        for (const [model, info] of Object.entries(node.available_resources?.gpus ?? {})) {
          if (!info || info.count <= 0) continue
          // v1 reports every price as a string.
          const price = Number(node.pricing?.per_gpu_hr?.[model])
          offers.push({
            gpuModel: model,
            displayName: model,
            availableCount: info.count,
            pricePerGpuHr: Number.isFinite(price) ? price : 0,
            perVcpuHr: Number(node.pricing?.per_vcpu_hr) || 0,
            perGbRamHr: Number(node.pricing?.per_gb_ram_hr) || 0,
            perGbStorageHr: Number(node.pricing?.per_gb_storage_hr) || 0,
            locationId: loc.id,
            hostnodeId: node.id,
            datacenter,
            // v1 exposes no dedicated-IP flag; NAT forwarding is the safe
            // assumption, and it needs free ports to be usable at all.
            dedicatedIpAvailable: false,
            freePorts: node.available_ports?.length ?? 0,
          })
        }
      }
    }
    return offers
  }

  private getInstanceDetail(externalId: string): Promise<TDInstanceDetail> {
    // Unlike most endpoints, the detail response is not wrapped in `data`.
    return this.request<TDInstanceDetail>("GET", `/instances/${externalId}`)
  }

  /** Resolve the externally reachable port for a port inside the VM. On a
   *  dedicated IP there are no forwards and ports pass through unchanged. */
  private externalPort(instance: TDInstanceDetail, internal: number): number | null {
    const forwards = instance.portForwards ?? []
    if (forwards.length === 0) return internal
    return forwards.find((f) => Number(f.internal_port) === internal)?.external_port ?? null
  }

  // ── IGPUProvider ───────────────────────────────────────────────────

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const offers = await this.listOffers()
    if (offers.length === 0) {
      throw new Error(
        "TensorDock is reporting no available capacity right now — nothing to deploy onto",
      )
    }

    const wanted = input.gpuType.toLowerCase()
    const matching = offers.filter(
      (o) =>
        o.gpuModel === input.gpuType ||
        o.gpuModel.toLowerCase() === wanted ||
        o.displayName.toLowerCase() === wanted,
    )
    if (matching.length === 0) {
      throw new Error(`TensorDock has no available capacity for "${input.gpuType}"`)
    }

    const requested = input.gpuCount ?? 1
    // Needs enough GPUs, and — on NAT hosts — enough free ports to publish
    // SSH, the inference port and the agent. Cheapest wins among those.
    const usable = matching
      .filter((o) => o.availableCount >= requested)
      .filter((o) => o.dedicatedIpAvailable || o.freePorts >= 3)
      .sort((a, b) => a.pricePerGpuHr - b.pricePerGpuHr)

    const offer = usable[0] ?? matching[0]
    const gpuCount = Math.min(requested, offer.availableCount)
    const storageGb = Math.max(MIN_STORAGE_GB, 150)

    // A dedicated IP leaves every port reachable as-is, which keeps the
    // inference endpoint on 8000 and the agent on its native port. Only fall
    // back to NAT forwarding (which assigns arbitrary external ports) when
    // the host can't provide one.
    const useDedicatedIp = offer.dedicatedIpAvailable

    // TensorDock's cloud-init is a typed object, not raw user-data YAML: only
    // runcmd / packages / write_files / package_* are honoured. The shared
    // bootstrap is written to disk and then executed.
    const bootstrap = buildBootstrapScript(input, { gpuCount })
    const cloudInit = {
      write_files: [
        {
          path: "/opt/llmpanel/bootstrap.sh",
          content: bootstrap,
          owner: "root:root",
          permissions: "0755",
        },
      ],
      runcmd: ["bash /opt/llmpanel/bootstrap.sh"],
    }

    const res = await this.request<{ data: { id: string; status?: string } }>(
      "POST",
      "/instances",
      {
        data: {
          type: "virtualmachine",
          attributes: {
            name: `llmpanel-${input.deploymentId}`.slice(0, 60),
            type: "virtualmachine",
            image: DEFAULT_IMAGE,
            resources: {
              vcpu_count: DEFAULT_VCPUS,
              ram_gb: DEFAULT_RAM_GB,
              storage_gb: storageGb,
              gpus: { [offer.gpuModel]: { count: gpuCount } },
            },
            // Placement is either/or: a hostnode when v1 resolved one,
            // otherwise the location with TensorDock picking the machine.
            ...(offer.hostnodeId
              ? { hostnode_id: offer.hostnodeId }
              : { location_id: offer.locationId }),
            // An SSH key is mandatory even though provisioning runs entirely
            // from cloud-init, so a throwaway key satisfies the requirement.
            ssh_key: generateOpenSshEd25519PublicKey(),
            ...(useDedicatedIp
              ? { useDedicatedIp: true }
              : {
                  // external_port 0 asks TensorDock to assign one from the
                  // host's pool; the mapping is read back on status polls.
                  port_forwards: [
                    { internal_port: 22, external_port: 0 },
                    { internal_port: INFERENCE_PORT, external_port: 0 },
                    { internal_port: METRICS_AGENT_PORT, external_port: 0 },
                  ],
                }),
            cloud_init: cloudInit,
          },
        },
      },
    )

    const instanceId = res.data?.id
    if (!instanceId) throw new Error("TensorDock instance create returned no id")

    // TensorDock bills GPUs, vCPU, RAM and storage as separate line items.
    const perHour =
      offer.pricePerGpuHr * gpuCount +
      offer.perVcpuHr * DEFAULT_VCPUS +
      offer.perGbRamHr * DEFAULT_RAM_GB +
      offer.perGbStorageHr * storageGb

    return {
      externalId: instanceId,
      status: "provisioning",
      endpoint: null,
      gpuType: offer.gpuModel,
      costPerHour: Number(perHour.toFixed(4)),
    }
  }

  async startDeployment(externalId: string): Promise<void> {
    await this.request("POST", `/instances/${externalId}/start`)
  }

  async stopDeployment(externalId: string): Promise<void> {
    await this.request("POST", `/instances/${externalId}/stop`)
  }

  async restartDeployment(externalId: string): Promise<void> {
    // TensorDock exposes no restart/reboot route, so it is composed from
    // stop + start with a short wait for the stop to take effect.
    await this.stopDeployment(externalId)
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const instance = await this.getInstanceDetail(externalId)
        if (instance.status.toLowerCase().startsWith("stopped")) break
      } catch {
        break
      }
    }
    await this.startDeployment(externalId)
  }

  async destroyDeployment(externalId: string): Promise<void> {
    try {
      await this.request("DELETE", `/instances/${externalId}`)
    } catch (err) {
      if (err instanceof Error && /404|not found/i.test(err.message)) return
      throw err
    }
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const instance = await this.getInstanceDetail(externalId)
    const ip = instance.ipAddress?.trim() || null
    const status = mapStatus(instance.status, Boolean(ip))
    const port = this.externalPort(instance, INFERENCE_PORT)

    const gpuEntry = Object.values(instance.resources?.gpus ?? {})[0]

    return {
      externalId,
      status,
      endpoint: ip && port && status === "running" ? `http://${ip}:${port}` : null,
      gpuType: gpuEntry?.v0Name ?? "tensordock",
      costPerHour: instance.rateHourly ?? null,
      statusDetail: instance.status,
    }
  }

  // ── Logs & metrics (served by the on-instance agent) ───────────────

  /** IP plus the externally reachable agent port, which differs per instance
   *  when TensorDock NAT-forwards instead of assigning a dedicated IP. */
  private async agentTarget(
    externalId: string,
  ): Promise<{ ip: string | null; port: number | undefined }> {
    try {
      const instance = await this.getInstanceDetail(externalId)
      const ip = instance.ipAddress?.trim() || null
      const port = this.externalPort(instance, METRICS_AGENT_PORT)
      return { ip, port: port ?? undefined }
    } catch {
      return { ip: null, port: undefined }
    }
  }

  async *streamLogs(externalId: string, ctx?: MetricsContext): AsyncGenerator<string> {
    if (!ctx?.metricsToken) {
      yield `[${LABEL}] Container logs require the on-instance log agent. This deployment predates log capture — redeploy the model to enable logs.`
      return
    }
    const { ip, port } = await this.agentTarget(externalId)
    if (!ip) {
      yield `[${LABEL}] Instance has no public IP yet — logs will be available once it finishes booting.`
      return
    }
    yield* streamAgentLogs(ip, ctx.metricsToken, LABEL, port)
  }

  async fetchLogs(externalId: string, tail = 500, ctx?: MetricsContext): Promise<string[]> {
    const { ip, port } = await this.agentTarget(externalId)
    return fetchAgentLogLines(ip, ctx?.metricsToken, tail, LABEL, port)
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
      throw new Error("TensorDock metrics require the on-instance agent (no metrics token)")
    }
    const instance = await this.getInstanceDetail(externalId)
    const ip = instance.ipAddress?.trim() || null
    if (!ip) throw new Error("TensorDock instance has no public IP yet — metrics unavailable")

    const port = this.externalPort(instance, METRICS_AGENT_PORT) ?? undefined
    const gpus = await fetchAgentGpus(ip, ctx.metricsToken, port)
    if (gpus.length === 0) throw new Error("TensorDock agent reported no GPUs")
    return aggregateGpuMetrics(gpus, instance.rateHourly ?? null)
  }

  // ── Catalog ────────────────────────────────────────────────────────

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    // Inventory is readable without credentials, so it can't validate the
    // token on its own — hit an authenticated route first so a bad key fails
    // at connect time.
    await this.request<{ data: unknown }>("GET", "/instances")

    const byName = new Map<string, { type: string; vramGb: number; costPerHour: number | null }>()
    for (const offer of await this.listOffers()) {
      const existing = byName.get(offer.gpuModel)
      // Keep the cheapest host for a given GPU across locations.
      if (!existing || (existing.costPerHour ?? Infinity) > offer.pricePerGpuHr) {
        byName.set(offer.gpuModel, {
          type: offer.gpuModel,
          vramGb: parseTensorDockVram(offer.gpuModel),
          costPerHour: offer.pricePerGpuHr,
        })
      }
    }
    return [...byName.values()]
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

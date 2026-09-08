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
import { lambdaRequest } from "./lambdalabs.client"

// ── Lambda Cloud API shapes ──────────────────────────────────────────

interface LambdaRegion {
  name: string
  description: string
}

interface LambdaInstanceType {
  name: string
  description: string
  gpu_description: string
  price_cents_per_hour: number
  specs: { vcpus: number; memory_gib: number; storage_gib: number; gpus: number }
}

interface LambdaInstanceTypeEntry {
  instance_type: LambdaInstanceType
  regions_with_capacity_available: LambdaRegion[]
}

interface LambdaInstance {
  id: string
  name?: string | null
  ip?: string | null
  status: string
  region: LambdaRegion
  instance_type: LambdaInstanceType
}

interface LambdaSSHKey {
  id: string
  name: string
}

interface LambdaFirewallRule {
  protocol: "tcp" | "udp" | "icmp" | "all"
  port_range?: [number, number]
  source_network: string
  description: string
}

interface LambdaRuleset {
  id: string
  name: string
  region: LambdaRegion
  rules: LambdaFirewallRule[]
}

// ── Constants ────────────────────────────────────────────────────────

/** Account-level SSH key seeded on first deploy. Lambda requires exactly one
 *  key per launch; we never SSH in ourselves (cloud-init does the work), so a
 *  generated key whose private half is discarded satisfies the API. */
const SSH_KEY_NAME = "llmpanel"
/** Per-region firewall ruleset opening the inference + agent ports. Lambda is
 *  default-deny inbound (only TCP/22), and rulesets can only be attached at
 *  launch — so it must exist before the instance does. */
const RULESET_NAME = "llmpanel-inference"
/** Prefix on log lines this provider emits itself. */
const LABEL = "Lambda Cloud"

/** Map a Lambda instance status onto our deployment status enum. */
function mapStatus(status: string, hasIp: boolean): DeploymentInfo["status"] {
  switch (status) {
    case "active":
      return hasIp ? "running" : "provisioning"
    case "booting":
      return "provisioning"
    case "terminating":
    case "terminated":
      return "stopped"
    case "unhealthy":
    case "preempted":
      return "failed"
    default:
      return "provisioning"
  }
}

/** Per-GPU VRAM from a description like "H100 (80 GB SXM5)". */
function parseVramGb(gpuDescription: string): number {
  const m = /(\d+(?:\.\d+)?)\s*GB/i.exec(gpuDescription)
  return m ? Number(m[1]) : 0
}

export class LambdaLabsProvider implements IGPUProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    // Never validate eagerly — the metrics controller constructs providers
    // with a dummy key just to read capabilities.
    this.apiKey = apiKey
  }

  private request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return lambdaRequest<T>(this.apiKey, method, path, body)
  }

  private getInstance(externalId: string): Promise<LambdaInstance> {
    return this.request<LambdaInstance>("GET", `/instances/${externalId}`)
  }

  private listInstanceTypes(): Promise<Record<string, LambdaInstanceTypeEntry>> {
    return this.request<Record<string, LambdaInstanceTypeEntry>>("GET", "/instance-types")
  }

  // ── Launch prerequisites ───────────────────────────────────────────

  /** Lambda requires exactly one SSH key name at launch. Reuse ours if it
   *  exists, otherwise have Lambda generate one (the private key is returned
   *  once and deliberately discarded — provisioning happens via cloud-init). */
  private async ensureSshKey(): Promise<string> {
    const keys = await this.request<LambdaSSHKey[]>("GET", "/ssh-keys")
    const existing = keys.find((k) => k.name === SSH_KEY_NAME)
    if (existing) return existing.name
    await this.request<LambdaSSHKey>("POST", "/ssh-keys", { name: SSH_KEY_NAME })
    return SSH_KEY_NAME
  }

  /** Rulesets are region-scoped and attachable only at launch. Best-effort:
   *  a failure (e.g. a region without firewall support, like us-south-1)
   *  returns null and the launch proceeds without an explicit ruleset. */
  private async ensureRuleset(regionName: string): Promise<string | null> {
    const rules: LambdaFirewallRule[] = [
      { protocol: "tcp", port_range: [22, 22], source_network: "0.0.0.0/0", description: "SSH" },
      {
        protocol: "tcp",
        port_range: [INFERENCE_PORT, INFERENCE_PORT],
        source_network: "0.0.0.0/0",
        description: "LLMPanel inference API",
      },
      {
        protocol: "tcp",
        port_range: [METRICS_AGENT_PORT, METRICS_AGENT_PORT],
        source_network: "0.0.0.0/0",
        description: "LLMPanel metrics/logs agent",
      },
    ]
    try {
      const rulesets = await this.request<LambdaRuleset[]>("GET", "/firewall-rulesets")
      const existing = rulesets.find(
        (r) => r.name === RULESET_NAME && r.region.name === regionName
      )
      if (existing) return existing.id
      const created = await this.request<LambdaRuleset>("POST", "/firewall-rulesets", {
        name: RULESET_NAME,
        region: regionName,
        rules,
      })
      return created.id
    } catch {
      return null
    }
  }

  // ── IGPUProvider ───────────────────────────────────────────────────

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const types = await this.listInstanceTypes()

    // Exact instance-type name first (what the catalog adapter emits),
    // then a fuzzy match on name / GPU description.
    const wanted = input.gpuType.toLowerCase()
    const entry =
      types[input.gpuType] ??
      Object.values(types).find(
        (t) =>
          t.instance_type.name.toLowerCase() === wanted ||
          t.instance_type.gpu_description.toLowerCase().includes(wanted)
      )
    if (!entry) {
      throw new Error(`Lambda Cloud has no instance type matching "${input.gpuType}"`)
    }

    const region = entry.regions_with_capacity_available[0]
    if (!region) {
      throw new Error(
        `No Lambda Cloud capacity for ${entry.instance_type.name} in any region right now — try again later`
      )
    }

    const sshKeyName = await this.ensureSshKey()
    const rulesetId = await this.ensureRuleset(region.name)

    // Hostname: 1-63 chars matching ^[a-z0-9][0-9a-z-]{0,62}$
    const hostname = `llmpanel-${input.deploymentId.toLowerCase().replace(/[^a-z0-9-]/g, "")}`
      .slice(0, 63)
      .replace(/-+$/, "")

    const { instance_ids } = await this.request<{ instance_ids: string[] }>(
      "POST",
      "/instance-operations/launch",
      {
        region_name: region.name,
        instance_type_name: entry.instance_type.name,
        ssh_key_names: [sshKeyName],
        name: `llmpanel-${input.deploymentId}`.slice(0, 64),
        hostname,
        tags: [{ key: "managed-by", value: "llmpanel" }],
        // GPU count is fixed by the instance type (gpu_8x_… is always 8) —
        // tensor parallelism must match the hardware, not the requested count.
        user_data: buildCloudInit(input, { gpuCount: entry.instance_type.specs.gpus || 1 }),
        ...(rulesetId ? { firewall_rulesets: [{ id: rulesetId }] } : {}),
      }
    )

    const instanceId = instance_ids[0]
    if (!instanceId) throw new Error("Lambda Cloud launch returned no instance id")

    return {
      externalId: instanceId,
      status: "provisioning",
      endpoint: null,
      gpuType: entry.instance_type.name,
      costPerHour: entry.instance_type.price_cents_per_hour / 100,
    }
  }

  async startDeployment(_externalId: string): Promise<void> {
    // Lambda has no stopped state — instances are either running or gone.
  }

  async stopDeployment(externalId: string): Promise<void> {
    // No stop/suspend on Lambda; terminating is the only way to stop billing.
    await this.destroyDeployment(externalId)
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.request("POST", "/instance-operations/restart", {
      instance_ids: [externalId],
    })
  }

  async destroyDeployment(externalId: string): Promise<void> {
    try {
      await this.request("POST", "/instance-operations/terminate", {
        instance_ids: [externalId],
      })
    } catch (err) {
      // Already terminated instances report object-does-not-exist — that's fine.
      if (err instanceof Error && err.message.includes("object-does-not-exist")) return
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
      gpuType: instance.instance_type.name,
      costPerHour: instance.instance_type.price_cents_per_hour / 100,
      statusDetail: instance.status,
    }
  }

  // ── Logs (served by the on-instance agent) ─────────────────────────

  async *streamLogs(externalId: string, ctx?: MetricsContext): AsyncGenerator<string> {
    if (!ctx?.metricsToken) {
      yield `[${LABEL}] Container logs require the on-instance log agent. This deployment predates log capture — redeploy the model to enable logs.`
      return
    }

    let ip: string | null = null
    try {
      ip = (await this.getInstance(externalId)).ip ?? null
    } catch {
      /* fall through to the waiting message */
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
      ip = (await this.getInstance(externalId)).ip ?? null
    } catch {
      /* reported as unreachable below */
    }
    return fetchAgentLogLines(ip, ctx?.metricsToken, tail, LABEL)
  }

  // ── Metrics (served by the on-instance agent) ──────────────────────

  getMetricsCapabilities(ctx?: MetricsContext): MetricsCapabilities {
    // All GPU metrics come from the on-instance nvidia-smi agent, which only
    // exists on deployments provisioned with a metrics token.
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
      throw new Error("Lambda Cloud metrics require the on-instance agent (no metrics token)")
    }
    const instance = await this.getInstance(externalId)
    if (!instance.ip) {
      throw new Error("Lambda Cloud instance has no public IP yet — metrics unavailable")
    }

    const gpus = await fetchAgentGpus(instance.ip, ctx.metricsToken)
    if (gpus.length === 0) throw new Error("Lambda Cloud agent reported no GPUs")
    return aggregateGpuMetrics(gpus, instance.instance_type.price_cents_per_hour / 100)
  }

  // ── Catalog ────────────────────────────────────────────────────────

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    // Also serves as the connect-time credential probe: it fails on a bad key.
    const types = await this.listInstanceTypes()
    return Object.values(types).map((t) => ({
      type: t.instance_type.name,
      vramGb: parseVramGb(t.instance_type.gpu_description),
      costPerHour: t.instance_type.price_cents_per_hour / 100,
    }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

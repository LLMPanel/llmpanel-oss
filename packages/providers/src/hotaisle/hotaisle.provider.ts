import type { IGPUProvider, DeployModelInput, DeploymentInfo, GPUMetrics, MetricsCapabilities } from "../types"
import { hotaisleRequest } from "./hotaisle.client"

// ── Hot Aisle API response shapes ────────────────────────────────────

interface HotAisleGPU {
  count: number
  manufacturer: string
  model: string
}

interface HotAisleCPU {
  count: number
  manufacturer: string
  model: string
  cores: number
  frequency: number // Hz
}

interface HotAisleExternalService {
  ip_address: string
  port: number
  dns_name?: string
}

interface HotAisleVMDetails {
  name: string
  ip_address: string
  description?: string
  ssh_access: HotAisleExternalService
  cpu_cores: number
  ram_capacity: number   // bytes
  disk_capacity: number  // bytes
  cpus?: HotAisleCPU
  gpus?: HotAisleGPU[]
}

interface HotAisleVMSpecs {
  cpu_cores: number
  ram_capacity: number
  disk_capacity: number
  cpus?: HotAisleCPU
  gpus?: HotAisleGPU[]
}

interface HotAisleAvailableType {
  Quantity: number
  MinimumReservationMinutes: number
  OnDemandPrice?: number // cents per hour
  Specs: HotAisleVMSpecs
}

// ── Provider ──────────────────────────────────────────────────────────

export class HotAisleProvider implements IGPUProvider {
  private readonly apiKey: string
  private readonly teamHandle: string

  constructor(apiKey: string, teamHandle?: string) {
    this.apiKey = apiKey
    // Team handle can be embedded in the API key as "key:team" or passed separately
    if (apiKey.includes(":")) {
      const [key, team] = apiKey.split(":", 2)
      this.apiKey = key
      this.teamHandle = team
    } else {
      this.teamHandle = teamHandle ?? "default"
    }
  }

  private request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return hotaisleRequest<T>(this.apiKey, method, path, body)
  }

  private vmPath(vmName?: string): string {
    const base = `/teams/${this.teamHandle}/virtual_machines/`
    return vmName ? `${base}${vmName}/` : base
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const gpuCount = input.gpuCount ?? 1

    // Find a matching available VM type with GPUs
    const available = await this.request<HotAisleAvailableType[]>(
      "GET",
      `${this.vmPath()}available/`
    )

    // Find the best matching type — prefer one with the requested GPU, then fall back
    let selectedType: HotAisleAvailableType | undefined
    for (const vmType of available) {
      if (vmType.Quantity <= 0) continue
      const gpus = vmType.Specs.gpus
      if (!gpus || gpus.length === 0) continue

      // Match by GPU model name
      const matchesGpu = gpus.some(
        (g) =>
          g.model.toLowerCase().includes(input.gpuType.toLowerCase()) ||
          input.gpuType.toLowerCase().includes(g.model.toLowerCase())
      )
      const hasEnoughGpus = gpus.reduce((sum, g) => sum + g.count, 0) >= gpuCount

      if (matchesGpu && hasEnoughGpus) {
        selectedType = vmType
        break
      }
    }

    // Fallback: pick any GPU VM with enough GPUs
    if (!selectedType) {
      selectedType = available.find((t) => {
        if (t.Quantity <= 0) return false
        const gpus = t.Specs.gpus
        if (!gpus || gpus.length === 0) return false
        return gpus.reduce((sum, g) => sum + g.count, 0) >= gpuCount
      })
    }

    if (!selectedType) {
      throw new Error(`No Hot Aisle VM available with GPU type: ${input.gpuType}`)
    }

    // Provision the VM
    const vm = await this.request<HotAisleVMDetails>("POST", this.vmPath(), {
      cpu_cores: selectedType.Specs.cpu_cores,
      ram_capacity: selectedType.Specs.ram_capacity,
      disk_capacity: selectedType.Specs.disk_capacity,
      cpus: selectedType.Specs.cpus,
      gpus: selectedType.Specs.gpus,
    })

    const gpuName = vm.gpus?.[0]?.model ?? input.gpuType
    const costCentsPerHour = selectedType.OnDemandPrice ?? null
    const costPerHour = costCentsPerHour != null ? costCentsPerHour / 100 : null

    return {
      externalId: vm.name,
      status: "provisioning",
      endpoint: null,
      gpuType: gpuName,
      costPerHour,
    }
  }

  async startDeployment(_externalId: string): Promise<void> {
    // Hot Aisle VMs don't have a separate start/stop — they're running after provision
    // No-op since the VM is always running once provisioned
  }

  async stopDeployment(_externalId: string): Promise<void> {
    // Hot Aisle doesn't expose start/stop — only destroy
    // Treating stop as destroy to release the resource
    await this.destroyDeployment(_externalId)
  }

  async restartDeployment(externalId: string): Promise<void> {
    // Hot Aisle doesn't have a restart endpoint for VMs
    // This is a no-op — the user would need to destroy and re-provision
    void externalId
  }

  async destroyDeployment(externalId: string): Promise<void> {
    await this.request("DELETE", this.vmPath(externalId))
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const vm = await this.request<HotAisleVMDetails>("GET", this.vmPath(externalId))

    const gpuName = vm.gpus?.[0]
      ? `${vm.gpus[0].manufacturer} ${vm.gpus[0].model}`
      : "Unknown GPU"

    // Hot Aisle VMs are running if they exist and have an IP
    const status: DeploymentInfo["status"] = vm.ip_address ? "running" : "provisioning"

    // Build endpoint — the inference server runs on port 8000
    let endpoint: string | null = null
    if (vm.ip_address) {
      endpoint = `http://${vm.ip_address}:8000`
    }

    return {
      externalId,
      status,
      endpoint,
      gpuType: gpuName,
      costPerHour: null, // pricing is on the available types, not individual VMs
    }
  }

  async *streamLogs(_externalId: string): AsyncGenerator<string> {
    // Hot Aisle API does not expose VM console/logs
    yield "[Hot Aisle] Log streaming is not available. Use SSH to access container logs."
    yield `[Hot Aisle] SSH into the VM and run: docker logs <container_id>`
  }

  async fetchLogs(_externalId: string, _tail = 500): Promise<string[]> {
    // Hot Aisle doesn't have a logs API endpoint
    return [
      "[Hot Aisle] Container logs are not available via the API.",
      "[Hot Aisle] SSH into the VM to view logs: docker logs <container_id>",
    ]
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
    throw new Error("Hot Aisle does not expose GPU metrics via its API")
  }

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    const available = await this.request<HotAisleAvailableType[]>(
      "GET",
      `${this.vmPath()}available/`
    )

    // Collect unique GPU types across all available VM configs
    const gpuMap = new Map<string, { vramGb: number; costPerHour: number | null }>()

    for (const vmType of available) {
      if (vmType.Quantity <= 0) continue
      const gpus = vmType.Specs.gpus
      if (!gpus || gpus.length === 0) continue

      for (const gpu of gpus) {
        const key = `${gpu.manufacturer} ${gpu.model}`
        if (!gpuMap.has(key)) {
          const costCents = vmType.OnDemandPrice ?? null
          gpuMap.set(key, {
            vramGb: 0, // Hot Aisle API doesn't expose VRAM per GPU directly
            costPerHour: costCents != null ? costCents / 100 : null,
          })
        }
      }
    }

    return Array.from(gpuMap.entries()).map(([type, info]) => ({
      type,
      vramGb: info.vramGb,
      costPerHour: info.costPerHour,
    }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find((g) => g.type === gpuType)?.vramGb ?? 0
  }
}

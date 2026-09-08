import Docker from "dockerode"
import type { IGPUProvider, DeployModelInput, DeploymentInfo, GPUMetrics, MetricsCapabilities } from "../types"
import { allocateHostPort, buildContainerConfig, deploymentEndpoint } from "./docker.client"

export class LocalProvider implements IGPUProvider {
  private docker: Docker

  constructor() {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" })
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const port = await allocateHostPort(this.docker)
    const config = buildContainerConfig(input, port)

    // Pull image first
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(config.Image!, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err)
        this.docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve())
      })
    })

    // Create and start container
    const container = await this.docker.createContainer(config)
    await container.start()

    return {
      externalId: container.id,
      status: "provisioning",
      endpoint: deploymentEndpoint(port),
      gpuType: "local",
      costPerHour: null,
    }
  }

  async startDeployment(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId)
    await container.start()
  }

  async stopDeployment(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId)
    await container.stop()
  }

  async restartDeployment(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId)
    await container.restart()
  }

  async destroyDeployment(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId)
    await container.stop().catch(() => {})
    await container.remove()
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const container = this.docker.getContainer(externalId)
    const info = await container.inspect()
    const port = Object.values(info.NetworkSettings.Ports)[0]?.[0]?.HostPort

    return {
      externalId,
      status: info.State.Running ? "running" : "stopped",
      endpoint: port ? deploymentEndpoint(port) : null,
      gpuType: "local",
      costPerHour: null,
    }
  }

  async *streamLogs(externalId: string): AsyncGenerator<string> {
    const container = this.docker.getContainer(externalId)
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    })

    for await (const chunk of stream) {
      yield chunk.toString("utf8")
    }
  }

  async fetchLogs(externalId: string, tail = 500): Promise<string[]> {
    const container = this.docker.getContainer(externalId)
    const buffer = await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail,
    })
    return buffer.toString("utf8").split("\n").filter((l: string) => l.trim())
  }

  getMetricsCapabilities(): MetricsCapabilities {
    return {
      gpuUtilization: true,
      vram: true,
      temperature: true,
      power: true,
      clocks: true,
      perGpu: true,
      container: false,
      uptime: false,
      costPerHour: false,
    }
  }

  async getMetrics(externalId: string): Promise<GPUMetrics> {
    // Read detailed metrics from nvidia-smi inside container
    const container = this.docker.getContainer(externalId)
    const queryFields = [
      "index", "name", "uuid",
      "utilization.gpu", "utilization.memory",
      "memory.used", "memory.total", "memory.free",
      "temperature.gpu", "temperature.memory",
      "fan.speed",
      "power.draw", "power.limit",
      "clocks.current.graphics", "clocks.current.memory", "clocks.current.sm",
      "pcie.link.gen.current", "pcie.link.width.current",
      "ecc.errors.corrected.volatile.total",
    ].join(",")

    const exec = await container.exec({
      Cmd: ["nvidia-smi", `--query-gpu=${queryFields}`, "--format=csv,noheader,nounits"],
      AttachStdout: true,
    })
    const stream = await exec.start({})
    let output = ""
    for await (const chunk of stream) {
      output += chunk.toString()
    }

    const lines = output.trim().split("\n").filter(Boolean)
    const parseNum = (v: string): number => {
      const n = Number(v.trim())
      return Number.isNaN(n) ? 0 : n
    }
    const parseNullable = (v: string): number | null => {
      const trimmed = v.trim()
      if (trimmed === "[N/A]" || trimmed === "N/A" || trimmed === "") return null
      const n = Number(trimmed)
      return Number.isNaN(n) ? null : n
    }

    const gpus = lines.map((line) => {
      const parts = line.split(", ")
      return {
        index: parseNum(parts[0]),
        name: parts[1]?.trim() ?? "Unknown",
        uuid: parts[2]?.trim() ?? "",
        gpuUtilization: parseNum(parts[3]),
        memoryUtilization: parseNum(parts[4]),
        vramUsedGb: parseNum(parts[5]) / 1024,
        vramTotalGb: parseNum(parts[6]) / 1024,
        vramFreeGb: parseNum(parts[7]) / 1024,
        temperatureCelsius: parseNum(parts[8]),
        temperatureMemoryCelsius: parseNullable(parts[9]),
        fanSpeedPercent: parseNullable(parts[10]),
        powerDrawWatts: parseNum(parts[11]),
        powerLimitWatts: parseNum(parts[12]),
        clockGraphicsMhz: parseNum(parts[13]),
        clockMemoryMhz: parseNum(parts[14]),
        clockSmMhz: parseNum(parts[15]),
        pcieGen: parseNullable(parts[16]),
        pcieLinkWidth: parseNullable(parts[17]),
        eccErrors: parseNullable(parts[18]),
      }
    })

    if (gpus.length === 0) {
      return { gpuCount: 0, gpuUtilization: 0, vramUsedGb: 0, vramTotalGb: 0, temperatureCelsius: 0, powerDrawWatts: 0, gpus: [] }
    }

    return {
      gpuCount: gpus.length,
      gpuUtilization: Math.round(gpus.reduce((s, g) => s + g.gpuUtilization, 0) / gpus.length),
      vramUsedGb: gpus.reduce((s, g) => s + g.vramUsedGb, 0),
      vramTotalGb: gpus.reduce((s, g) => s + g.vramTotalGb, 0),
      temperatureCelsius: Math.round(gpus.reduce((s, g) => s + g.temperatureCelsius, 0) / gpus.length),
      powerDrawWatts: gpus.reduce((s, g) => s + g.powerDrawWatts, 0),
      gpus,
    }
  }

  async listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>> {
    try {
      const { exec: execSync } = await import("child_process")
      const result = await new Promise<string>((resolve, reject) => {
        execSync(
          "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
          (err, stdout) => (err ? reject(err) : resolve(stdout))
        )
      })
      const lines = result.trim().split("\n").filter(Boolean)
      return lines.map((line) => {
        const [name, memMb] = line.split(", ")
        return { type: name.trim(), vramGb: Math.round(Number(memMb) / 1024), costPerHour: null }
      })
    } catch {
      return [{ type: "local", vramGb: 80, costPerHour: null }]
    }
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    // Return total VRAM across all matching GPUs
    return gpus
      .filter((g) => g.type === gpuType || gpuType === "local")
      .reduce((sum, g) => sum + g.vramGb, 0)
  }
}
import type {
  IGPUProvider,
  DeployModelInput,
  DeploymentInfo,
  GPUMetrics,
  MetricsCapabilities,
  SingleGPUMetrics,
} from "../types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export class MockProvider implements IGPUProvider {
  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    await sleep(500)
    return {
      externalId: `mock-${input.deploymentId}`,
      status: "provisioning",
      endpoint: "http://localhost:8080",
      gpuType: input.gpuType,
      costPerHour: null,
    }
  }

  async startDeployment(_externalId: string): Promise<void> {
    await sleep(200)
  }

  async stopDeployment(_externalId: string): Promise<void> {
    await sleep(200)
  }

  async restartDeployment(_externalId: string): Promise<void> {
    await sleep(200)
  }

  async destroyDeployment(_externalId: string): Promise<void> {
    await sleep(200)
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    return {
      externalId,
      status: "running",
      endpoint: "http://localhost:8080",
      gpuType: "Mock GPU",
      costPerHour: null,
    }
  }

  async *streamLogs(_externalId: string): AsyncGenerator<string> {
    const lines = [
      "[mock] Pulling vLLM image...",
      "[mock] Image ready.",
      "[mock] Starting container...",
      "Downloading model: 0%",
      "Downloading model: 10%",
      "Downloading model: 25%",
      "Downloading model: 40%",
      "Downloading model: 55%",
      "Downloading model: 70%",
      "Downloading model: 85%",
      "Downloading model: 100%",
      "[mock] Loading model into GPU memory...",
      "[mock] Warming up model...",
      "INFO:     Uvicorn running on http://0.0.0.0:8080",
      "INFO:     Application startup complete.",
    ]
    for (const line of lines) {
      await sleep(400)
      yield line
    }
  }

  async fetchLogs(_externalId: string, _tail = 500): Promise<string[]> {
    return [
      "[mock] Pulling vLLM image...",
      "[mock] Image ready.",
      "[mock] Starting container...",
      "Downloading model: 100%",
      "[mock] Loading model into GPU memory...",
      "[mock] Warming up model...",
      "INFO:     Uvicorn running on http://0.0.0.0:8080",
      "INFO:     Application startup complete.",
    ]
  }

  getMetricsCapabilities(): MetricsCapabilities {
    // Mirrors the local (nvidia-smi) provider plus container metrics so every
    // UI path is exercisable in dev via MOCK_DEPLOYMENT=true.
    return {
      gpuUtilization: true,
      vram: true,
      temperature: true,
      power: true,
      clocks: true,
      perGpu: true,
      container: true,
      uptime: true,
      costPerHour: false,
    }
  }

  async getMetrics(_externalId: string): Promise<GPUMetrics> {
    const rand = (min: number, max: number) =>
      Math.round((Math.random() * (max - min) + min) * 10) / 10

    const vramTotalGb = 16
    const gpus: SingleGPUMetrics[] = [0, 1].map((index) => {
      const used = rand(8, 14)
      return {
        index,
        name: "Mock GPU (Dev)",
        uuid: `GPU-mock-${index}`,
        gpuUtilization: rand(20, 85),
        memoryUtilization: Math.round((used / vramTotalGb) * 100),
        vramUsedGb: used,
        vramTotalGb,
        vramFreeGb: vramTotalGb - used,
        temperatureCelsius: rand(45, 72),
        temperatureMemoryCelsius: rand(50, 80),
        fanSpeedPercent: rand(30, 70),
        powerDrawWatts: rand(100, 250),
        powerLimitWatts: 300,
        clockGraphicsMhz: rand(1400, 1900),
        clockMemoryMhz: rand(7000, 9500),
        clockSmMhz: rand(1400, 1900),
        pcieGen: 4,
        pcieLinkWidth: 16,
        eccErrors: 0,
      }
    })

    const vramUsedGb = gpus.reduce((s, g) => s + g.vramUsedGb, 0)
    return {
      gpuCount: gpus.length,
      gpuUtilization:
        gpus.reduce((s, g) => s + g.gpuUtilization, 0) / gpus.length,
      vramUsedGb,
      vramTotalGb: vramTotalGb * gpus.length,
      temperatureCelsius: Math.max(...gpus.map((g) => g.temperatureCelsius ?? 0)),
      powerDrawWatts: gpus.reduce((s, g) => s + (g.powerDrawWatts ?? 0), 0),
      containerCpuPercent: rand(5, 60),
      containerMemoryPercent: rand(20, 75),
      uptimeSeconds: 3600 + Math.floor(Math.random() * 86400),
      costPerHour: null,
      gpus,
    }
  }

  async listAvailableGPUs() {
    return [{ type: "Mock GPU (Dev)", vramGb: 16, costPerHour: null }]
  }

  async getAvailableVram(_gpuType: string): Promise<number> {
    return 16
  }
}

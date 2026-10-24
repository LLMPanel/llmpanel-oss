# 03 — Provider Abstraction Layer

## Core Principle
Every GPU provider implements `IGPUProvider`. Core business logic never knows if it's local Docker, RunPod, or Vast.ai. Adding a new provider = new class, nothing else changes.

## packages/providers/src/types.ts

```typescript
import { z } from "zod"

export const DeployModelInputSchema = z.object({
  deploymentId: z.string(),
  modelId: z.string(),
  huggingfaceId: z.string(),
  gpuType: z.string(),
  quantization: z.enum(["fp16", "int8", "int4", "gguf"]),
  inferenceEngine: z.enum(["vllm", "sglang"]),
  maxModelLen: z.number().default(4096),
  envVars: z.record(z.string()).optional(),
})

export const DeploymentInfoSchema = z.object({
  externalId: z.string(),
  status: z.enum(["provisioning","downloading","loading","health_check","running","stopped","failed"]),
  endpoint: z.string().nullable(),
  gpuType: z.string(),
  costPerHour: z.number().nullable(),
})

export const GPUMetricsSchema = z.object({
  gpuUtilization: z.number(),
  vramUsedGb: z.number(),
  vramTotalGb: z.number(),
  temperatureCelsius: z.number(),
  powerDrawWatts: z.number(),
})

export type DeployModelInput = z.infer<typeof DeployModelInputSchema>
export type DeploymentInfo = z.infer<typeof DeploymentInfoSchema>
export type GPUMetrics = z.infer<typeof GPUMetricsSchema>

export interface IGPUProvider {
  deployModel(input: DeployModelInput): Promise<DeploymentInfo>
  stopDeployment(externalId: string): Promise<void>
  restartDeployment(externalId: string): Promise<void>
  getDeploymentInfo(externalId: string): Promise<DeploymentInfo>
  streamLogs(externalId: string): AsyncGenerator<string>
  getMetrics(externalId: string): Promise<GPUMetrics>
  listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>>
  getAvailableVram(gpuType: string): Promise<number>
}
```

## packages/providers/src/factory.ts

```typescript
import type { IGPUProvider } from "./types"
import { LocalProvider } from "./local"
import { RunPodProvider } from "./runpod"
import { VastAIProvider } from "./vastai"

export function createProvider(
  type: "local" | "runpod" | "vastai",
  apiKey?: string
): IGPUProvider {
  switch (type) {
    case "local":   return new LocalProvider()
    case "runpod":
      if (!apiKey) throw new Error("RunPod API key required")
      return new RunPodProvider(apiKey)
    case "vastai":
      if (!apiKey) throw new Error("Vast.ai API key required")
      return new VastAIProvider(apiKey)
    default:
      throw new Error(`Unknown provider: ${type}`)
  }
}
```

## packages/providers/src/local/docker.client.ts

`buildContainerConfig` has three shapes: image-generation, vLLM/SGLang (NVIDIA
`DeviceRequests`), and `inferenceEngine: "llamacpp"` — llama.cpp on the CPU for
hosts without a GPU, with no device request, the GGUF repo passed as
`--hf-repo <repo>:Q4_K_M`, and weights cached in the `llmpanel-llamacpp-cache`
volume. `LocalProvider` reads `MetricsContext.inferenceEngine` to report Docker
CPU/memory stats for those containers instead of exec-ing `nvidia-smi`. See
`docs/08-docker.md` → "No GPU means llama.cpp on the CPU".

Every shape takes a `DeploymentExposure`: `{ kind: "network" }` joins the API
container's own Docker network and publishes nothing (endpoint
`http://llmpanel-<id>:8000`), `{ kind: "port" }` publishes a host port, on loopback
under `pnpm dev`. `inspectedEndpoint()` reads either back from `docker inspect`, so
containers created before v0.1.2, which still publish a port, keep working. See
`docs/08-docker.md` → "Deployment containers join the stack's network".

```typescript
import type Docker from "dockerode"
import type { ContainerCreateOptions } from "dockerode"
import type { DeployModelInput } from "../types"

// Ask the daemon which host ports are taken. Binding a probe socket would only
// describe the API container's own network namespace, not the host's.
export async function allocateHostPort(docker: Docker): Promise<number> {
  const containers = await docker.listContainers({ all: true })
  const taken = new Set<number>()
  for (const c of containers) {
    for (const p of c.Ports ?? []) if (p.PublicPort) taken.add(p.PublicPort)
  }
  for (let port = 39000; port <= 39999; port++) {
    if (!taken.has(port)) return port
  }
  throw new Error("No free host port in range 39000-39999")
  })
}

export function buildContainerConfig(
  input: DeployModelInput,
  hostPort: number
): ContainerCreateOptions {
  const engineImages: Record<string, string> = {
    vllm: "vllm/vllm-openai:latest",
    sglang: "lmsysorg/sglang:latest",
  }

  const engineCommands: Record<string, string[]> = {
    vllm: [
      "--model", input.huggingfaceId,
      "--quantization", mapQuantization(input.quantization),
      "--max-model-len", String(input.maxModelLen),
      "--gpu-memory-utilization", "0.90",
      "--host", "0.0.0.0",
      "--port", "8000",
    ],
    sglang: [
      "--model-path", input.huggingfaceId,
      "--host", "0.0.0.0",
      "--port", "8000",
    ],
  }

  return {
    name: `llmpanel-${input.deploymentId}`,
    Image: engineImages[input.inferenceEngine],
    Cmd: engineCommands[input.inferenceEngine],
    Env: [
      `HF_TOKEN=${process.env.HF_TOKEN ?? ""}`,
      `HUGGING_FACE_HUB_TOKEN=${process.env.HF_TOKEN ?? ""}`,
      ...(input.envVars
        ? Object.entries(input.envVars).map(([k, v]) => `${k}=${v}`)
        : []),
    ],
    ExposedPorts: { "8000/tcp": {} },
    HostConfig: {
      DeviceRequests: [{ Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] }],
      PortBindings: { "8000/tcp": [{ HostPort: String(hostPort) }] },
      RestartPolicy: { Name: "unless-stopped" },
      ShmSize: 10 * 1024 * 1024 * 1024, // 10GB shared memory for vLLM
    },
  }
}

function mapQuantization(q: string): string {
  const map: Record<string, string> = {
    fp16: "none", int8: "bitsandbytes", int4: "bitsandbytes", gguf: "gguf",
  }
  return map[q] ?? "none"
}
```

## packages/providers/src/local/local.provider.ts

```typescript
import Docker from "dockerode"
import type { IGPUProvider, DeployModelInput, DeploymentInfo, GPUMetrics } from "../types"
import { buildContainerConfig, exposureEndpoint, inspectedEndpoint } from "./docker.client"

export class LocalProvider implements IGPUProvider {
  private docker = new Docker({ socketPath: "/var/run/docker.sock" })

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    // The API's own network when it runs in a container, else a loopback port.
    const exposure = await this.exposure()
    const config = buildContainerConfig(input, exposure)

    // Pull image
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(config.Image!, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err)
        this.docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve())
      })
    })

    const container = await this.docker.createContainer(config)
    await container.start()

    return {
      externalId: container.id,
      status: "provisioning",
      endpoint: exposureEndpoint(exposure, config.name!),
      gpuType: "local",
      costPerHour: null,
    }
  }

  async stopDeployment(externalId: string): Promise<void> {
    const container = this.docker.getContainer(externalId)
    await container.stop()
    await container.remove()
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.docker.getContainer(externalId).restart()
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const info = await this.docker.getContainer(externalId).inspect()
    return {
      externalId,
      status: info.State.Running ? "running" : "stopped",
      endpoint: inspectedEndpoint(info),
      gpuType: "local",
      costPerHour: null,
    }
  }

  async *streamLogs(externalId: string): AsyncGenerator<string> {
    const stream = await this.docker.getContainer(externalId).logs({
      follow: true, stdout: true, stderr: true, tail: 100,
    })
    for await (const chunk of stream) {
      yield chunk.toString("utf8")
    }
  }

  async getMetrics(externalId: string): Promise<GPUMetrics> {
    const exec = await this.docker.getContainer(externalId).exec({
      Cmd: ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw", "--format=csv,noheader,nounits"],
      AttachStdout: true,
    })
    const stream = await exec.start({})
    let output = ""
    for await (const chunk of stream) output += chunk.toString()

    const [gpuUtil, memUsed, memTotal, temp, power] = output.trim().split(", ").map(Number)
    return {
      gpuUtilization: gpuUtil,
      vramUsedGb: memUsed / 1024,
      vramTotalGb: memTotal / 1024,
      temperatureCelsius: temp,
      powerDrawWatts: power,
    }
  }

  async listAvailableGPUs() {
    return [{ type: "local", vramGb: 80, costPerHour: null }]
  }

  async getAvailableVram(_gpuType: string): Promise<number> {
    return 80
  }
}
```

## packages/providers/src/runpod/runpod.provider.ts

```typescript
import { GraphQLClient, gql } from "graphql-request"
import type { IGPUProvider, DeployModelInput, DeploymentInfo, GPUMetrics } from "../types"

export class RunPodProvider implements IGPUProvider {
  private client: GraphQLClient

  constructor(apiKey: string) {
    this.client = new GraphQLClient("https://api.runpod.io/graphql", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  }

  async deployModel(input: DeployModelInput): Promise<DeploymentInfo> {
    const mutation = gql`
      mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) { id desiredStatus costPerHr }
      }
    `
    const data = await this.client.request<any>(mutation, {
      input: {
        name: `llmpanel-${input.deploymentId}`,
        imageName: "vllm/vllm-openai:latest",
        gpuTypeId: input.gpuType,
        cloudType: "SECURE",
        dockerArgs: `--model ${input.huggingfaceId} --host 0.0.0.0 --port 8000`,
        env: [{ key: "HF_TOKEN", value: process.env.HF_TOKEN ?? "" }],
        ports: "8000/http",
        containerDiskInGb: 50,
      },
    })

    return {
      externalId: data.podFindAndDeployOnDemand.id,
      status: "provisioning",
      endpoint: null,
      gpuType: input.gpuType,
      costPerHour: data.podFindAndDeployOnDemand.costPerHr,
    }
  }

  async stopDeployment(externalId: string): Promise<void> {
    await this.client.request(gql`
      mutation($podId: String!) { podTerminate(input: { podId: $podId }) }
    `, { podId: externalId })
  }

  async restartDeployment(externalId: string): Promise<void> {
    await this.stopDeployment(externalId)
  }

  async getDeploymentInfo(externalId: string): Promise<DeploymentInfo> {
    const data = await this.client.request<any>(gql`
      query($podId: String!) {
        pod(input: { podId: $podId }) {
          id desiredStatus costPerHr
          runtime { ports { ip port isIpPublic } }
        }
      }
    `, { podId: externalId })

    const pod = data.pod
    const port = pod.runtime?.ports?.find((p: any) => p.port === 8000)
    return {
      externalId,
      status: pod.desiredStatus === "RUNNING" ? "running" : "stopped",
      endpoint: port ? `http://${port.ip}:${port.port}` : null,
      gpuType: "runpod",
      costPerHour: pod.costPerHr,
    }
  }

  async *streamLogs(_externalId: string): AsyncGenerator<string> {
    yield "Log streaming not yet implemented for RunPod"
  }

  async getMetrics(_externalId: string): Promise<GPUMetrics> {
    return { gpuUtilization: 0, vramUsedGb: 0, vramTotalGb: 80, temperatureCelsius: 0, powerDrawWatts: 0 }
  }

  async listAvailableGPUs() {
    const data = await this.client.request<any>(gql`
      query { gpuTypes { id displayName memoryInGb securePrice } }
    `)
    return data.gpuTypes.map((g: any) => ({
      type: g.id, vramGb: g.memoryInGb, costPerHour: g.securePrice,
    }))
  }

  async getAvailableVram(gpuType: string): Promise<number> {
    const gpus = await this.listAvailableGPUs()
    return gpus.find(g => g.type === gpuType)?.vramGb ?? 0
  }
}
```

## packages/providers/src/index.ts

```typescript
export * from "./types"
export * from "./factory"
export { LocalProvider } from "./local"
export { RunPodProvider } from "./runpod"
export { VastAIProvider } from "./vastai"
```

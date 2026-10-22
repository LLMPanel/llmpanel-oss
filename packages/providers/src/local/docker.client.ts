import type Docker from "dockerode"
import { vllmSpeculativeArgv, sglangSpeculativeArgv } from "../shared/speculative"
import type { ContainerCreateOptions } from "dockerode"
import type { DeployModelInput } from "../types"

/** Host port range reserved for deployment containers. */
const PORT_RANGE_START = 39000
const PORT_RANGE_END = 39999

/** CPU inference server. Pinned: the rolling `server` tag is rebuilt several times a day. */
const LLAMACPP_IMAGE = "ghcr.io/ggml-org/llama.cpp:server-b11515"
/** The GGUF quant llama.cpp pulls. Every registry GGUF repo ships it, and the
 *  registry's gguf `fileSizeGb` (which the RAM fit check reads) is its size. */
const LLAMACPP_QUANT = "Q4_K_M"
/** Named volume shared by every llama.cpp container, so a restart or a
 *  redeploy of the same model reuses the weights instead of downloading them. */
const LLAMACPP_CACHE_VOLUME = "llmpanel-llamacpp-cache"
const LLAMACPP_CACHE_DIR = "/models"

/**
 * Host address at which the API can reach ports published by deployment containers.
 *
 * When the API runs directly on the host this is plain `localhost`. When it runs
 * inside a container, `localhost` is that container's own loopback, so compose sets
 * DEPLOYMENT_HOST to `host.docker.internal` (paired with an extra_hosts host-gateway
 * entry) so published ports remain reachable.
 */
function deploymentHost(): string {
  return process.env.DEPLOYMENT_HOST ?? "localhost"
}

/** Build the URL the gateway uses to reach a deployment's published port. */
export function deploymentEndpoint(hostPort: string | number): string {
  return `http://${deploymentHost()}:${hostPort}`
}

/**
 * Pick a host port not already published by another container.
 *
 * Deliberately asks the Docker daemon rather than binding a probe socket: the API
 * may itself run in a container, where a "free" port in its own network namespace
 * says nothing about the host's. The port is then pinned for the container's
 * lifetime, so it survives restarts — an auto-assigned (empty) HostPort would be
 * reallocated on every restart and strand the endpoint recorded in the database.
 */
export async function allocateHostPort(docker: Docker): Promise<number> {
  const containers = await docker.listContainers({ all: true })
  const taken = new Set<number>()
  for (const container of containers) {
    for (const port of container.Ports ?? []) {
      if (port.PublicPort) taken.add(port.PublicPort)
    }
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!taken.has(port)) return port
  }
  throw new Error(`No free host port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`)
}

export function buildContainerConfig(
  input: DeployModelInput,
  hostPort: number
): ContainerCreateOptions {
  const engineImages: Record<string, string> = {
    vllm: "vllm/vllm-openai:latest",
    sglang: "lmsysorg/sglang:latest",
  }

  const gpuCount = input.gpuCount ?? 1

  // ── Image-generation models (text-to-image) ──────────────────────────
  // These run our own diffusers-based server (docker/image-gen-server) which
  // takes the model purely via the MODEL_ID env var and exposes the same
  // /health + OpenAI-style endpoint on :8000. It has no vLLM CLI flags.
  if (input.modelType === "image-generation") {
    return {
      name: `llmpanel-${input.deploymentId}`,
      Image: input.dockerImage ?? "llmpanel/image-gen-server:latest",
      Env: [
        `MODEL_ID=${input.huggingfaceId}`,
        `HF_TOKEN=${process.env.HF_TOKEN ?? ""}`,
        `HUGGING_FACE_HUB_TOKEN=${process.env.HF_TOKEN ?? ""}`,
        ...(input.extraArgs ? [`EXTRA_ARGS=${input.extraArgs}`] : []),
        ...(input.envVars ? Object.entries(input.envVars).map(([k, v]) => `${k}=${v}`) : []),
      ],
      ExposedPorts: { "8000/tcp": {} },
      HostConfig: {
        DeviceRequests: [
          { Driver: "nvidia", Count: gpuCount, Capabilities: [["gpu"]] },
        ],
        PortBindings: { "8000/tcp": [{ HostPort: String(hostPort) }] },
        RestartPolicy: { Name: "unless-stopped" },
        ShmSize: 8 * 1024 * 1024 * 1024, // 8GB — diffusion pipelines spike on load
      },
    }
  }

  // ── CPU inference (hosts without a GPU) ──────────────────────────────
  // llama.cpp serves GGUF weights on the CPU behind the same /health +
  // OpenAI-compatible API on :8000. huggingfaceId is the GGUF repo; the server
  // downloads the quant itself on first start.
  if (input.inferenceEngine === "llamacpp") {
    return {
      name: `llmpanel-${input.deploymentId}`,
      Image: LLAMACPP_IMAGE,
      Cmd: [
        "--hf-repo", `${input.huggingfaceId}:${LLAMACPP_QUANT}`,
        "--port", "8000",
        "--ctx-size", String(input.maxModelLen),
        "--alias", input.huggingfaceId,
        // Text only: some repos also ship a vision projector, which would add
        // to both the download and RAM the fit check never counted.
        "--no-mmproj",
        // Stream a thinking model's thoughts as ordinary content, as vLLM does
        // without a reasoning parser. Split out into reasoning_content, they
        // never reach the panel's chat, which then sits on "Generating" for
        // the whole think — minutes, at CPU speed.
        "--reasoning-format", "none",
      ],
      Env: [
        // Via env rather than --host: the image already sets it, and the flag
        // makes the server open every log with an override warning.
        "LLAMA_ARG_HOST=0.0.0.0",
        `LLAMA_CACHE=${LLAMACPP_CACHE_DIR}`,
        // Only when set: GGUF repos are public, and an empty token is still a token.
        ...(process.env.HF_TOKEN ? [`HF_TOKEN=${process.env.HF_TOKEN}`] : []),
        ...(input.envVars ? Object.entries(input.envVars).map(([k, v]) => `${k}=${v}`) : []),
      ],
      ExposedPorts: { "8000/tcp": {} },
      // The image's own healthcheck probes :8080, where nothing listens here.
      Healthcheck: { Test: ["CMD", "curl", "-f", "http://localhost:8000/health"] },
      HostConfig: {
        Binds: [`${LLAMACPP_CACHE_VOLUME}:${LLAMACPP_CACHE_DIR}`],
        PortBindings: { "8000/tcp": [{ HostPort: String(hostPort) }] },
        RestartPolicy: { Name: "unless-stopped" },
      },
    }
  }

  // OCR / vision-language models (e.g. baidu/Unlimited-OCR) are served on a
  // dedicated engine image and don't take the LLM --quantization flag. Their
  // sequence length and special flags come from the registry-provided extraArgs.
  const isVision = input.modelType === "ocr" || input.modelType === "vlm"

  const vllmCmd = [
    "--model", input.huggingfaceId,
    "--gpu-memory-utilization", "0.90",
    "--host", "0.0.0.0",
    "--port", "8000",
  ]
  if (!isVision) {
    vllmCmd.push(
      "--quantization", mapQuantization(input.quantization),
      "--max-model-len", String(input.maxModelLen),
    )
  }
  if (gpuCount > 1) {
    vllmCmd.push("--tensor-parallel-size", String(gpuCount))
  }

  // KV cache (prefix caching) — enabled by default in vLLM v0.6+.
  // Skip for vision models: their KV-cache behaviour is engine-managed.
  const kvCacheEnabled = input.kvCacheEnabled ?? true
  if (!isVision) {
    if (kvCacheEnabled) {
      vllmCmd.push("--enable-prefix-caching")
    } else {
      vllmCmd.push("--no-prefix-caching")
    }
    vllmCmd.push(...vllmSpeculativeArgv(input))
  }

  // Registry-provided extra engine args, appended last so they can set
  // model-specific flags (e.g. --max-model-len 32768 --trust-remote-code).
  if (input.extraArgs) {
    vllmCmd.push(...input.extraArgs.split(/\s+/).filter(Boolean))
  }

  const sglangCmd = [
    "--model-path", input.huggingfaceId,
    "--host", "0.0.0.0",
    "--port", "8000",
  ]
  if (gpuCount > 1) {
    sglangCmd.push("--tp-size", String(gpuCount))
  }

  // SGLang prefix caching
  if (kvCacheEnabled) {
    sglangCmd.push("--enable-cache-report")
  } else {
    sglangCmd.push("--disable-radix-cache")
  }
  sglangCmd.push(...sglangSpeculativeArgv(input))

  const engineCommands: Record<string, string[]> = {
    vllm: vllmCmd,
    sglang: sglangCmd,
  }

  return {
    name: `llmpanel-${input.deploymentId}`,
    Image: input.dockerImage ?? engineImages[input.inferenceEngine],
    Cmd: engineCommands[input.inferenceEngine],
    Env: [
      `HF_TOKEN=${process.env.HF_TOKEN ?? ""}`,
      `HUGGING_FACE_HUB_TOKEN=${process.env.HF_TOKEN ?? ""}`,
      ...(input.envVars ? Object.entries(input.envVars).map(([k, v]) => `${k}=${v}`) : []),
    ],
    ExposedPorts: { "8000/tcp": {} },
    HostConfig: {
      DeviceRequests: [
        {
          Driver: "nvidia",
          Count: gpuCount,
          Capabilities: [["gpu"]],
        },
      ],
      PortBindings: {
        "8000/tcp": [{ HostPort: String(hostPort) }],
      },
      RestartPolicy: { Name: "unless-stopped" },
      ShmSize: gpuCount * 10 * 1024 * 1024 * 1024, // 10GB per GPU for NCCL inter-GPU communication
    },
  }
}

function mapQuantization(q: string): string {
  const map: Record<string, string> = {
    fp16: "none",
    int8: "bitsandbytes",
    int4: "bitsandbytes",
    gguf: "gguf",
  }
  return map[q] ?? "none"
}

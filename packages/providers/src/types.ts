import { z } from "zod"

export const DeployModelInputSchema = z.object({
  deploymentId: z.string(),
  huggingfaceId: z.string(),
  gpuType: z.string(),
  providerOfferId: z.string().optional(),
  // RunPod: which cloud to rent from. Omitted/null = secure (default).
  cloudType: z.enum(["secure", "community"]).nullish(),
  gpuCount: z.number().min(1).default(1),
  quantization: z.enum(["fp16", "int8", "int4", "gguf"]),
  // llamacpp = CPU inference on GGUF weights, for local hosts without a GPU.
  inferenceEngine: z.enum(["vllm", "sglang", "llamacpp"]),
  maxModelLen: z.number().default(4096),
  kvCacheEnabled: z.boolean().default(true),
  // DFlash speculative decoding — only takes effect when a drafter is set.
  dflashEnabled: z.boolean().default(true),
  dflashDraftModel: z.string().nullish(),
  dflashNumTokens: z.number().int().positive().nullish(),
  envVars: z.record(z.string(), z.string()).optional(),
  // Model class + serving overrides (e.g. OCR/VLM models served on a dedicated image).
  modelType: z.string().nullish(),   // "llm" | "vlm" | "ocr"
  dockerImage: z.string().nullish(), // override engine image
  extraArgs: z.string().nullish(),   // extra engine CLI args, space-separated
})

export const DeploymentInfoSchema = z.object({
  externalId: z.string(),
  status: z.enum(["provisioning", "downloading", "loading", "health_check", "running", "stopped", "failed"]),
  endpoint: z.string().nullable(),
  gpuType: z.string(),
  costPerHour: z.number().nullable(),
  /** Provider's own last lifecycle event, verbatim — e.g. RunPod's
   *  "Container downloaded, starting" or Vast's status_msg. */
  statusDetail: z.string().nullish(),
})

// Fields not exposed by every provider are nullable — a null means
// "this provider cannot report it", never "zero".
export const SingleGPUMetricsSchema = z.object({
  index: z.number(),
  name: z.string(),
  uuid: z.string(),
  gpuUtilization: z.number(),
  memoryUtilization: z.number(),
  vramUsedGb: z.number(),
  vramTotalGb: z.number(),
  vramFreeGb: z.number(),
  temperatureCelsius: z.number().nullable(),
  temperatureMemoryCelsius: z.number().nullable(),
  fanSpeedPercent: z.number().nullable(),
  powerDrawWatts: z.number().nullable(),
  powerLimitWatts: z.number().nullable(),
  clockGraphicsMhz: z.number().nullable(),
  clockMemoryMhz: z.number().nullable(),
  clockSmMhz: z.number().nullable(),
  pcieGen: z.number().nullable(),
  pcieLinkWidth: z.number().nullable(),
  eccErrors: z.number().nullable(),
})

export const GPUMetricsSchema = z.object({
  gpuCount: z.number().default(1),
  gpuUtilization: z.number(),
  vramUsedGb: z.number(),
  vramTotalGb: z.number(),
  temperatureCelsius: z.number().nullable(),
  powerDrawWatts: z.number().nullable(),
  // Container-level metrics (cloud providers like RunPod)
  containerCpuPercent: z.number().nullish(),
  containerMemoryPercent: z.number().nullish(),
  uptimeSeconds: z.number().nullish(),
  costPerHour: z.number().nullish(),
  // Per-GPU detailed breakdown
  gpus: z.array(SingleGPUMetricsSchema).optional(),
})

// Which metric groups a provider can genuinely report — drives adaptive UI.
export const MetricsCapabilitiesSchema = z.object({
  gpuUtilization: z.boolean(),
  vram: z.boolean(),
  temperature: z.boolean(),
  power: z.boolean(),
  clocks: z.boolean(),
  perGpu: z.boolean(),
  container: z.boolean(),
  uptime: z.boolean(),
  costPerHour: z.boolean(),
})

// Use z.input so fields with .default() are optional at call sites
export type DeployModelInput = z.input<typeof DeployModelInputSchema>
export type DeploymentInfo = z.infer<typeof DeploymentInfoSchema>
export type GPUMetrics = z.infer<typeof GPUMetricsSchema>
export type SingleGPUMetrics = z.infer<typeof SingleGPUMetricsSchema>
export type MetricsCapabilities = z.infer<typeof MetricsCapabilitiesSchema>

// Per-deployment context for metrics and log calls. Providers that run an
// in-pod agent (RunPod) use the token to reach it; others ignore the ctx —
// structural typing lets their implementations omit the parameter entirely.
export interface MetricsContext {
  metricsToken?: string | null
  /** The deployment's engine. The local provider reads it: a llama.cpp
   *  container has no GPU, so its metrics come from Docker, not nvidia-smi. */
  inferenceEngine?: string | null
}

export interface IGPUProvider {
  getMetricsCapabilities(ctx?: MetricsContext): MetricsCapabilities
  deployModel(input: DeployModelInput): Promise<DeploymentInfo>
  startDeployment(externalId: string): Promise<void>
  stopDeployment(externalId: string): Promise<void>
  restartDeployment(externalId: string): Promise<void>
  destroyDeployment(externalId: string): Promise<void>
  getDeploymentInfo(externalId: string): Promise<DeploymentInfo>
  streamLogs(externalId: string, ctx?: MetricsContext): AsyncGenerator<string>
  /** Host-level lifecycle events during startup (image pull, container
   *  create/start). Optional — only providers that expose them implement it.
   *  The generator ends when `signal` aborts or the provider closes the stream. */
  streamSystemEvents?(externalId: string, signal?: AbortSignal): AsyncGenerator<string>
  fetchLogs(externalId: string, tail?: number, ctx?: MetricsContext): Promise<string[]>
  getMetrics(externalId: string, ctx?: MetricsContext): Promise<GPUMetrics>
  listAvailableGPUs(): Promise<Array<{ type: string; vramGb: number; costPerHour: number | null }>>
  getAvailableVram(gpuType: string): Promise<number>
}

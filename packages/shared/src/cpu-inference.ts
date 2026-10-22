/**
 * CPU inference — how a host without a GPU serves a model.
 *
 * Such hosts run llama.cpp on GGUF weights. A registry model has a CPU build
 * when its `gguf` quantization points at a GGUF repo on Hugging Face; the local
 * provider pulls that repo's Q4_K_M file, which is what `fileSizeGb` describes.
 *
 * Text models only: image-generation, OCR and vision models stay GPU-only.
 */

interface QuantizationLike {
  format: string
  huggingfaceId: string | null
}

/**
 * The model's CPU-servable quantization, or null when it has none.
 *
 * The repo name must say GGUF. A `gguf` entry that still points at the base
 * safetensors repo exists in the registry, and llama.cpp can't load that.
 */
export function cpuQuantization<Q extends QuantizationLike>(model: {
  modelType?: string | null
  quantizations: Q[]
}): Q | null {
  if (model.modelType && model.modelType !== "llm") return null
  return (
    model.quantizations.find(
      (q) => q.format === "gguf" && !!q.huggingfaceId && /gguf/i.test(q.huggingfaceId)
    ) ?? null
  )
}

/**
 * RAM a GGUF model needs on CPU at the default 4096-token context: weights,
 * plus KV cache and compute buffers. Deliberately generous — llama.cpp b11515
 * held Qwen3.5-0.8B (a 0.53 GB file) in ~0.75 GB, this says 1.6 GB. Asking
 * too much only hides a model that might have squeezed in; asking too little
 * gets the container OOM-killed mid-request.
 */
export function estimateCpuRamGb(ggufFileSizeGb: number): number {
  return Math.round((ggufFileSizeGb * 1.1 + 1) * 10) / 10
}

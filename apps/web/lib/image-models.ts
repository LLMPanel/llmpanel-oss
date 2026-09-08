import type { RegistryModel } from "@/hooks/use-registry-models"

// Local catalog of image-generation models. These aren't in the external model
// registry, so they're merged into the registry results client-side (and the
// API has a matching catalog that resolves their serving config on deploy).
// Keep this list in sync with apps/api/src/services/image-models.catalog.ts.
//
// `modelType` lets the UI tell image deployments apart from LLMs.
// `generation` seeds the Generate playground with per-model defaults.
export interface ImageGenerationDefaults {
  steps: number
  guidance: number
  width: number
  height: number
  /** FLUX-style distilled models ignore negative prompts entirely. */
  supportsNegativePrompt: boolean
}

export interface ImageRegistryModel extends RegistryModel {
  modelType: "image-generation"
  generation: ImageGenerationDefaults
}

const DEFAULT_GENERATION: ImageGenerationDefaults = {
  steps: 30,
  guidance: 7,
  width: 1024,
  height: 1024,
  supportsNegativePrompt: true,
}

function fp16(vramRequiredGb: number, fileSizeGb: number) {
  return [
    {
      format: "fp16",
      vramRequiredGb,
      huggingfaceId: null,
      fileSizeGb,
      recommended: true,
      notes: "Half-precision — recommended for image models",
    },
  ]
}

export const IMAGE_MODELS: ImageRegistryModel[] = [
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    slug: "z-image-turbo",
    family: "z-image",
    huggingfaceId: "Tongyi-MAI/Z-Image-Turbo",
    description:
      "Fast turbo text-to-image model. High-quality 1024px images in just a few steps.",
    minVram: 16,
    tags: ["image-generation", "text-to-image", "turbo"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 8, guidance: 3.5 },
    quantizations: fp16(16, 16),
  },
  {
    id: "flux-1-schnell",
    name: "FLUX.1 Schnell",
    slug: "flux-1-schnell",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-schnell",
    description:
      "Black Forest Labs' fastest open FLUX model (Apache 2.0). Excellent quality in only 4 steps.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "turbo", "flux"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 4, guidance: 0, supportsNegativePrompt: false },
    quantizations: fp16(24, 33),
  },
  {
    id: "flux-1-dev",
    name: "FLUX.1 Dev",
    slug: "flux-1-dev",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-dev",
    description:
      "Guidance-distilled FLUX.1 base model — top-tier prompt following and detail. Gated: requires an HF token with access.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "flux", "gated"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 28, guidance: 3.5, supportsNegativePrompt: false },
    quantizations: fp16(24, 33),
  },
  {
    id: "flux-1-krea-dev",
    name: "FLUX.1 Krea Dev",
    slug: "flux-1-krea-dev",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-Krea-dev",
    description:
      "Krea's opinionated FLUX finetune focused on photorealism — avoids the oversaturated 'AI look'. Gated: requires an HF token with access.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "flux", "krea", "gated"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 28, guidance: 4.5, supportsNegativePrompt: false },
    quantizations: fp16(24, 33),
  },
  {
    id: "sdxl-base-1-0",
    name: "Stable Diffusion XL 1.0",
    slug: "sdxl-base-1-0",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-xl-base-1.0",
    description:
      "The classic SDXL base model — a versatile 1024px workhorse with a huge ecosystem.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "sdxl"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 30, guidance: 7 },
    quantizations: fp16(12, 7),
  },
  {
    id: "sdxl-turbo",
    name: "SDXL Turbo",
    slug: "sdxl-turbo",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/sdxl-turbo",
    description:
      "Adversarially distilled SDXL that generates 512px images in a single step.",
    minVram: 8,
    tags: ["image-generation", "text-to-image", "turbo", "sdxl"],
    modelType: "image-generation",
    generation: { steps: 1, guidance: 0, width: 512, height: 512, supportsNegativePrompt: false },
    quantizations: fp16(8, 7),
  },
  {
    id: "sd-3-5-large",
    name: "Stable Diffusion 3.5 Large",
    slug: "sd-3-5-large",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-3.5-large",
    description:
      "Stability AI's 8B MMDiT flagship — strong typography and prompt adherence. Gated: requires an HF token with access.",
    minVram: 32,
    tags: ["image-generation", "text-to-image", "sd3", "gated"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 28, guidance: 4.5 },
    quantizations: fp16(32, 26),
  },
  {
    id: "sd-3-5-medium",
    name: "Stable Diffusion 3.5 Medium",
    slug: "sd-3-5-medium",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-3.5-medium",
    description:
      "The 2.5B SD 3.5 variant — quality and VRAM balance for consumer GPUs. Gated: requires an HF token with access.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "sd3", "gated"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 40, guidance: 4.5 },
    quantizations: fp16(12, 12),
  },
  {
    id: "playground-v2-5",
    name: "Playground v2.5",
    slug: "playground-v2-5",
    family: "playground",
    huggingfaceId: "playgroundai/playground-v2.5-1024px-aesthetic",
    description:
      "Aesthetic-tuned SDXL-architecture model — punchy, highly polished 1024px images out of the box.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "aesthetic"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 30, guidance: 3 },
    quantizations: fp16(12, 7),
  },
  {
    id: "qwen-image",
    name: "Qwen-Image",
    slug: "qwen-image",
    family: "qwen",
    huggingfaceId: "Qwen/Qwen-Image",
    description:
      "Alibaba's 20B MMDiT model with exceptional text rendering and complex prompt following. Needs a large GPU.",
    minVram: 48,
    tags: ["image-generation", "text-to-image", "text-rendering"],
    modelType: "image-generation",
    generation: { ...DEFAULT_GENERATION, steps: 50, guidance: 4 },
    quantizations: fp16(48, 41),
  },
]

export const IMAGE_MODEL_HF_IDS = new Set(IMAGE_MODELS.map((m) => m.huggingfaceId))

export function isImageModelHfId(huggingfaceId: string | null | undefined): boolean {
  return !!huggingfaceId && IMAGE_MODEL_HF_IDS.has(huggingfaceId)
}

export function findImageModelByHfId(
  huggingfaceId: string | null | undefined
): ImageRegistryModel | null {
  if (!huggingfaceId) return null
  return IMAGE_MODELS.find((m) => m.huggingfaceId === huggingfaceId) ?? null
}

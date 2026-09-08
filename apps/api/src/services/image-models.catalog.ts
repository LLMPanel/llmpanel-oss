// Local catalog of image-generation models.
//
// LLMs come from the external model registry (a Cloudflare Worker), which we
// can't extend from this repo. Image models are curated here instead and the
// deployments controller falls back to this catalog when the registry doesn't
// know a slug. Each entry carries the serving overrides (modelType/dockerImage)
// that route the deployment to docker/image-gen-server instead of vLLM.
//
// Every model here must load through diffusers' AutoPipelineForText2Image —
// the server picks the pipeline from the checkpoint via MODEL_ID alone.
// Keep this list in sync with apps/web/lib/image-models.ts.

export interface CatalogQuantization {
  format: string
  vramRequiredGb: number
  huggingfaceId: string | null
  fileSizeGb: number
  recommended: boolean
  notes: string
}

export interface CatalogModel {
  id: string
  name: string
  slug: string
  family: string
  huggingfaceId: string
  description: string
  minVram: number
  tags: string[]
  modelType: string
  dockerImage: string
  extraArgs: string | null
  quantizations: CatalogQuantization[]
}

const IMAGE_GEN_IMAGE = "llmpanel/image-gen-server:latest"

function fp16(vramRequiredGb: number, fileSizeGb: number): CatalogQuantization[] {
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

export const IMAGE_MODELS: CatalogModel[] = [
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    slug: "z-image-turbo",
    family: "z-image",
    huggingfaceId: "Tongyi-MAI/Z-Image-Turbo",
    description:
      "Tongyi's fast turbo text-to-image model. High-quality 1024px images in just a few steps — a great default for the playground.",
    minVram: 16,
    tags: ["image-generation", "text-to-image", "turbo"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(16, 16),
  },
  {
    id: "flux-1-schnell",
    name: "FLUX.1 Schnell",
    slug: "flux-1-schnell",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-schnell",
    description:
      "Black Forest Labs' fastest open FLUX model (Apache 2.0). Excellent quality in only 4 steps with no classifier-free guidance.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "turbo", "flux"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(24, 33),
  },
  {
    id: "flux-1-dev",
    name: "FLUX.1 Dev",
    slug: "flux-1-dev",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-dev",
    description:
      "The guidance-distilled FLUX.1 base model — top-tier prompt following and detail at ~28 steps. Gated on Hugging Face: requires an HF token with access.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "flux", "gated"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(24, 33),
  },
  {
    id: "flux-1-krea-dev",
    name: "FLUX.1 Krea Dev",
    slug: "flux-1-krea-dev",
    family: "flux",
    huggingfaceId: "black-forest-labs/FLUX.1-Krea-dev",
    description:
      "Krea's opinionated FLUX finetune focused on photorealism and a distinctive aesthetic — avoids the oversaturated 'AI look'. Gated on Hugging Face: requires an HF token with access.",
    minVram: 24,
    tags: ["image-generation", "text-to-image", "flux", "krea", "gated"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(24, 33),
  },
  {
    id: "sdxl-base-1-0",
    name: "Stable Diffusion XL 1.0",
    slug: "sdxl-base-1-0",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-xl-base-1.0",
    description:
      "The classic SDXL base model — a versatile, widely fine-tuned 1024px workhorse with a huge ecosystem.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "sdxl"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(12, 7),
  },
  {
    id: "sdxl-turbo",
    name: "SDXL Turbo",
    slug: "sdxl-turbo",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/sdxl-turbo",
    description:
      "Adversarially distilled SDXL that generates 512px images in a single step — the fastest option for real-time drafts.",
    minVram: 8,
    tags: ["image-generation", "text-to-image", "turbo", "sdxl"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(8, 7),
  },
  {
    id: "sd-3-5-large",
    name: "Stable Diffusion 3.5 Large",
    slug: "sd-3-5-large",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-3.5-large",
    description:
      "Stability AI's 8B MMDiT flagship — strong typography and prompt adherence. Gated on Hugging Face: requires an HF token with access.",
    minVram: 32,
    tags: ["image-generation", "text-to-image", "sd3", "gated"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(32, 26),
  },
  {
    id: "sd-3-5-medium",
    name: "Stable Diffusion 3.5 Medium",
    slug: "sd-3-5-medium",
    family: "stable-diffusion",
    huggingfaceId: "stabilityai/stable-diffusion-3.5-medium",
    description:
      "The 2.5B SD 3.5 variant — a good balance of quality and VRAM for consumer GPUs. Gated on Hugging Face: requires an HF token with access.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "sd3", "gated"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(12, 12),
  },
  {
    id: "playground-v2-5",
    name: "Playground v2.5",
    slug: "playground-v2-5",
    family: "playground",
    huggingfaceId: "playgroundai/playground-v2.5-1024px-aesthetic",
    description:
      "Aesthetic-tuned SDXL-architecture model from Playground — punchy, highly polished 1024px images out of the box.",
    minVram: 12,
    tags: ["image-generation", "text-to-image", "aesthetic"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(12, 7),
  },
  {
    id: "qwen-image",
    name: "Qwen-Image",
    slug: "qwen-image",
    family: "qwen",
    huggingfaceId: "Qwen/Qwen-Image",
    description:
      "Alibaba's 20B MMDiT model with exceptional text rendering (including Chinese) and complex prompt following. Needs a large GPU.",
    minVram: 48,
    tags: ["image-generation", "text-to-image", "text-rendering"],
    modelType: "image-generation",
    dockerImage: IMAGE_GEN_IMAGE,
    extraArgs: null,
    quantizations: fp16(48, 41),
  },
]

export function findImageModelBySlug(slug: string): CatalogModel | null {
  return IMAGE_MODELS.find((m) => m.slug === slug) ?? null
}

export function findImageModelByHfId(huggingfaceId: string): CatalogModel | null {
  return IMAGE_MODELS.find((m) => m.huggingfaceId === huggingfaceId) ?? null
}

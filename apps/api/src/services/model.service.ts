import { db } from "@llmpanel/db"
import { models } from "@llmpanel/db/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

// ── VRAM Utilities ────────────────────────────────────────────────────

export const GPU_VRAM_MAP: Record<string, number> = {
  "H100 SXM": 80,
  "H100 PCIe": 80,
  "A100 SXM": 80,
  "A100 PCIe": 40,
  "A40": 48,
  "RTX 4090": 24,
  "RTX 3090": 24,
  "RTX 4080": 16,
  "RTX 3080": 10,
  "L40S": 48,
  "L4": 24,
}

export function calculateVramUsage(baseVram: number, quantization: string): number {
  const multipliers: Record<string, number> = {
    fp16: 2.0,
    int8: 1.0,
    int4: 0.5,
    gguf: 0.6,
  }
  return baseVram * (multipliers[quantization] ?? 1.0)
}

// ── Model Seeding ─────────────────────────────────────────────────────

interface SeedModel {
  name: string
  slug: string
  family: string
  huggingfaceId: string
  description: string
  minVram: number
  tags: string[]
  supportedQuantizations: Array<"fp16" | "int8" | "int4" | "gguf">
}

const SEED_MODELS: SeedModel[] = [
  {
    name: "Llama 3.1 8B Instruct",
    slug: "llama-3.1-8b",
    family: "llama",
    huggingfaceId: "meta-llama/Llama-3.1-8B-Instruct",
    description: "Meta's efficient 8B instruction-tuned model. Great for general chat.",
    minVram: 8,
    tags: ["chat", "general"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Llama 3.1 70B Instruct",
    slug: "llama-3.1-70b",
    family: "llama",
    huggingfaceId: "meta-llama/Llama-3.1-70B-Instruct",
    description: "Meta's large 70B instruction-tuned model with high capability.",
    minVram: 35,
    tags: ["chat", "general", "reasoning"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Llama 3.3 70B Instruct",
    slug: "llama-3.3-70b",
    family: "llama",
    huggingfaceId: "meta-llama/Llama-3.3-70B-Instruct",
    description: "Meta's latest 70B model with improved instruction following.",
    minVram: 35,
    tags: ["chat", "general", "reasoning"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Mistral 7B Instruct v0.3",
    slug: "mistral-7b-instruct",
    family: "mistral",
    huggingfaceId: "mistralai/Mistral-7B-Instruct-v0.3",
    description: "Mistral AI's compact 7B instruction model with strong performance.",
    minVram: 7,
    tags: ["chat", "general"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Mixtral 8x7B Instruct",
    slug: "mixtral-8x7b-instruct",
    family: "mistral",
    huggingfaceId: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    description: "Mistral's MoE model with 8 experts and strong reasoning.",
    minVram: 24,
    tags: ["chat", "reasoning", "coding"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "DeepSeek R1 Distill Qwen 7B",
    slug: "deepseek-r1-distill-7b",
    family: "deepseek",
    huggingfaceId: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    description: "DeepSeek R1 distilled into 7B — strong math and reasoning.",
    minVram: 7,
    tags: ["reasoning", "math", "coding"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "DeepSeek R1 Distill Llama 70B",
    slug: "deepseek-r1-distill-70b",
    family: "deepseek",
    huggingfaceId: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    description: "DeepSeek R1 distilled into Llama 70B for high-quality reasoning.",
    minVram: 35,
    tags: ["reasoning", "math", "coding"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Qwen2.5 7B Instruct",
    slug: "qwen2.5-7b-instruct",
    family: "qwen",
    huggingfaceId: "Qwen/Qwen2.5-7B-Instruct",
    description: "Alibaba's Qwen 2.5 7B model with multilingual support.",
    minVram: 7,
    tags: ["chat", "general", "multilingual"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Qwen2.5 72B Instruct",
    slug: "qwen2.5-72b-instruct",
    family: "qwen",
    huggingfaceId: "Qwen/Qwen2.5-72B-Instruct",
    description: "Alibaba's flagship 72B model, top-tier multilingual performance.",
    minVram: 36,
    tags: ["chat", "general", "multilingual", "reasoning"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Phi-3.5 Mini Instruct",
    slug: "phi-3.5-mini-instruct",
    family: "phi",
    huggingfaceId: "microsoft/Phi-3.5-mini-instruct",
    description: "Microsoft's compact 3.8B model with strong reasoning per parameter.",
    minVram: 4,
    tags: ["chat", "reasoning"],
    supportedQuantizations: ["fp16", "int8", "int4", "gguf"],
  },
  {
    name: "Gemma 2 9B Instruct",
    slug: "gemma-2-9b-instruct",
    family: "gemma",
    huggingfaceId: "google/gemma-2-9b-it",
    description: "Google's Gemma 2 9B instruction-tuned model.",
    minVram: 9,
    tags: ["chat", "general"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
  {
    name: "Gemma 2 27B Instruct",
    slug: "gemma-2-27b-instruct",
    family: "gemma",
    huggingfaceId: "google/gemma-2-27b-it",
    description: "Google's Gemma 2 27B model for advanced language tasks.",
    minVram: 14,
    tags: ["chat", "general", "reasoning"],
    supportedQuantizations: ["fp16", "int8", "int4"],
  },
]

/**
 * Idempotent seed — inserts models that don't exist yet, skips existing ones.
 * Call during app startup or via a seed script.
 */
export async function seedModels(): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0
  let skipped = 0

  for (const seed of SEED_MODELS) {
    const existing = await db.query.models.findFirst({
      where: eq(models.slug, seed.slug),
    })

    if (existing) {
      skipped++
      continue
    }

    await db.insert(models).values({
      id: randomUUID(),
      name: seed.name,
      slug: seed.slug,
      family: seed.family,
      huggingfaceId: seed.huggingfaceId,
      description: seed.description,
      minVram: seed.minVram,
      tags: JSON.stringify(seed.tags),
      supportedQuantizations: JSON.stringify(seed.supportedQuantizations),
      isActive: true,
      createdAt: new Date(),
    })

    seeded++
  }

  return { seeded, skipped }
}

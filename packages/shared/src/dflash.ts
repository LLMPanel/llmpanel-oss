/**
 * DFlash speculative-decoding drafters.
 *
 * DFlash (arXiv 2602.06036) drafts a whole block of tokens in one forward pass
 * with a small block-diffusion model conditioned on the target's hidden
 * states; the target verifies the block in a single pass. DFlash 2 (Inco AI,
 * Aug 2026) accepts ~20% more tokens per verify pass.
 *
 * A drafter is trained for ONE target model, so the toggle can only default on
 * when the selected model has a known drafter. The registry may later ship a
 * `dflashDraftModel` per model; until then this table is the source of truth.
 */

export interface DflashDrafter {
  /** Hugging Face id of the drafter. */
  model: string
  /** Drafter generation — informational, both use vLLM's `dflash` method. */
  version: 1 | 2
  /** Block size the drafter was trained for (vLLM `num_speculative_tokens`). */
  numSpeculativeTokens: number
}

/** Target HF id → drafter. Keys are lower-cased for lookup. */
export const DFLASH_DRAFTERS: Record<string, DflashDrafter> = {
  // DFlash 2 (incoai)
  "qwen/qwen3.8-27b": { model: "incoai/Qwen3.8-27B-DFlash2", version: 2, numSpeculativeTokens: 7 },
  "meta-models/muse-glimmer-30b": { model: "incoai/Muse-Glimmer-30B-DFlash2", version: 2, numSpeculativeTokens: 7 },
  // DFlash 1 drafters published by vendors
  "moonshotai/kimi-k2.6": { model: "nvidia/Kimi-K2.6-DFlash", version: 1, numSpeculativeTokens: 7 },
  "moonshotai/kimi-k3": { model: "modal-labs/Kimi-K3-DFlash", version: 1, numSpeculativeTokens: 7 },
  "google/gemma-4-31b-it": { model: "RedHatAI/gemma-4-31B-it-speculator.dflash", version: 1, numSpeculativeTokens: 7 },
  "poolside/laguna-s-2.1": { model: "poolside/Laguna-S-2.1-DFlash", version: 1, numSpeculativeTokens: 7 },
  "xiaomimimo/mimo-v2.5-pro": { model: "XiaomiMiMo/MiMo-V2.5-Pro-FP4-DFlash", version: 1, numSpeculativeTokens: 7 },
  "nvidia/nvidia-nemotron-3.5-lightning-30b-a3b": { model: "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4-DFlash", version: 1, numSpeculativeTokens: 7 },
}

/** Drafter for a target model, or null when none is known. */
export function resolveDflashDrafter(huggingfaceId: string | null | undefined): DflashDrafter | null {
  if (!huggingfaceId) return null
  return DFLASH_DRAFTERS[huggingfaceId.toLowerCase()] ?? null
}

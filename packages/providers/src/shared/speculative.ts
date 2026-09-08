/**
 * Speculative-decoding CLI fragments. Kept engine-specific and string-only so
 * every provider's command builder can append them verbatim.
 */

export interface SpeculativeInput {
  dflashEnabled?: boolean | null
  dflashDraftModel?: string | null
  dflashNumTokens?: number | null
}

const DEFAULT_VLLM_TOKENS = 7

// SGLang's --speculative-num-draft-tokens counts the verified token too, so
// the same drafter takes vLLM's num_speculative_tokens + 1 (Inco: 7 vs 8).
function sglangTokens(input: SpeculativeInput): number {
  return (input.dflashNumTokens ?? DEFAULT_VLLM_TOKENS) + 1
}

export function isDflashActive(input: SpeculativeInput): boolean {
  return (input.dflashEnabled ?? true) && !!input.dflashDraftModel
}

/** ` --speculative-config '{"method":"dflash",...}'` or "". */
export function vllmSpeculativeArg(input: SpeculativeInput): string {
  if (!isDflashActive(input)) return ""
  const config = {
    method: "dflash",
    model: input.dflashDraftModel,
    num_speculative_tokens: input.dflashNumTokens ?? DEFAULT_VLLM_TOKENS,
  }
  // Single-quoted for the shell; the draft id is a validated HF path so it
  // never contains a quote.
  return ` --speculative-config '${JSON.stringify(config)}'`
}

/** ` --speculative-algorithm DFLASH --speculative-draft-model-path ...` or "". */
export function sglangSpeculativeArg(input: SpeculativeInput): string {
  if (!isDflashActive(input)) return ""
  return ` --speculative-algorithm DFLASH --speculative-draft-model-path ${input.dflashDraftModel} --speculative-num-draft-tokens ${sglangTokens(input)}`
}

/** Array form for providers that build argv instead of a shell string. */
export function vllmSpeculativeArgv(input: SpeculativeInput): string[] {
  if (!isDflashActive(input)) return []
  return [
    "--speculative-config",
    JSON.stringify({
      method: "dflash",
      model: input.dflashDraftModel,
      num_speculative_tokens: input.dflashNumTokens ?? DEFAULT_VLLM_TOKENS,
    }),
  ]
}

export function sglangSpeculativeArgv(input: SpeculativeInput): string[] {
  if (!isDflashActive(input)) return []
  return [
    "--speculative-algorithm", "DFLASH",
    "--speculative-draft-model-path", input.dflashDraftModel as string,
    "--speculative-num-draft-tokens", String(sglangTokens(input)),
  ]
}

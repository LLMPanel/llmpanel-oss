/** Display name for a deployment's inference engine ("vllm" → "VLLM"). */
export function engineLabel(engine: string): string {
  return engine === "llamacpp" ? "llama.cpp" : engine.toUpperCase()
}

/** CPU deployments run llama.cpp on a host with no GPU — no GPU metrics, no VRAM. */
export function isCpuEngine(engine: string): boolean {
  return engine === "llamacpp"
}

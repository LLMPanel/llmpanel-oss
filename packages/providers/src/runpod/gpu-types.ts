// OFFLINE FALLBACK ONLY — the live catalog is the source of truth.
//
// This list was mirrored from the v1 REST OpenAPI enum back when RunPod had no
// endpoint to list GPU types. REST v2 has one (`GET /v2/catalog/gpus`), which
// both the deploy catalog and RunPodProvider now use; this file is what they
// fall back to when that call fails, and what resolves short/legacy LLMPanel
// labels ("H100 SXM") that no API ever returns.
//
// It is known stale — measured against the live catalog it was missing 9 real
// GPUs and still listed 8 that no longer exist — so never gate a user's GPU
// choice on it. Delete it once the aliases below have a better home.
export const RUNPOD_GPU_TYPE_IDS = [
  "NVIDIA GeForce RTX 4090",
  "NVIDIA A40",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 5090",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA GeForce RTX 3090",
  "NVIDIA RTX A4500",
  "NVIDIA L40S",
  "NVIDIA H200",
  "NVIDIA L4",
  "NVIDIA RTX 6000 Ada Generation",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA RTX 4000 Ada Generation",
  "NVIDIA RTX A6000",
  "NVIDIA A100 80GB PCIe",
  "NVIDIA RTX 2000 Ada Generation",
  "NVIDIA RTX A4000",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 NVL",
  "NVIDIA L40",
  "NVIDIA B200",
  "NVIDIA GeForce RTX 3080 Ti",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA GeForce RTX 3080",
  "NVIDIA GeForce RTX 3070",
  "AMD Instinct MI300X OAM",
  "NVIDIA GeForce RTX 4080 SUPER",
  "Tesla V100-PCIE-16GB",
  "Tesla V100-SXM2-32GB",
  "NVIDIA RTX 5000 Ada Generation",
  "NVIDIA GeForce RTX 4070 Ti",
  "NVIDIA RTX 4000 SFF Ada Generation",
  "NVIDIA GeForce RTX 3090 Ti",
  "NVIDIA RTX A2000",
  "NVIDIA GeForce RTX 4080",
  "NVIDIA A30",
  "NVIDIA GeForce RTX 5080",
  "Tesla V100-FHHL-16GB",
  "NVIDIA H200 NVL",
  "Tesla V100-SXM2-16GB",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA A5000 Ada",
  "Tesla V100-PCIE-32GB",
  "NVIDIA GeForce RTX 3080TI",
  "Tesla T4",
  "NVIDIA RTX A30",
] as const

const GPU_ID_SET = new Set<string>(RUNPOD_GPU_TYPE_IDS)

/** True when `id` is a valid RunPod REST `gpuTypeIds` value. */
export function isValidRunpodGpuTypeId(id: string): boolean {
  return GPU_ID_SET.has(id)
}

// Short/legacy names used elsewhere in LLMPanel (e.g. GPU_VRAM_MAP in
// model.service.ts) that don't uniquely token-match a single enum entry —
// resolved explicitly. Keys are normalized (see `norm`).
const GPU_ALIASES: Record<string, string> = {
  "h100 sxm": "NVIDIA H100 80GB HBM3",
  "h100 pcie": "NVIDIA H100 PCIe",
  "a100 sxm": "NVIDIA A100-SXM4-80GB",
  "a100 pcie": "NVIDIA A100 80GB PCIe",
  a40: "NVIDIA A40",
  "rtx 4090": "NVIDIA GeForce RTX 4090",
  "rtx 3090": "NVIDIA GeForce RTX 3090",
  "rtx 4080": "NVIDIA GeForce RTX 4080",
  "rtx 3080": "NVIDIA GeForce RTX 3080",
  l40s: "NVIDIA L40S",
  l4: "NVIDIA L4",
}

// Lowercase, keep alphanumerics only, single-space separated tokens.
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
// Lowercase alphanumerics with all separators stripped (for containment tests).
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Resolve an arbitrary `gpuType` string (a RunPod id, a short displayName, or a
 * legacy LLMPanel label) to a RunPod REST `gpuTypeIds` value.
 *
 * Throws with an actionable message when the GPU can't be confidently mapped,
 * turning RunPod's cryptic schema-validation 400 into a clear error.
 */
export function resolveRunpodGpuTypeId(gpuType: string): string {
  const raw = (gpuType ?? "").trim()
  if (!raw) {
    throw new Error("RunPod: no GPU type provided for deployment.")
  }

  // 1. Already a valid RunPod GPU id.
  if (GPU_ID_SET.has(raw)) return raw

  // 2. Case-/separator-insensitive exact match.
  const exact = RUNPOD_GPU_TYPE_IDS.find((id) => compact(id) === compact(raw))
  if (exact) return exact

  // 3. Known alias (short/legacy label).
  const alias = GPU_ALIASES[norm(raw)]
  if (alias) return alias

  // 4. Unique token-containment match, e.g. "RTX 4090" → "NVIDIA GeForce RTX 4090".
  //    When several ids contain all tokens (e.g. "RTX 4080" also hits
  //    "...4080 SUPER"), prefer the single shortest — the least-embellished name.
  const tokens = norm(raw).split(" ").filter(Boolean)
  const matches = RUNPOD_GPU_TYPE_IDS.filter((id) => {
    const hay = compact(id)
    return tokens.every((t) => hay.includes(t))
  })
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    const byLen = [...matches].sort((a, b) => compact(a).length - compact(b).length)
    if (compact(byLen[0]).length < compact(byLen[1]).length) return byLen[0]
  }

  // 5. No confident match — fail loudly.
  throw new Error(
    `RunPod does not recognize GPU type "${gpuType}". Pick a supported RunPod ` +
      `GPU from the deployment GPU picker (provider catalog), e.g. ` +
      `${RUNPOD_GPU_TYPE_IDS.slice(0, 6).join(", ")}.`,
  )
}

// Static per-GPU VRAM fallback (GB), keyed by RunPod GPU id. Used by
// getMetrics when the live `gpuTypes` lookup fails — RunPod's runtime
// telemetry reports memory as a percentage, so total VRAM must come from
// the GPU type. Not exhaustive; unknown GPUs fall back to 80 GB.
const RUNPOD_GPU_VRAM_GB: Record<string, number> = {
  "NVIDIA GeForce RTX 4090": 24,
  "NVIDIA A40": 48,
  "NVIDIA RTX A5000": 24,
  "NVIDIA GeForce RTX 5090": 32,
  "NVIDIA H100 80GB HBM3": 80,
  "NVIDIA GeForce RTX 3090": 24,
  "NVIDIA RTX A4500": 20,
  "NVIDIA L40S": 48,
  "NVIDIA H200": 141,
  "NVIDIA L4": 24,
  "NVIDIA RTX 6000 Ada Generation": 48,
  "NVIDIA A100-SXM4-80GB": 80,
  "NVIDIA RTX 4000 Ada Generation": 20,
  "NVIDIA RTX A6000": 48,
  "NVIDIA A100 80GB PCIe": 80,
  "NVIDIA RTX 2000 Ada Generation": 16,
  "NVIDIA RTX A4000": 16,
  "NVIDIA RTX PRO 6000 Blackwell Server Edition": 96,
  "NVIDIA H100 PCIe": 80,
  "NVIDIA H100 NVL": 94,
  "NVIDIA L40": 48,
  "NVIDIA B200": 180,
  "NVIDIA GeForce RTX 3080 Ti": 12,
  "NVIDIA GeForce RTX 3080": 10,
  "NVIDIA GeForce RTX 3070": 8,
  "AMD Instinct MI300X OAM": 192,
  "NVIDIA GeForce RTX 4080 SUPER": 16,
  "Tesla V100-PCIE-16GB": 16,
  "Tesla V100-SXM2-32GB": 32,
  "NVIDIA RTX 5000 Ada Generation": 32,
  "NVIDIA GeForce RTX 4070 Ti": 12,
  "NVIDIA GeForce RTX 3090 Ti": 24,
  "NVIDIA RTX A2000": 12,
  "NVIDIA GeForce RTX 4080": 16,
  "NVIDIA A30": 24,
  "NVIDIA GeForce RTX 5080": 16,
  "NVIDIA H200 NVL": 141,
  "Tesla V100-SXM2-16GB": 16,
  "Tesla V100-PCIE-32GB": 32,
  "Tesla T4": 16,
}

/**
 * Per-GPU VRAM in GB for an arbitrary GPU label (id or displayName).
 * Returns null when the GPU can't be mapped — callers pick their own fallback.
 */
export function lookupRunpodGpuVram(gpuType: string): number | null {
  try {
    const id = resolveRunpodGpuTypeId(gpuType)
    return RUNPOD_GPU_VRAM_GB[id] ?? null
  } catch {
    return null
  }
}

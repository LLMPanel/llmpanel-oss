export type GpuBrand = "nvidia" | "amd" | "intel" | "unknown"

export function detectGpuBrand(gpuName: string): GpuBrand {
  const name = gpuName.toLowerCase()
  if (
    name.includes("rtx") || name.includes("a100") || name.includes("h100") ||
    name.includes("l40") || name.includes("a40") || name.includes("a30") ||
    name.includes("v100") || name.includes("t4") || name.includes("a6000") ||
    name.includes("a5000") || name.includes("geforce") || name.includes("titan") ||
    name.includes("tesla") || name.includes("h200") || name.includes("b200") ||
    name.includes("l4")
  ) return "nvidia"
  if (name.includes("mi") || name.includes("radeon") || name.includes("instinct")) return "amd"
  if (name.includes("arc") || name.includes("gaudi") || name.includes("habana")) return "intel"
  return "unknown"
}

// Fixed provider → color/label assignment for the spendings charts.
// Colors follow the entity, never its rank: a provider keeps its hue no
// matter how many others are connected or filtered out.

export interface ProviderMeta {
  label: string
  color: string
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  runpod: { label: "RunPod", color: "var(--chart-1)" },
  vastai: { label: "Vast.ai", color: "var(--chart-2)" },
  hotaisle: { label: "Hot Aisle", color: "var(--chart-3)" },
  thundercompute: { label: "Thunder Compute", color: "var(--chart-4)" },
  lambdalabs: { label: "Lambda Cloud", color: "var(--chart-5)" },
  tensordock: { label: "TensorDock", color: "var(--chart-6)" },
  datacrunch: { label: "DataCrunch", color: "var(--chart-7)" },
  hyperstack: { label: "Hyperstack", color: "var(--chart-8)" },
}

// Neutral, deliberately outside the categorical ramp so "Other" can never be
// confused with a named provider.
const FALLBACK: ProviderMeta = { label: "Other", color: "var(--muted-foreground)" }

export function providerMeta(providerType: string): ProviderMeta {
  return PROVIDER_META[providerType] ?? { ...FALLBACK, label: providerType }
}

export function formatUsd(value: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

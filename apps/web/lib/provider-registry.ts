// Single source of truth for cloud (neocloud) GPU providers in the frontend.
// Adding a new provider = one entry here + a catalog adapter in
// apps/api/src/services/catalog-adapters/. Everything else (badges, cards,
// the add-provider dialog, filters, instances page) picks it up from here.

export type ProviderBadgeVariant =
  | "purple"
  | "teal"
  | "orange"
  | "blue"
  | "rose"
  | "emerald"
  | "success"
  | "warning"
  | "secondary"

export interface CloudProviderMeta {
  /** Human-readable name, e.g. "RunPod" */
  label: string
  /** Badge color used everywhere this provider appears */
  badgeVariant: ProviderBadgeVariant
  /** Short descriptor shown in pickers, e.g. "Serverless & pod GPUs" */
  tagline: string
  /** Tailwind classes for logo tiles: background · icon color · ring */
  accent: string
  /** Tailwind classes for the pill-shaped type chip */
  chip: string
  /** Where users create / find the credential this provider needs */
  docsUrl: string
  keyLabel: string
  keyHint: string
  keyPlaceholder: string
  /** Flip on exactly one provider to move the "Recommended" badge + top slot. */
  recommended?: boolean
  /**
   * Listed in the catalog but not connectable yet. Coming-soon providers still
   * appear in the picker — so people can see what's on the way — but they can't
   * be selected and their credential fields never render.
   */
  comingSoon?: boolean
}

export const CLOUD_PROVIDERS: Record<string, CloudProviderMeta> = {
  runpod: {
    label: "RunPod",
    badgeVariant: "purple",
    tagline: "Serverless & pod GPUs",
    accent: "bg-purple-500/10 text-purple-700 ring-purple-500/20 dark:text-purple-400",
    chip: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-800",
    docsUrl: "https://docs.runpod.io/api-reference/overview",
    keyLabel: "API Key",
    keyHint: "Settings → API Keys in the RunPod console. Read access is required.",
    keyPlaceholder: "rpa_xxxxxxxxxxxxxxxxxxxxxxxx",
    recommended: true,
  },
  vastai: {
    label: "Vast.ai",
    badgeVariant: "teal",
    tagline: "Marketplace GPUs",
    accent: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-400",
    chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-800",
    docsUrl: "https://console.vast.ai/cli/",
    keyLabel: "API Key",
    keyHint: "Account → API Key in the Vast.ai console.",
    keyPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  lambdalabs: {
    label: "Lambda Cloud",
    badgeVariant: "secondary",
    tagline: "On-demand NVIDIA superclusters",
    accent: "bg-foreground/[0.06] text-foreground ring-foreground/15",
    chip: "bg-foreground/[0.06] text-foreground ring-foreground/15",
    docsUrl: "https://docs.lambda.ai/public-cloud/cloud-api/",
    keyLabel: "API Key",
    keyHint: "API keys → Generate API key in the Lambda Cloud console.",
    keyPlaceholder: "your-lambda-api-key",
    comingSoon: true,
  },
  tensordock: {
    label: "TensorDock",
    badgeVariant: "blue",
    tagline: "Marketplace GPUs, per-minute billing",
    accent: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
    chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:ring-sky-800",
    docsUrl: "https://dashboard.tensordock.com/developers",
    keyLabel: "API Token",
    keyHint:
      "Dashboard → Developers → Create Authorization. Paste the API Token (not the Authorization ID) — it's shown only once.",
    keyPlaceholder: "your-api-token",
    comingSoon: true,
  },
  datacrunch: {
    label: "DataCrunch",
    badgeVariant: "emerald",
    tagline: "EU GPU cloud, spot at half price",
    accent: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-800",
    docsUrl: "https://docs.verda.com/welcome-to-verda/api-credentials",
    keyLabel: "Client ID & Secret",
    keyHint:
      "Console → Credentials → Cloud API credentials. Paste as CLIENT_ID:CLIENT_SECRET — the secret is shown only once.",
    keyPlaceholder: "client-id:client-secret",
    comingSoon: true,
  },
  hyperstack: {
    label: "Hyperstack",
    badgeVariant: "rose",
    tagline: "NexGen Cloud H100s & B200s",
    accent: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-400",
    chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:ring-rose-800",
    docsUrl: "https://docs.hyperstack.cloud/docs/api-reference/authentication",
    keyLabel: "API Key",
    keyHint: "Console → Manage → API Keys → Generate a New API Key. Copy it once.",
    keyPlaceholder: "your-hyperstack-api-key",
    comingSoon: true,
  },
  hotaisle: {
    label: "Hot Aisle",
    badgeVariant: "orange",
    tagline: "AMD MI300X clusters",
    accent: "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-400",
    chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:ring-orange-800",
    docsUrl: "https://admin.hotaisle.app/api/docs/",
    keyLabel: "API Key & Team",
    keyHint: "Use the format API_KEY:TEAM_HANDLE — e.g. abc123:my-team.",
    keyPlaceholder: "your-api-key:your-team-handle",
    comingSoon: true,
  },
  thundercompute: {
    label: "Thunder Compute",
    badgeVariant: "warning",
    tagline: "On-demand NVIDIA GPUs",
    accent: "bg-warning/10 text-warning ring-warning/20",
    chip: "bg-warning/12 text-warning ring-warning/30",
    docsUrl: "https://www.thundercompute.com/docs/api-reference",
    keyLabel: "API Token",
    keyHint: "Settings → API Tokens in the Thunder Compute console. Paste the token only.",
    keyPlaceholder: "your-api-token",
    comingSoon: true,
  },
}

/** Metadata for the built-in local Docker provider (not a cloud connection). */
export const LOCAL_PROVIDER_META = {
  label: "Local Docker",
  tagline: "This machine's GPUs",
  accent: "bg-success/10 text-success ring-success/20",
  chip: "bg-success/10 text-success ring-success/25",
} as const

export const CLOUD_PROVIDER_TYPES = Object.keys(CLOUD_PROVIDERS)

/** The subset users can actually connect today. */
export const AVAILABLE_CLOUD_PROVIDER_TYPES = CLOUD_PROVIDER_TYPES.filter(
  (t) => !CLOUD_PROVIDERS[t].comingSoon
)

/** False for catalog entries that are listed but not connectable yet. */
export function isProviderAvailable(type: string): boolean {
  return !CLOUD_PROVIDERS[type]?.comingSoon
}

export function isCloudProviderType(type: string): boolean {
  return type in CLOUD_PROVIDERS
}

/** Metadata for a provider type, with a graceful fallback for unknown types. */
export function providerMeta(type: string): CloudProviderMeta {
  return (
    CLOUD_PROVIDERS[type] ?? {
      label: type,
      badgeVariant: "secondary",
      tagline: "",
      accent: "bg-muted text-muted-foreground ring-border",
      chip: "bg-muted text-muted-foreground ring-border",
      docsUrl: "",
      keyLabel: "API Key",
      keyHint: "",
      keyPlaceholder: "",
    }
  )
}

/** Display name for any provider type, including the non-cloud ones. */
export function providerLabel(type: string): string {
  if (type === "local") return LOCAL_PROVIDER_META.label
  if (type === "mock") return "Mock"
  return CLOUD_PROVIDERS[type]?.label ?? type
}

/** e.g. "RunPod or Vast.ai" — for empty-state copy that lists supported clouds.
 *  Only lists providers that are connectable today. */
export function cloudProviderLabelList(): string {
  const labels = AVAILABLE_CLOUD_PROVIDER_TYPES.map((t) => CLOUD_PROVIDERS[t].label)
  if (labels.length <= 1) return labels[0] ?? ""
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`
}

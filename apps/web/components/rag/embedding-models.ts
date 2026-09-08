// Known embedding models and their output dimensions. Selecting a preset
// auto-fills the correct dimension so the stored vector size always matches
// what the model actually produces (a mismatch silently breaks retrieval).

export type EmbeddingSource = "builtin" | "deployment" | "external"

export interface EmbeddingPreset {
  /** Model id sent to the embedding endpoint (or built-in runner). */
  value: string
  /** Human-readable label shown in the dropdown. */
  label: string
  /** Fixed output dimension for this model. */
  dimensions: number
  /** Which embedding sources this preset is valid for. */
  sources: EmbeddingSource[]
  /** Optional short hint shown under the label. */
  hint?: string
  /** Approximate quantized download size (built-in models only). */
  sizeMb?: number
  /** Language coverage (built-in models only). */
  languages?: string
}

// Sentinel used by the "Custom…" dropdown entry — unlocks free-text inputs.
export const CUSTOM_MODEL = "__custom__"

// Curated models that run locally inside the API via Transformers.js (ONNX,
// q8). Must stay in sync with BUILTIN_EMBEDDING_MODELS in
// apps/api/src/services/rag.service.ts.
export const BUILTIN_MODEL = "Xenova/all-MiniLM-L6-v2"
export const BUILTIN_DIMENSIONS = 384

export const EMBEDDING_PRESETS: EmbeddingPreset[] = [
  {
    value: BUILTIN_MODEL,
    label: "all-MiniLM-L6-v2",
    dimensions: 384,
    sources: ["builtin"],
    hint: "Fastest — great default for English",
    sizeMb: 23,
    languages: "English",
  },
  {
    value: "Xenova/bge-small-en-v1.5",
    label: "bge-small-en-v1.5",
    dimensions: 384,
    sources: ["builtin"],
    hint: "Higher retrieval quality for English",
    sizeMb: 34,
    languages: "English",
  },
  {
    value: "Xenova/gte-small",
    label: "gte-small",
    dimensions: 384,
    sources: ["builtin"],
    hint: "Strong general-purpose English model",
    sizeMb: 34,
    languages: "English",
  },
  {
    value: "Xenova/multilingual-e5-small",
    label: "multilingual-e5-small",
    dimensions: 384,
    sources: ["builtin"],
    hint: "Best for non-English or mixed content",
    sizeMb: 118,
    languages: "100+ languages",
  },
  // OpenAI-compatible (deployment endpoint or external API)
  {
    value: "text-embedding-3-small",
    label: "OpenAI text-embedding-3-small",
    dimensions: 1536,
    sources: ["deployment", "external"],
  },
  {
    value: "text-embedding-3-large",
    label: "OpenAI text-embedding-3-large",
    dimensions: 3072,
    sources: ["deployment", "external"],
  },
  {
    value: "text-embedding-ada-002",
    label: "OpenAI text-embedding-ada-002",
    dimensions: 1536,
    sources: ["deployment", "external"],
  },
  {
    value: "nomic-embed-text-v1.5",
    label: "nomic-embed-text-v1.5",
    dimensions: 768,
    sources: ["deployment", "external"],
  },
  {
    value: "bge-large-en-v1.5",
    label: "BAAI bge-large-en-v1.5",
    dimensions: 1024,
    sources: ["deployment", "external"],
  },
  {
    value: "bge-base-en-v1.5",
    label: "BAAI bge-base-en-v1.5",
    dimensions: 768,
    sources: ["deployment", "external"],
  },
]

/** Presets available for a given embedding source. */
export function presetsForSource(source: EmbeddingSource): EmbeddingPreset[] {
  return EMBEDDING_PRESETS.filter((p) => p.sources.includes(source))
}

/** Find a preset by model id, or undefined when it's a custom value. */
export function findPreset(value: string): EmbeddingPreset | undefined {
  return EMBEDDING_PRESETS.find((p) => p.value === value)
}

// apps/api/src/services/model-registry.service.ts
//
// Client for the model registry (see ModelRegistry.md), the catalog of
// deployable LLMs. The API is its only consumer: the dashboard reads it through
// GET /api/v1/registry/models, and deployments resolve their model here. That
// makes the registry address one server-side setting (MODEL_REGISTRY_URL),
// takes browsers' CORS out of the picture, and lets the last good catalog carry
// the deploy wizard through a registry outage.
import { env } from "../env"

export interface RegistryModel {
  id: string
  name: string
  slug: string
  family: string
  huggingfaceId: string
  description: string
  minVram: number
  tags: string[]
  // Optional serving overrides for non-LLM models (e.g. OCR/VLM).
  modelType?: string | null
  dockerImage?: string | null
  extraArgs?: string | null
  quantizations: Array<{
    format: string
    vramRequiredGb: number
    huggingfaceId: string | null
    fileSizeGb: number
    recommended: boolean
    notes: string
  }>
}

/** The shape of the registry's own GET /models response. */
export interface RegistryCatalog {
  models: RegistryModel[]
  total: number
  families: string[]
}

export interface RegistryFilters {
  family?: string
  search?: string
  tag?: string
}

/** How long a fetched catalog is served before a request triggers a refresh. */
const CATALOG_TTL_MS = 5 * 60 * 1000
/** After a failed refresh, how long to answer from what we have before retrying. */
const RETRY_AFTER_FAILURE_MS = 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

let cached: { catalog: RegistryCatalog; fetchedAt: number } | null = null
let refreshing: Promise<RegistryCatalog> | null = null
let lastFailure: { error: Error; at: number } | null = null

async function fetchRegistry<T>(path: string): Promise<T> {
  const res = await fetch(`${env.MODEL_REGISTRY_URL}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`model registry answered ${res.status} for ${path}`)
  return (await res.json()) as T
}

/**
 * The full catalog. Refreshed at most every five minutes, with concurrent
 * callers sharing one upstream request. A failed refresh serves the last good
 * catalog, and for the next minute nobody waits on a registry that is down.
 * With nothing cached the error propagates so callers can report the outage.
 */
export async function getRegistryCatalog(): Promise<RegistryCatalog> {
  const now = Date.now()
  if (cached && now - cached.fetchedAt < CATALOG_TTL_MS) return cached.catalog
  if (lastFailure && now - lastFailure.at < RETRY_AFTER_FAILURE_MS) {
    if (cached) return cached.catalog
    throw lastFailure.error
  }

  refreshing ??= fetchRegistry<RegistryCatalog>("/models")
    .then((catalog) => {
      cached = { catalog, fetchedAt: Date.now() }
      lastFailure = null
      return catalog
    })
    .finally(() => {
      refreshing = null
    })

  try {
    return await refreshing
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    lastFailure = { error, at: Date.now() }
    if (cached) {
      console.warn(
        `[registry] refresh failed (${error.message}); serving the catalog fetched ${new Date(cached.fetchedAt).toISOString()}`
      )
      return cached.catalog
    }
    throw error
  }
}

/** The registry's GET /models filters, applied to the cached catalog. */
export function filterCatalog(catalog: RegistryCatalog, filters: RegistryFilters): RegistryCatalog {
  const search = filters.search?.toLowerCase()
  const models = catalog.models.filter(
    (m) =>
      (!filters.family || m.family === filters.family) &&
      (!search || m.name.toLowerCase().includes(search) || m.family.toLowerCase().includes(search)) &&
      (!filters.tag || m.tags.includes(filters.tag))
  )
  return { models, total: models.length, families: [...new Set(models.map((m) => m.family))] }
}

/**
 * One model by slug. Answered from the catalog when it has the slug; a model
 * added since the last refresh is asked for directly.
 */
export async function findRegistryModelBySlug(slug: string): Promise<RegistryModel | null> {
  const catalog = await getRegistryCatalog().catch(() => null)
  const hit = catalog?.models.find((m) => m.slug === slug)
  if (hit) return hit

  try {
    const data = await fetchRegistry<{ model?: RegistryModel }>(`/models/${encodeURIComponent(slug)}`)
    return data.model ?? null
  } catch {
    return null
  }
}

/** One model by Hugging Face repo id, from the catalog only — used for display. */
export async function findRegistryModelByHuggingfaceId(huggingfaceId: string): Promise<RegistryModel | null> {
  const catalog = await getRegistryCatalog().catch(() => null)
  return catalog?.models.find((m) => m.huggingfaceId === huggingfaceId) ?? null
}

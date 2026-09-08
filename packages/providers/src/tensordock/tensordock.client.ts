export const TENSORDOCK_API_BASE = "https://dashboard.tensordock.com/api/v2"
/** Public, unauthenticated inventory API. v2's /locations returns an empty
 *  array regardless of credentials, so discovery falls back to this. */
export const TENSORDOCK_V1_BASE = "https://api.tensordock.com/api/v1"

/**
 * TensorDock v2 API client.
 *
 * Two response hazards this guards against: auth failures come back as
 * `text/plain` ("Unauthorized"), and unknown routes return a full Next.js
 * HTML page — so error bodies must never be JSON.parsed blindly.
 */
export async function tensordockRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${TENSORDOCK_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()
  const contentType = res.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")

  if (!res.ok) {
    let detail = isJson ? text : text.slice(0, 200)
    if (isJson) {
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string }
        detail = parsed.error ?? parsed.message ?? text
      } catch {
        // Fall back to the raw body.
      }
    } else if (res.status === 401) {
      detail = "Unauthorized — check the API token"
    } else if (res.status === 404) {
      detail = "Endpoint not found"
    }
    throw new Error(`TensorDock API error ${res.status}: ${detail}`)
  }

  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export interface TensorDockV1Page<T> {
  results: T[]
  total_result_count?: number
  has_next?: boolean
}

/** Page through a public v1 collection. `limit` is capped at 15 upstream —
 *  asking for more silently truncates, so paging is mandatory. */
export async function tensordockV1List<T>(path: string, maxPages = 10): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${TENSORDOCK_V1_BASE}${path}?limit=15&offset=${page * 15}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`TensorDock v1 API error ${res.status}`)
    const body = (await res.json()) as TensorDockV1Page<T>
    out.push(...(body.results ?? []))
    if (!body.has_next) break
  }
  return out
}

import { GraphQLClient } from "graphql-request"

export const RUNPOD_GQL_ENDPOINT = "https://api.runpod.io/graphql"

/** REST v1 — deprecated upstream, retires 2026-12-01. */
export const RUNPOD_REST_BASE = "https://rest.runpod.io/v1"

/**
 * REST v2 base.
 *
 * The migration guide says the base URL "moves to https://api.runpod.io/v2",
 * but the OpenAPI `servers` entry is the bare origin and every path already
 * carries its own `/v2` prefix. Appending `/v2` here yields `/v2/v2/...` and a
 * 404 `{"detail":"The requested path was not found."}`. Callers pass paths that
 * start with `/v2`.
 */
export const RUNPOD_REST_V2_BASE = "https://api.runpod.io"

// ── API version selection ─────────────────────────────────────────────

export type RunPodApiVersion = "v1" | "v2"

// Module-level so the version can be set once at API startup instead of being
// threaded through every createProvider() call site. RunPodProvider takes a
// per-instance override for tests.
let apiVersion: RunPodApiVersion = "v2"

export function setRunPodApiVersion(version: RunPodApiVersion): void {
  apiVersion = version
}

export function getRunPodApiVersion(): RunPodApiVersion {
  return apiVersion
}

// ── Errors ────────────────────────────────────────────────────────────

/** RFC 9457 problem document — the v2 error body. */
interface ProblemDetails {
  title?: string
  status?: number
  detail?: string
  errors?: string[]
}

/** v1 error body. */
interface LegacyErrorBody {
  message?: string
  error?: string
}

/**
 * A failed RunPod REST call, from either API version.
 *
 * v2 answers with `application/problem+json` (RFC 9457): `{title, status,
 * detail, errors?}`, where `errors` holds per-field validation messages like
 * `"$: missing property 'name'"`. v1 answers with `{message}`. Both are folded
 * into the same shape so callers never branch on version.
 *
 * The classification getters encode RunPod's documented create-pod semantics —
 * the distinction that matters is 400 (this candidate is unavailable, try the
 * next GPU/datacenter) versus 422 (the request itself is wrong, retrying with
 * different placement will never help).
 */
export class RunPodApiError extends Error {
  readonly status: number
  readonly title: string | null
  readonly detail: string | null
  readonly errors: string[]
  readonly retryAfterSeconds: number | null
  readonly method: string
  readonly path: string
  readonly body: string

  constructor(init: {
    status: number
    method: string
    path: string
    body: string
    retryAfterSeconds?: number | null
  }) {
    const parsed = RunPodApiError.parseBody(init.body)
    const summary =
      parsed.detail ??
      (parsed.errors.length > 0 ? parsed.errors.join("; ") : null) ??
      parsed.title ??
      init.body ??
      ""

    super(`RunPod ${init.method} ${init.path} failed (${init.status}): ${summary}`)
    this.name = "RunPodApiError"
    this.status = init.status
    this.method = init.method
    this.path = init.path
    this.body = init.body
    this.title = parsed.title
    this.detail = parsed.detail
    this.errors = parsed.errors
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }

  private static parseBody(raw: string): {
    title: string | null
    detail: string | null
    errors: string[]
  } {
    try {
      const parsed = JSON.parse(raw) as ProblemDetails & LegacyErrorBody
      return {
        title: parsed.title ?? null,
        // v1 has no `detail`; its `message`/`error` play the same role.
        detail: parsed.detail ?? parsed.message ?? parsed.error ?? null,
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      }
    } catch {
      // Non-JSON body (HTML error page, proxy timeout) — the raw text is all
      // there is, and the caller already has it on `.body`.
      return { title: null, detail: null, errors: [] }
    }
  }

  /** Request violates the API contract — the same body will never succeed. */
  get isValidationError(): boolean {
    return this.status === 422
  }

  /**
   * Business-rule violation *or* no capacity — RunPod does not distinguish the
   * two. On create, move on to the next GPU type / datacenter candidate.
   */
  get isCapacityError(): boolean {
    return this.status === 400
  }

  /** Account balance too low. Stop — no candidate will succeed. */
  get isInsufficientBalance(): boolean {
    return this.status === 402
  }

  /** No access to this pool (e.g. a reserved datacenter). Skip the candidate. */
  get isForbidden(): boolean {
    return this.status === 403
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** Worth retrying the identical request after a delay. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

function retryAfterOf(res: Response): number | null {
  const header = res.headers.get("Retry-After")
  if (!header) return null
  // Retry-After is either delta-seconds or an HTTP date.
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds
  const at = Date.parse(header)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

// ── GraphQL ───────────────────────────────────────────────────────────

/**
 * GraphQL client.
 *
 * Still required after the v2 migration: v2 has no account-balance endpoint,
 * so `myself { clientBalance }` stays the only source for provider stats.
 * Everything else GraphQL was used for (gpuTypes, pod metrics) is covered by
 * `/v2/catalog/gpus` and `Pod.runtime`.
 */
export function createRunPodClient(apiKey: string): GraphQLClient {
  return new GraphQLClient(RUNPOD_GQL_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
    // graphql-request v6 ships an old cross-fetch that throws
    // "FetchError: Premature close" on Node 18+. Use native fetch.
    fetch: globalThis.fetch,
  })
}

// ── REST ──────────────────────────────────────────────────────────────

async function request<T>(
  base: string,
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal !== undefined ? { signal } : {}),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new RunPodApiError({
      status: res.status,
      method,
      path,
      body: text,
      retryAfterSeconds: retryAfterOf(res),
    })
  }

  // DELETE /v2/pods/{id} answers 204 with no body.
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/** REST v1 call. Deprecated — retires 2026-12-01. */
export function runpodRest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return request<T>(RUNPOD_REST_BASE, apiKey, method, path, body)
}

/** REST v2 call. `path` must include the `/v2` prefix (see RUNPOD_REST_V2_BASE). */
export function runpodRestV2<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(RUNPOD_REST_V2_BASE, apiKey, method, path, body, signal)
}

/**
 * Open a v2 SSE stream and hand back the raw `Response`.
 *
 * `GET /v2/pods/{id}/logs` holds the connection open, so it can't go through
 * the JSON helper above — the caller reads `res.body` frame by frame. Errors
 * still surface as `RunPodApiError`.
 */
export async function runpodStreamV2(
  apiKey: string,
  path: string,
  init?: { signal?: AbortSignal; lastEventId?: string },
): Promise<Response> {
  const res = await fetch(`${RUNPOD_REST_V2_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
      // Wins over ?since/?tail upstream — used to resume without gaps.
      ...(init?.lastEventId !== undefined ? { "Last-Event-ID": init.lastEventId } : {}),
    },
    ...(init?.signal !== undefined ? { signal: init.signal } : {}),
  })

  if (!res.ok || !res.body) {
    const text = res.ok ? "response had no body" : await res.text()
    throw new RunPodApiError({
      status: res.status,
      method: "GET",
      path,
      body: text,
      retryAfterSeconds: retryAfterOf(res),
    })
  }
  return res
}

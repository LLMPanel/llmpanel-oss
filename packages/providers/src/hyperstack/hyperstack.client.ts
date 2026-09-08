export const HYPERSTACK_API_BASE = "https://infrahub-api.nexgencloud.com/v1"

interface HyperstackErrorBody {
  status?: boolean
  message?: string
  error_reason?: string
}

/**
 * Hyperstack (NexGen Cloud) API client.
 *
 * Auth is a custom `api_key` header, not Bearer. Responses are wrapped in
 * `{status, message, ...}`; errors set `status: false` and usually carry an
 * `error_reason`. A few endpoints (notably /pricebook) return a bare array
 * with no envelope, so unwrapping is left to the caller.
 */
export async function hyperstackRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${HYPERSTACK_API_BASE}${path}`, {
    method,
    headers: {
      api_key: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()

  if (!res.ok) {
    let detail = text
    try {
      const parsed = JSON.parse(text) as HyperstackErrorBody
      // Some 5xx responses omit error_reason entirely.
      detail = parsed.error_reason
        ? `(${parsed.error_reason}) ${parsed.message ?? ""}`.trim()
        : (parsed.message ?? text)
    } catch {
      // Non-JSON body — keep the raw text.
    }
    throw new Error(`Hyperstack API error ${res.status}: ${detail}`)
  }

  if (!text) return undefined as T
  return JSON.parse(text) as T
}

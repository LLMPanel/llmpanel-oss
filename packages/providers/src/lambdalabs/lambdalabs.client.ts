export const LAMBDA_API_BASE = "https://cloud.lambda.ai/api/v1"

interface LambdaErrorBody {
  error?: { code?: string; message?: string; suggestion?: string }
}

/**
 * Minimal Lambda Cloud API client. Success responses are always wrapped in
 * `{ data: ... }` — this unwraps them. Errors carry a stable `code` string
 * (e.g. "instance-operations/launch/insufficient-capacity"), which is folded
 * into the thrown message so callers can branch on it.
 */
export async function lambdaRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${LAMBDA_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()

  if (!res.ok) {
    let detail = text
    try {
      const parsed = JSON.parse(text) as LambdaErrorBody
      if (parsed.error?.code) {
        detail = `(${parsed.error.code}) ${parsed.error.message ?? ""}`.trim()
      }
    } catch {
      // Non-JSON error body — keep the raw text.
    }
    throw new Error(`Lambda Cloud API error ${res.status}: ${detail}`)
  }

  if (!text) return undefined as T
  return (JSON.parse(text) as { data: T }).data
}

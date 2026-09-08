export const THUNDERCOMPUTE_API_BASE = "https://api.thundercompute.com:8443/v1"

export async function thundercomputeRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${THUNDERCOMPUTE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Thunder Compute API error ${res.status}: ${text}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

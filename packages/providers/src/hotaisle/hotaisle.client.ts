export const HOTAISLE_API_BASE = "https://admin.hotaisle.app/api"

export async function hotaisleRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${HOTAISLE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hot Aisle API error ${res.status}: ${text}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

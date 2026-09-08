/**
 * Client for the LLMPanel KMS worker (infra/kms-worker). Fetches the
 * credential-encryption key material once at boot so the key never has to
 * live in .env on this host. Retries with backoff — a transient network blip
 * at boot must not take the panel down.
 */

const ATTEMPTS = 5
const REQUEST_TIMEOUT_MS = 10_000

export async function fetchKmsKeyMaterial(kmsUrl: string, token: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(new URL("/v1/key", kmsUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`KMS responded ${res.status}`)
      const body = (await res.json()) as { key?: unknown }
      if (typeof body.key !== "string" || !body.key) {
        throw new Error("KMS response missing key")
      }
      return body.key
    } catch (err) {
      lastError = err
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }
  }
  throw new Error(
    `Could not fetch encryption key from KMS after ${ATTEMPTS} attempts: ` +
    (lastError instanceof Error ? lastError.message : String(lastError))
  )
}

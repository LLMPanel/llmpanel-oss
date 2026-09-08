/**
 * LLMPanel KMS worker.
 *
 * Releases the credential-encryption master key to the API host at boot, so
 * the key never sits in .env on the VPS. A stolen disk or .env backup no
 * longer contains the key — and access is revocable (rotate AUTH_TOKEN) and
 * audited (every release/denial is logged as structured JSON).
 *
 * Single endpoint:  POST /v1/key   Authorization: Bearer <AUTH_TOKEN>
 * Response:         { "key": "<MASTER_KEY>" }
 */

interface Env {
  /** Secret: the encryption key material released to the API host. */
  MASTER_KEY: string
  /** Secret: bearer token the API host must present. Rotate to revoke. */
  AUTH_TOKEN: string
  /** Optional: comma-separated allowlist of caller IPs (the VPS address). */
  ALLOWED_IPS?: string
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
}

/**
 * Timing-safe token comparison. Inputs are hashed first so the buffers are
 * always equal-length (timingSafeEqual throws on length mismatch, which would
 * itself leak length information).
 */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)])
  return crypto.subtle.timingSafeEqual(a, b)
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== "POST" || url.pathname !== "/v1/key") {
      return Response.json({ error: "not found" }, { status: 404 })
    }

    if (!env.MASTER_KEY || !env.AUTH_TOKEN) {
      // Misconfigured deploy — refuse rather than serve an empty key.
      return Response.json({ error: "worker not configured" }, { status: 500 })
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown"

    if (env.ALLOWED_IPS) {
      const allowed = env.ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean)
      if (allowed.length > 0 && !allowed.includes(ip)) {
        console.log(JSON.stringify({ event: "kms.denied", reason: "ip", ip }))
        return Response.json({ error: "forbidden" }, { status: 403 })
      }
    }

    const auth = request.headers.get("authorization") ?? ""
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : ""
    if (!token || !(await tokenMatches(token, env.AUTH_TOKEN))) {
      console.log(JSON.stringify({ event: "kms.denied", reason: "token", ip }))
      return Response.json({ error: "unauthorized" }, { status: 401 })
    }

    console.log(JSON.stringify({ event: "kms.release", ip }))
    return Response.json({ key: env.MASTER_KEY })
  },
} satisfies ExportedHandler<Env>

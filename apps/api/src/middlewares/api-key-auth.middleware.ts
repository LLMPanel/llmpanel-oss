import { createMiddleware } from "hono/factory"
import { createHash } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { apiKeys } from "@llmpanel/db"
import { apiKeyRateLimiter } from "../services/rate-limiter"
import { resolveActiveWorkspace } from "./session-auth.middleware"

const DAY_MS = 24 * 60 * 60 * 1000

// Only touch lastUsedAt once a minute per key — it's a coarse "recently used"
// signal, not an audit trail (request_logs is).
const LAST_USED_WRITE_INTERVAL_MS = 60_000

// The scopes the gateway actually enforces. Anything outside this list is
// inert — it would never match a requireScope() call — so key creation
// rejects unknown scopes rather than minting a key that silently 403s.
export const GATEWAY_SCOPES = ["chat", "images", "embeddings"] as const
export type GatewayScope = (typeof GATEWAY_SCOPES)[number]

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return ["chat"]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string")
  } catch {
    // fall through to default
  }
  return ["chat"]
}

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization")

  if (!authHeader?.startsWith("Bearer gpup_sk_")) {
    return c.json({
      error: {
        message: "Invalid API key format. Expected: Bearer gpup_sk_...",
        type: "invalid_api_key",
      }
    }, 401)
  }

  const rawKey = authHeader.replace("Bearer ", "")
  const keyHash = createHash("sha256").update(rawKey).digest("hex")

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash))

  if (!apiKey || apiKey.isActive !== true) {
    return c.json({ error: { message: "Invalid API key", type: "invalid_api_key" } }, 401)
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return c.json({ error: { message: "API key has expired", type: "expired_api_key" } }, 401)
  }

  // Per-key rate limits (in-memory sliding windows — single API process).
  if (apiKey.rpmLimit && !apiKeyRateLimiter.allow(`rpm:${apiKey.id}`, apiKey.rpmLimit, 60_000)) {
    return c.json({
      error: {
        message: `Rate limit exceeded: this API key allows ${apiKey.rpmLimit} requests per minute.`,
        type: "rate_limit_exceeded",
      },
    }, 429)
  }
  if (apiKey.dailyLimit && !apiKeyRateLimiter.allow(`day:${apiKey.id}`, apiKey.dailyLimit, DAY_MS)) {
    return c.json({
      error: {
        message: `Rate limit exceeded: this API key allows ${apiKey.dailyLimit} requests per day.`,
        type: "rate_limit_exceeded",
      },
    }, 429)
  }

  const now = new Date()
  if (!apiKey.lastUsedAt || now.getTime() - apiKey.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
    void Promise.resolve(
      db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, apiKey.id))
    ).catch(() => {
      /* non-fatal — keep serving the request */
    })
  }

  // Gateway traffic is billed and logged against the key's workspace. Legacy
  // keys predating workspaces fall back to their creator's oldest workspace.
  let workspaceId = apiKey.workspaceId
  if (!workspaceId) {
    const fallback = await resolveActiveWorkspace(apiKey.userId, null)
    if (!fallback) {
      return c.json(
        { error: { message: "API key is not attached to a workspace", type: "invalid_api_key" } },
        403
      )
    }
    workspaceId = fallback.workspaceId
  }

  c.set("apiKey", { ...apiKey, workspaceId })
  c.set("apiKeyScopes", parseScopes(apiKey.scopes))
  c.set("deploymentId", apiKey.deploymentId)
  c.set("workspaceId", workspaceId)
  await next()
})

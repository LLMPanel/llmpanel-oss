// apps/api/src/middlewares/rate-limit.middleware.ts
import { createMiddleware } from "hono/factory"
import { db } from "@llmpanel/db"
import { requestLogs, apiKeys as gatewayApiKeys } from "@llmpanel/db/schema"
import { eq, and, gte, count } from "drizzle-orm"

// ── In-memory store for rate limiting ────────────────────────────────
// Simple Map-based store — good enough for single instance (self-hosted)
// For cloud/multi-instance: replace with Redis
interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > 60 * 1000) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

// ── RPM rate limiter (for gateway API key routes) ─────────────────────
export const apiKeyRateLimit = createMiddleware(async (c, next) => {
  const apiKey = c.get("apiKey") as typeof gatewayApiKeys.$inferSelect | undefined

  // No API key context — skip (other middleware handles auth)
  if (!apiKey) {
    await next()
    return
  }

  // No limit set — allow all
  if (!apiKey.rpmLimit) {
    await next()
    return
  }

  const now = Date.now()
  const windowMs = 60 * 1000  // 1 minute window
  const storeKey = `rpm:${apiKey.id}`

  const entry = rateLimitStore.get(storeKey)

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    rateLimitStore.set(storeKey, { count: 1, windowStart: now })
    await next()
    return
  }

  if (entry.count >= apiKey.rpmLimit) {
    const resetIn = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)
    return c.json(
      {
        error: {
          message: `Rate limit exceeded. Max ${apiKey.rpmLimit} requests per minute.`,
          type: "rate_limit_exceeded",
          resetInSeconds: resetIn,
        },
      },
      429
    )
  }

  // Increment counter
  entry.count++
  await next()
})

// ── Daily limit checker (for gateway API key routes) ──────────────────
export const dailyLimitCheck = createMiddleware(async (c, next) => {
  const apiKey = c.get("apiKey") as typeof gatewayApiKeys.$inferSelect | undefined

  if (!apiKey?.dailyLimit) {
    await next()
    return
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [{ total }] = await db
    .select({ total: count() })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.apiKeyId, apiKey.id),
        gte(requestLogs.createdAt, todayStart)
      )
    )

  if (Number(total) >= apiKey.dailyLimit) {
    return c.json(
      {
        error: {
          message: `Daily request limit of ${apiKey.dailyLimit} reached. Resets at midnight.`,
          type: "daily_limit_exceeded",
          limit: apiKey.dailyLimit,
          used: Number(total),
        },
      },
      429
    )
  }

  await next()
})

// ── General IP-based rate limiter (for auth routes) ───────────────────
// Prevents brute force on login/register endpoints
export const ipRateLimit = (
  maxRequests: number = 20,
  windowMinutes: number = 15
) =>
  createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown"

    const now = Date.now()
    const windowMs = windowMinutes * 60 * 1000
    const storeKey = `ip:${ip}:${c.req.path}`

    const entry = rateLimitStore.get(storeKey)

    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitStore.set(storeKey, { count: 1, windowStart: now })
      await next()
      return
    }

    if (entry.count >= maxRequests) {
      return c.json(
        {
          error: `Too many requests. Max ${maxRequests} per ${windowMinutes} minutes.`,
        },
        429
      )
    }

    entry.count++
    await next()
  })
// apps/api/src/middlewares/request-logger.middleware.ts
//
// One line per request: method, path, status, duration. With
// LOG_REQUEST_BODIES=true the panel's own /api/* routes also log redacted
// query, request and response bodies — but never /api/auth/* (passwords,
// one-time codes, 2FA secrets), never the OpenAI-compatible gateway (prompts
// and completions), and never a streamed response: reading a stream to log it
// holds the whole response back from the client until it has finished.
import { createMiddleware } from "hono/factory"
import { env } from "../env"
import { redact, redactText } from "../lib/redact"

const LOG_DIVIDER = "=".repeat(80)
const MAX_LOG_BODY_LENGTH = 4000

function mayLogBodies(path: string): boolean {
  return path.startsWith("/api/") && !path.startsWith("/api/auth/")
}

/** JSON and plain text only — never event streams, downloads, or images. */
function isLoggableBody(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  return contentType.includes("application/json") || contentType.startsWith("text/plain")
}

function formatBody(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return "-"

  let formatted: string
  try {
    formatted = JSON.stringify(redact(JSON.parse(trimmed)), null, 2)
  } catch {
    formatted = redactText(trimmed)
  }
  return formatted.length > MAX_LOG_BODY_LENGTH
    ? `${formatted.slice(0, MAX_LOG_BODY_LENGTH)}\n... [truncated]`
    : formatted
}

export const requestLogger = createMiddleware(async (c, next) => {
  const startedAt = Date.now()
  const method = c.req.method
  const path = c.req.path
  const logBodies = env.LOG_REQUEST_BODIES && mayLogBodies(path)

  let requestBody = ""
  if (logBodies && method !== "GET" && method !== "HEAD" && isLoggableBody(c.req.header("content-type"))) {
    try {
      requestBody = await c.req.raw.clone().text()
    } catch {
      requestBody = "[unreadable request body]"
    }
  }

  await next()

  const durationMs = Date.now() - startedAt
  const status = c.res.status

  if (!logBodies) {
    console.log(`[API] ${method} ${path} ${status} ${durationMs}ms`)
    return
  }

  let responseBody = ""
  if (isLoggableBody(c.res.headers.get("content-type"))) {
    try {
      responseBody = await c.res.clone().text()
    } catch {
      responseBody = "[unreadable response body]"
    }
  }

  const query = c.req.query()
  console.log(LOG_DIVIDER)
  console.log(`[API] ${method} ${path}`)
  console.log(`time      : ${new Date().toISOString()}`)
  console.log(`status    : ${status}`)
  console.log(`duration  : ${durationMs}ms`)
  console.log(`query     : ${Object.keys(query).length > 0 ? JSON.stringify(redact(query), null, 2) : "-"}`)
  console.log("request   :")
  console.log(formatBody(requestBody))
  console.log("response  :")
  console.log(formatBody(responseBody))
  console.log(LOG_DIVIDER)
})

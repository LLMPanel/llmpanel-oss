import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth"
import { env } from "./env"
import { deploymentsRoute } from "./routes/deployments.route"
import { modelsRoute } from "./routes/models.route"
import { metricsRoute } from "./routes/metrics.route"
import { providersRoute } from "./routes/providers.route"
import { apiKeysRoute } from "./routes/api-keys.route"
import { gatewayRoute } from "./routes/gateway.route"
import { analyticsRoute } from "./routes/analytics.route"
import { adminRoute } from "./routes/admin.route"
import { systemRoute } from "./routes/system.route"
import { alertsRoute } from "./routes/alerts.route"
import { backupRoute } from "./routes/backup.route"
import { imagesRoute } from "./routes/images.route"
import { setupRoute } from "./routes/setup.route"
import { waitlistRoute } from "./routes/waitlist.route"
import { spendingsRoute } from "./routes/spendings.route"
import { billingRoute } from "./routes/billing.route"
import { seedModels } from "./services/model.service"
import { channelManager } from "./services/channel-manager.service"
import { metricsCollector } from "./services/metrics-collector.service"
import { statusReconciler } from "./services/status-reconciler.service"
import { spendSnapshotCollector } from "./services/spend-snapshot.service"
import { startUsageReporting } from "./services/billing.service"
import { assertEncryptionKey, setKeyMaterial, hasKeyMaterial } from "./services/encryption.service"
import { migrateLegacyCredentials } from "./services/credential-migration.service"
import { fetchKmsKeyMaterial } from "./services/kms.service"
import { isDeploymentDomain } from "./services/domain.service"
import { setRunPodApiVersion } from "@llmpanel/providers"
import { db, runMigrations } from "@llmpanel/db"
import { deployments } from "@llmpanel/db/schema"
import { eq } from "drizzle-orm"

const app = new Hono()
const LOG_DIVIDER = "=".repeat(80)
const MAX_LOG_BODY_LENGTH = 4000

// Request bodies are logged below — never let submitted credentials (provider
// API keys, TOTP secrets, bot tokens, webhook URLs) land in plaintext logs.
const SENSITIVE_KEY_PATTERN = /apikey|api_key|secret|token|password|credential|authorization|webhookurl/i

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SENSITIVE_KEY_PATTERN.test(k) && typeof v === "string" && v
          ? [k, "[REDACTED]"]
          : [k, redactSecrets(v)]
      )
    )
  }
  return value
}

function prettyBody(raw: string): string {
  if (!raw) return "-"

  const trimmed = raw.trim()
  if (!trimmed) return "-"

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const formatted = JSON.stringify(redactSecrets(parsed), null, 2)
    if (formatted.length > MAX_LOG_BODY_LENGTH) {
      return `${formatted.slice(0, MAX_LOG_BODY_LENGTH)}\n... [truncated]`
    }
    return formatted
  } catch {
    if (trimmed.length > MAX_LOG_BODY_LENGTH) {
      return `${trimmed.slice(0, MAX_LOG_BODY_LENGTH)}\n... [truncated]`
    }
    return trimmed
  }
}

// CORS — the app origin gets credentialed CORS; the waitlist endpoint is
// called cross-origin by the static marketing site (llmpanel.io), so that one
// path gets open, credential-less CORS instead. Split rather than widening the
// app policy so credentials never pair with a reflected arbitrary origin.
const appCors = cors({
  origin: [env.NEXT_PUBLIC_APP_URL],
  allowHeaders: ["Content-Type", "Authorization", "X-Client-Request-Id"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["X-Request-Id", "X-Client-Request-Id"],
  credentials: true,
})
const waitlistCors = cors({
  origin: "*",
  allowHeaders: ["Content-Type"],
  allowMethods: ["POST", "OPTIONS"],
})
app.use("*", (c, next) =>
  c.req.path.startsWith("/api/v1/waitlist") ? waitlistCors(c, next) : appCors(c, next)
)

// Log request/response details for every endpoint hit
app.use("*", async (c, next) => {
  const startedAt = Date.now()
  const method = c.req.method
  const path = c.req.path
  const query = c.req.query()

  let requestBody = ""
  if (method !== "GET" && method !== "HEAD") {
    const contentType = c.req.header("content-type") ?? ""
    if (contentType.includes("application/json") || contentType.includes("text/")) {
      try {
        requestBody = await c.req.raw.clone().text()
      } catch {
        requestBody = "[unreadable request body]"
      }
    }
  }

  await next()

  const durationMs = Date.now() - startedAt
  const status = c.res.status

  let responseBody = ""
  try {
    responseBody = await c.res.clone().text()
  } catch {
    responseBody = "[unreadable response body]"
  }

  const timestamp = new Date().toISOString()
  const queryString = Object.keys(query).length > 0
    ? JSON.stringify(query, null, 2)
    : "-"

  console.log(LOG_DIVIDER)
  console.log(`[API] ${method} ${path}`)
  console.log(`time      : ${timestamp}`)
  console.log(`status    : ${status}`)
  console.log(`duration  : ${durationMs}ms`)
  console.log(`query     : ${queryString}`)
  console.log("request   :")
  console.log(prettyBody(requestBody))
  console.log("response  :")
  console.log(prettyBody(responseBody))
  console.log(LOG_DIVIDER)
})

// ── Per-deployment domain routing ───────────────────────────────────
// Requests arriving on a deployment subdomain (e.g. qwen3-ab12cd34.llmpanel.local)
// are transparently rewritten into the OpenAI-compatible gateway pipeline, which
// already enforces API-key auth, ownership checks, and request logging.
// Requires a wildcard DNS record (*.BASE_DOMAIN) pointing at this API host.

// Public OpenAI/vLLM-style paths → deployment-scoped gateway paths. vLLM's
// utility endpoints live at the root, so both spellings are accepted.
const DEPLOYMENT_PATH_REWRITES: Record<string, string> = {
  "/v1/chat/completions": "chat/completions",
  "/v1/completions": "completions",
  "/v1/embeddings": "embeddings",
  "/v1/images/generations": "images/generations",
  "/v1/models": "models",
  "/v1/tokenize": "tokenize",
  "/tokenize": "tokenize",
  "/v1/detokenize": "detokenize",
  "/detokenize": "detokenize",
  "/v1/health": "health",
  "/health": "health",
  "/v1/metrics": "metrics",
  "/metrics": "metrics",
}

app.use("*", async (c, next) => {
  const host = (c.req.header("host") ?? "").split(":")[0].toLowerCase()
  if (!isDeploymentDomain(host)) return next()

  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.domain, host),
  })
  if (!deployment) {
    return c.json({ error: { message: "Unknown deployment domain" } }, 404)
  }

  // Map the public path onto an internal, deployment-scoped gateway path.
  const url = new URL(c.req.url)
  const mapped = DEPLOYMENT_PATH_REWRITES[url.pathname]
  let path: string
  if (mapped) {
    path = `/deployments/${deployment.id}/${mapped}`
  } else if (url.pathname.startsWith("/v1/")) {
    path = url.pathname.slice(3) // "/v1/models/x" -> "/models/x"
  } else {
    return c.json({ error: { message: "Not found on deployment domain" } }, 404)
  }

  // gatewayRoute's internal routes are rooted at "/" (it's mounted at /v1 in the
  // main app), so we call it directly with the rewritten path.
  const rewritten = new Request(`${url.origin}${path}${url.search}`, c.req.raw)
  return gatewayRoute.fetch(rewritten)
})

// Better Auth handles all /api/auth/* automatically
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw)
})

// Public routes (no session required)
app.route("/api/v1/setup", setupRoute)
app.route("/api/v1/waitlist", waitlistRoute)

// API routes (session protected)
app.route("/api/v1/models", modelsRoute)
app.route("/api/v1/deployments", deploymentsRoute)
app.route("/api/v1/providers", providersRoute)
app.route("/api/v1/api-keys", apiKeysRoute)
app.route("/api/v1/metrics", metricsRoute)
app.route("/api/v1/analytics", analyticsRoute)
app.route("/api/v1/admin", adminRoute)
app.route("/api/v1/system", systemRoute)
app.route("/api/v1/alerts", alertsRoute)
app.route("/api/v1/backups", backupRoute)
app.route("/api/v1/spendings", spendingsRoute)
app.route("/api/v1/billing", billingRoute)

// Public: serve generated image files (no auth — random UUID filenames)
app.route("/api/v1/images", imagesRoute)

// Gateway routes (API key protected — OpenAI compatible)
app.route("/v1", gatewayRoute)

// Unauthenticated liveness probe — used by the Docker healthcheck and install.sh.
app.get("/health", (c) => c.json({ status: "ok" }))

app.notFound((c) => c.json({ error: "Route not found" }, 404))

const PORT = Number(process.env.PORT ?? 8000)

async function bootstrap() {
  // Preferred key source: the KMS worker. The key is fetched once and held in
  // memory only — it never touches this host's disk or .env.
  if (env.KMS_URL) {
    if (!env.KMS_TOKEN) {
      throw new Error("KMS_URL is set but KMS_TOKEN is missing")
    }
    setKeyMaterial(await fetchKmsKeyMaterial(env.KMS_URL, env.KMS_TOKEN))
    console.log("Encryption key loaded from KMS")
  }

  // Refuse to boot with weak or missing key material — the legacy code
  // silently space-padded short keys into a guessable AES key. Dev may run
  // without a key until a credential is actually stored.
  if (env.NODE_ENV === "production" || hasKeyMaterial()) {
    assertEncryptionKey()
  }

  // Set once here instead of threading a parameter through every
  // createProvider() call site.
  setRunPodApiVersion(env.RUNPOD_API_VERSION)

  // Must run before anything touches the database — on a fresh install the
  // schema does not exist yet.
  await runMigrations()
  console.log("Database schema up to date")

  // One-time upgrade of pre-v2 ciphertexts (HKDF key + row-bound AAD).
  await migrateLegacyCredentials()

  const { seeded, skipped } = await seedModels()
  console.log(`Models: ${seeded} seeded, ${skipped} already existed`)

  // Start all previously active channel connections
  void channelManager.startAllActive()

  // Start sampling GPU metrics for running deployments
  metricsCollector.start()

  // Keep DB deployment status in sync with the provider's live view
  statusReconciler.start()

  // Record burn-rate history for the spendings dashboard
  spendSnapshotCollector.start()

  // Keep metered usage in step with each workspace's deployment count.
  // No-op unless DEPLOYMENT_MODE=cloud.
  startUsageReporting()

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`LLMPanel API running at http://localhost:${PORT}`)
  })
}

// Graceful shutdown — disconnect all channel adapters
function shutdown() {
  console.log("Shutting down — disconnecting channel adapters...")
  metricsCollector.stop()
  statusReconciler.stop()
  spendSnapshotCollector.stop()
  void channelManager.stopAll().finally(() => {
    process.exit(0)
  })
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

bootstrap().catch((err: unknown) => {
  console.error("Failed to start LLMPanel API:", err)
  process.exit(1)
})

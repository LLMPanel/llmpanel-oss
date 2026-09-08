# 05 — API Routes & Controllers

## Route Map

```
Public
└── /api/auth/**                    Better Auth (auto)

Session Protected
├── GET    /api/v1/models
├── GET    /api/v1/models/:id
├── GET    /api/v1/models/:id/compatibility
├── GET    /api/v1/providers
├── POST   /api/v1/providers
├── GET    /api/v1/providers/:id
├── PUT    /api/v1/providers/:id
├── DELETE /api/v1/providers/:id
├── POST   /api/v1/providers/:id/verify
├── GET    /api/v1/providers/:id/gpus
├── GET    /api/v1/deployments
├── POST   /api/v1/deployments         ← main deploy action
├── GET    /api/v1/deployments/:id
├── DELETE /api/v1/deployments/:id     ← stop + destroy
├── POST   /api/v1/deployments/:id/stop
├── POST   /api/v1/deployments/:id/restart
├── GET    /api/v1/deployments/:id/logs    (SSE)
├── GET    /api/v1/deployments/:id/status  (SSE)
├── GET    /api/v1/metrics/deployments/:id
├── GET    /api/v1/api-keys
├── POST   /api/v1/api-keys
├── PUT    /api/v1/api-keys/:id
├── DELETE /api/v1/api-keys/:id
├── GET    /api/v1/api-keys/:id/usage
├── GET    /api/v1/analytics/overview
├── GET    /api/v1/analytics/requests
└── GET    /api/v1/analytics/usage

Admin Only
├── GET/POST       /api/v1/admin/models
├── PUT/DELETE     /api/v1/admin/models/:id
└── GET            /api/v1/admin/system

API Key Protected (OpenAI compatible)
├── GET    /v1/models
├── POST   /v1/chat/completions
└── POST   /v1/deployments/:id/chat/completions
```

## apps/api/src/routes/index.ts

```typescript
import type { Hono } from "hono"
import { modelsRoute } from "./models.route"
import { deploymentsRoute } from "./deployments.route"
import { providersRoute } from "./providers.route"
import { apiKeysRoute } from "./api-keys.route"
import { metricsRoute } from "./metrics.route"
import { analyticsRoute } from "./analytics.route"
import { gatewayRoute } from "./gateway.route"
import { adminRoute } from "./admin.route"

export function registerRoutes(app: Hono) {
  app.route("/api/v1/models", modelsRoute)
  app.route("/api/v1/deployments", deploymentsRoute)
  app.route("/api/v1/providers", providersRoute)
  app.route("/api/v1/api-keys", apiKeysRoute)
  app.route("/api/v1/metrics", metricsRoute)
  app.route("/api/v1/analytics", analyticsRoute)
  app.route("/api/v1/admin", adminRoute)
  app.route("/v1", gatewayRoute)
}
```

## apps/api/src/routes/models.route.ts

```typescript
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { getModels, getModel, checkCompatibility } from "../controllers/models.controller"

export const modelsRoute = new Hono()
  .use(sessionAuth)
  .get("/", getModels)
  .get("/:id", getModel)
  .get("/:id/compatibility", checkCompatibility)
```

## apps/api/src/routes/providers.route.ts

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getProviders, getProvider, createProviderConnection,
  updateProvider, deleteProvider, verifyProvider, getProviderGPUs,
} from "../controllers/providers.controller"

const CreateProviderSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["local", "runpod", "vastai"]),
  apiKey: z.string().optional(),
})

const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().optional(),
})

export const providersRoute = new Hono()
  .use(sessionAuth)
  .get("/", getProviders)
  .post("/", zValidator("json", CreateProviderSchema), createProviderConnection)
  .get("/:id", getProvider)
  .put("/:id", zValidator("json", UpdateProviderSchema), updateProvider)
  .delete("/:id", deleteProvider)
  .post("/:id/verify", verifyProvider)
  .get("/:id/gpus", getProviderGPUs)
```

## apps/api/src/routes/deployments.route.ts

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  createDeployment, getDeployments, getDeployment,
  stopDeployment, restartDeployment, pauseDeployment,
} from "../controllers/deployments.controller"
import { db } from "../lib/db"
import { deployments } from "@llmpanel/db/schema"
import { and, eq } from "drizzle-orm"
import { createProvider } from "@llmpanel/providers"
import { decrypt } from "../services/encryption.service"

const DeployInputSchema = z.object({
  modelId: z.string(),
  providerId: z.string(),
  gpuType: z.string(),
  quantization: z.enum(["fp16", "int8", "int4", "gguf"]),
  inferenceEngine: z.enum(["vllm", "sglang"]).default("vllm"),
  envVars: z.record(z.string()).optional(),
})

export const deploymentsRoute = new Hono()
  .use(sessionAuth)
  .get("/", getDeployments)
  .post("/", zValidator("json", DeployInputSchema), createDeployment)
  .get("/:id", getDeployment)
  .delete("/:id", stopDeployment)
  .post("/:id/stop", pauseDeployment)
  .post("/:id/restart", restartDeployment)

  // SSE: live status updates
  .get("/:id/status", async (c) => {
    const deploymentId = c.req.param("id")

    return streamSSE(c, async (stream) => {
      const sendUpdate = async () => {
        const dep = await db.query.deployments.findFirst({
          where: eq(deployments.id, deploymentId),
        })
        if (!dep) { await stream.close(); return true }

        await stream.writeSSE({
          data: JSON.stringify({
            status: dep.status,
            progress: dep.progress,
            message: dep.statusMessage,
            endpoint: dep.endpoint,
          }),
        })

        return ["running", "failed", "stopped"].includes(dep.status)
      }

      if (await sendUpdate()) return

      const interval = setInterval(async () => {
        const done = await sendUpdate()
        if (done) { clearInterval(interval); await stream.close() }
      }, 1500)

      c.req.raw.signal.addEventListener("abort", () => clearInterval(interval))
    })
  })

  // SSE: container logs
  .get("/:id/logs", async (c) => {
    const user = c.get("user")
    const id = c.req.param("id")

    return streamSSE(c, async (stream) => {
      const dep = await db.query.deployments.findFirst({
        where: and(eq(deployments.id, id), eq(deployments.userId, user.id)),
        with: { providerConnection: true },
      })

      if (!dep?.externalId) {
        await stream.writeSSE({ data: "No container running" })
        return
      }

      const apiKey = dep.providerConnection?.encryptedApiKey
        ? await decrypt(dep.providerConnection.encryptedApiKey)
        : undefined

      const provider = createProvider(dep.providerType as any, apiKey)

      for await (const log of provider.streamLogs(dep.externalId)) {
        await stream.writeSSE({ data: log })
      }
    })
  })
```

## apps/api/src/routes/api-keys.route.ts

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getApiKeys, createApiKey, updateApiKey,
  deleteApiKey, getApiKeyUsage,
} from "../controllers/api-keys.controller"

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  deploymentId: z.string().optional(),
  scopes: z.array(z.string()).default(["chat"]),
  rpmLimit: z.number().optional(),
  tpmLimit: z.number().optional(),
  dailyLimit: z.number().optional(),
  expiresAt: z.string().datetime().optional(),
})

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rpmLimit: z.number().nullable().optional(),
  tpmLimit: z.number().nullable().optional(),
  dailyLimit: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const apiKeysRoute = new Hono()
  .use(sessionAuth)
  .get("/", getApiKeys)
  .post("/", zValidator("json", CreateApiKeySchema), createApiKey)
  .put("/:id", zValidator("json", UpdateApiKeySchema), updateApiKey)
  .delete("/:id", deleteApiKey)
  .get("/:id/usage", getApiKeyUsage)
```

## apps/api/src/routes/metrics.route.ts

```typescript
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { getDeploymentMetrics } from "../controllers/metrics.controller"

export const metricsRoute = new Hono()
  .use(sessionAuth)
  .get("/deployments/:id", getDeploymentMetrics)
```

## apps/api/src/routes/analytics.route.ts

```typescript
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getAnalyticsOverview,
  getAnalyticsRequests,
  getAnalyticsUsage,
} from "../controllers/metrics.controller"

export const analyticsRoute = new Hono()
  .use(sessionAuth)
  .get("/overview", getAnalyticsOverview)
  .get("/requests", getAnalyticsRequests)
  .get("/usage", getAnalyticsUsage)
```

## apps/api/src/routes/gateway.route.ts

```typescript
import { Hono } from "hono"
import { apiKeyAuth } from "../middlewares/api-key-auth.middleware"
import { apiKeyRateLimit, dailyLimitCheck } from "../middlewares/rate-limit.middleware"
import { db } from "../lib/db"
import { deployments, requestLogs } from "@llmpanel/db/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

export const gatewayRoute = new Hono()
  .use(apiKeyAuth)
  .use(apiKeyRateLimit)
  .use(dailyLimitCheck)

  .get("/models", async (c) => {
    const apiKey = c.get("apiKey")
    const userDeployments = await db.query.deployments.findMany({
      where: eq(deployments.userId, apiKey.userId),
      with: { model: true },
    })
    return c.json({
      object: "list",
      data: userDeployments
        .filter(d => d.status === "running")
        .map(d => ({
          id: d.model.slug,
          object: "model",
          created: Math.floor(d.createdAt.getTime() / 1000),
          owned_by: "llmpanel",
        })),
    })
  })

  .post("/deployments/:deploymentId/chat/completions", async (c) => {
    const deploymentId = c.req.param("deploymentId")
    const body = await c.req.json()
    const apiKey = c.get("apiKey")
    const start = Date.now()

    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
    })

    if (!deployment || deployment.status !== "running" || !deployment.endpoint) {
      return c.json({ error: { message: "Deployment not available" } }, 503)
    }

    try {
      const vllmResponse = await fetch(
        `${deployment.endpoint}/v1/chat/completions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      )

      const latencyMs = Date.now() - start

      if (body.stream) {
        logRequest(apiKey.id, deployment.id, apiKey.userId, c, vllmResponse.status, latencyMs, true).catch(console.error)
        return new Response(vllmResponse.body, {
          status: vllmResponse.status,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        })
      }

      const data = await vllmResponse.json()
      await logRequest(apiKey.id, deployment.id, apiKey.userId, c, vllmResponse.status, latencyMs, false, data.usage)
      return c.json(data, vllmResponse.status as any)

    } catch {
      return c.json({ error: { message: "Failed to reach inference engine" } }, 503)
    }
  })

  .post("/chat/completions", async (c) => {
    const apiKey = c.get("apiKey")
    if (!apiKey.deploymentId) {
      return c.json({ error: { message: "No deployment associated with this API key" } }, 400)
    }
    // forward to specific deployment handler
    const newUrl = c.req.url.replace("/chat/completions", `/deployments/${apiKey.deploymentId}/chat/completions`)
    return fetch(new Request(newUrl, c.req.raw))
  })

async function logRequest(
  apiKeyId: string, deploymentId: string, userId: string,
  c: any, statusCode: number, latencyMs: number, isStreaming: boolean,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
) {
  await db.insert(requestLogs).values({
    id: randomUUID(),
    apiKeyId, deploymentId, userId,
    method: c.req.method,
    path: c.req.path,
    ipAddress: c.req.header("x-forwarded-for") ?? "unknown",
    statusCode, latencyMs, isStreaming,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    createdAt: new Date(),
  })
}
```

## apps/api/src/services/encryption.service.ts

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_KEY not set")
  return Buffer.from(key.slice(0, 32).padEnd(32), "utf8")
}

export async function encrypt(plaintext: string): Promise<string> {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export async function decrypt(ciphertext: string): Promise<string> {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final("utf8")
}
```

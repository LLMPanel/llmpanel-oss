import { Hono, type Context } from "hono"
import { and, eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import { agents, deployments, requestLogs } from "@llmpanel/db/schema"
import { apiKeyAuth, type GatewayScope } from "../middlewares/api-key-auth.middleware"
import { decrypt, aadFor } from "../services/encryption.service"
import { generateImages, type ImageGenBody } from "../services/image-gen.service"
import {
  loadAgentKnowledgeCollections,
  resolveActiveTools,
  runAgentLoop,
  toChatCompletionJson,
  toChatCompletionStream,
} from "../services/agent-runtime.service"

type GatewayApiKey = {
  id: string
  userId: string
  /** Resolved by apiKeyAuth — gateway usage is logged against this workspace. */
  workspaceId: string
  deploymentId: string | null
  agentId: string | null
}

type ChatBody = {
  model?: string
  messages?: Array<{ role: string; content: unknown }>
  stream?: boolean
} & Record<string, unknown>

type CompletionUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

type ChatCompletionResponse = {
  usage?: CompletionUsage
} & Record<string, unknown>

function getAgentCompletionUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (normalized.endsWith("/chat/completions")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`
  return `${normalized}/v1/chat/completions`
}

// Apply the agent's sampling defaults without overriding explicit client values.
function withAgentSampling(
  body: ChatBody,
  agent: { temperature: number | null; maxTokens: number | null }
): ChatBody {
  const result = { ...body }
  if (result.temperature === undefined && agent.temperature != null) {
    result.temperature = agent.temperature
  }
  if (result.max_tokens === undefined && agent.maxTokens != null) {
    result.max_tokens = agent.maxTokens
  }
  return result
}

function withSystemPrompt(body: ChatBody, systemPrompt: string | null): ChatBody {
  if (!systemPrompt || !systemPrompt.trim()) return body

  const messages = Array.isArray(body.messages) ? body.messages : []
  const hasSystem = messages.some((m) => m.role === "system")
  if (hasSystem) return body

  return {
    ...body,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  }
}

// ── Body capture helpers ─────────────────────────────────────────────

const MAX_LOGGED_BODY_CHARS = 100_000

function truncateBody(value: string | null | undefined): string | null {
  if (value == null) return null
  if (value.length <= MAX_LOGGED_BODY_CHARS) return value
  return `${value.slice(0, MAX_LOGGED_BODY_CHARS)}…[truncated ${value.length - MAX_LOGGED_BODY_CHARS} chars]`
}

// Rough fallback when the provider doesn't report usage: ~4 chars per token.
function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimateUsage(requestBody: ChatBody, completionText: string): CompletionUsage {
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : []
  let promptText = messages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")))
    .join("\n")
  // Legacy /v1/completions carries a bare prompt instead of messages.
  if (!promptText && typeof requestBody.prompt === "string") {
    promptText = requestBody.prompt
  }
  const promptTokens = estimateTokensFromText(promptText)
  const completionTokens = estimateTokensFromText(completionText)
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  }
}

// Ask the provider to append a usage chunk to the stream (vLLM/OpenAI-compatible).
function withStreamUsage(body: ChatBody): ChatBody {
  if (!body.stream) return body
  const existing = (body.stream_options ?? {}) as Record<string, unknown>
  return { ...body, stream_options: { ...existing, include_usage: true } }
}

type StreamCapture = {
  content: string
  usage: CompletionUsage | null
  model: string | null
  finishReason: string | null
}

// Consume one branch of a tee'd SSE stream, reassembling the assistant text
// and picking up the trailing usage chunk if the provider sends one.
async function captureStream(stream: ReadableStream<Uint8Array>): Promise<StreamCapture> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const capture: StreamCapture = { content: "", usage: null, model: null, finishReason: null }

  const consumeLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === "[DONE]") return
    try {
      const chunk = JSON.parse(payload) as {
        model?: string
        usage?: CompletionUsage | null
        choices?: Array<{ delta?: { content?: string | null }; text?: string | null; finish_reason?: string | null }>
      }
      if (chunk.model) capture.model = chunk.model
      if (chunk.usage) capture.usage = chunk.usage
      const choice = chunk.choices?.[0]
      if (choice?.delta?.content) capture.content += choice.delta.content
      // Legacy /v1/completions streams put the delta in `text` instead.
      else if (typeof choice?.text === "string") capture.content += choice.text
      if (choice?.finish_reason) capture.finishReason = choice.finish_reason
    } catch {
      // Partial or non-JSON chunk — skip it.
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) consumeLine(line)
    }
    consumeLine(buffer)
  } catch {
    // Upstream aborted mid-stream — log whatever was captured so far.
  }

  return capture
}

// ── Shared chat-completion proxy ─────────────────────────────────────
// Fetches the upstream provider, streams or buffers the response back to
// the client, and logs the full request/response (with token usage) either
// way. Streaming responses are tee'd: one branch goes to the client, the
// other is reassembled in the background for the log entry.

type ProxyChatParams = {
  c: Context
  apiKey: GatewayApiKey
  url: string
  payload: ChatBody
  headers?: Record<string, string>
  deploymentId: string | null
  model: string | null
  failureMessage: string
}

async function proxyChatCompletion(params: ProxyChatParams): Promise<Response> {
  const { c, apiKey, payload } = params
  const requestId = requestIdOf(c)
  const start = Date.now()
  const isStreaming = Boolean(payload.stream)
  const requestBody = truncateBody(JSON.stringify(payload))

  try {
    const upstreamResponse = await fetch(params.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...params.headers },
      body: JSON.stringify(withStreamUsage(payload)),
    })

    if (isStreaming && upstreamResponse.ok && upstreamResponse.body) {
      const [clientBranch, logBranch] = upstreamResponse.body.tee()

      void captureStream(logBranch).then((captured) => {
        const usage = captured.usage ?? estimateUsage(payload, captured.content)
        const responseBody = truncateBody(JSON.stringify({
          object: "chat.completion",
          model: captured.model ?? params.model,
          choices: [{
            message: { role: "assistant", content: captured.content },
            finish_reason: captured.finishReason,
          }],
          usage,
          _reassembled_from_stream: true,
        }))

        return logRequest({
          apiKey,
          c,
          requestId,
          deploymentId: params.deploymentId,
          model: captured.model ?? params.model,
          statusCode: upstreamResponse.status,
          latencyMs: Date.now() - start,
          isStreaming: true,
          usage,
          requestBody,
          responseBody,
        })
      })

      return new Response(clientBranch, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      })
    }

    // Non-streaming response — or an upstream error on a streaming request,
    // which providers return as a plain JSON body.
    const responseText = await upstreamResponse.text()
    let data: ChatCompletionResponse
    try {
      data = JSON.parse(responseText) as ChatCompletionResponse
    } catch {
      data = { error: { message: responseText || "Invalid upstream response" } }
    }

    await logRequest({
      apiKey,
      c,
      requestId,
      deploymentId: params.deploymentId,
      model: params.model,
      statusCode: upstreamResponse.status,
      latencyMs: Date.now() - start,
      isStreaming,
      usage: data.usage,
      requestBody,
      responseBody: truncateBody(responseText),
    })

    return c.json(data as never, upstreamResponse.status as never)
  } catch {
    void logRequest({
      apiKey,
      c,
      requestId,
      deploymentId: params.deploymentId,
      model: params.model,
      statusCode: 503,
      latencyMs: Date.now() - start,
      isStreaming,
      requestBody,
      responseBody: JSON.stringify({ error: { message: params.failureMessage } }),
    })
    return c.json({ error: { message: params.failureMessage } }, 503)
  }
}

type GatewayEnv = { Variables: { apiKey: GatewayApiKey; apiKeyScopes: string[]; requestId: string } }

// Caller correlation ids are stored and echoed verbatim — cap them so a hostile
// client can't stuff megabytes into a response header or the request log.
const MAX_CLIENT_REQUEST_ID_CHARS = 256

function clientRequestIdOf(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const value = c.req.header("x-client-request-id")
  if (!value) return null
  return value.slice(0, MAX_CLIENT_REQUEST_ID_CHARS)
}

// The middleware below stores the id under a typed variable; helpers that only
// see a bare Context read it back through this narrowing accessor.
function requestIdOf(c: Context): string | undefined {
  const value = c.get("requestId") as unknown
  return typeof value === "string" ? value : undefined
}

// Keys carry scopes (see GATEWAY_SCOPES); each endpoint family requires its own
// scope — "chat" for completions/tokenizer, "images" for image generation,
// "embeddings" for embeddings. Keys created before scopes were enforced default
// to ["chat"]. The GatewayScope parameter type keeps a typo'd scope name (which
// would silently 403 every caller) from compiling.
function requireScope(c: Context, scope: GatewayScope): Response | null {
  const scopes = (c.get("apiKeyScopes") as string[] | undefined) ?? ["chat"]
  if (!scopes.includes(scope)) {
    return c.json({
      error: {
        message: `This API key does not have the "${scope}" scope. Create a key with the "${scope}" scope to call this endpoint.`,
        type: "insufficient_scope",
      },
    }, 403)
  }
  return null
}

export const gatewayRoute: Hono<GatewayEnv> = new Hono<GatewayEnv>()

  // OpenAI-style request correlation: every gateway response carries an
  // x-request-id (which is also the request_logs row id), and a caller-supplied
  // X-Client-Request-Id is logged and echoed back. Runs before auth so even
  // rejected requests are correlatable.
  .use(async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set("requestId", requestId)
    await next()
    c.res.headers.set("x-request-id", requestId)
    const clientRequestId = clientRequestIdOf(c)
    if (clientRequestId) c.res.headers.set("x-client-request-id", clientRequestId)
  })

  .use(apiKeyAuth)

  // Agent-scoped keys can only call their own agent's endpoint.
  .use(async (c, next) => {
    const apiKey = c.get("apiKey") as GatewayApiKey
    if (apiKey.agentId && !c.req.path.includes(`/agents/${apiKey.agentId}/`)) {
      return c.json({
        error: {
          message: "This API key is scoped to a single agent. Use its /v1/agents/<agentId>/chat/completions endpoint.",
          type: "agent_scoped_key",
        },
      }, 403)
    }
    await next()
  })

  .get("/models", async (c) => {
    const apiKey = c.get("apiKey") as GatewayApiKey

    const workspaceDeployments = await db.query.deployments.findMany({
      where: eq(deployments.workspaceId, apiKey.workspaceId),
    })

    return c.json({
      object: "list",
      data: workspaceDeployments
        .filter((d) => d.status === "running")
        .map((d) => toModelObject(d)),
    })
  })

  .get("/models/:modelId{.+}", async (c) => {
    const apiKey = c.get("apiKey") as GatewayApiKey
    const modelId = c.req.param("modelId")

    const workspaceDeployments = await db.query.deployments.findMany({
      where: eq(deployments.workspaceId, apiKey.workspaceId),
    })
    const match = workspaceDeployments.find(
      (d) => d.status === "running" && ((d.huggingfaceId ?? d.id) === modelId || d.id === modelId)
    )

    if (!match) {
      return c.json({ error: { message: `Model "${modelId}" not found`, type: "invalid_request_error" } }, 404)
    }
    return c.json(toModelObject(match))
  })

  .get("/deployments/:deploymentId/models", async (c) => {
    const resolved = await resolveDeploymentAccess(c, c.req.param("deploymentId"))
    if ("error" in resolved) return resolved.error
    return c.json({ object: "list", data: [toModelObject(resolved.deployment)] })
  })

  .post("/deployments/:deploymentId/chat/completions", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    const deploymentId = c.req.param("deploymentId")
    return handleDeploymentChatCompletions(c, deploymentId)
  })

  // ── Image generation (text-to-image) ────────────────────────────────
  .post("/deployments/:deploymentId/images/generations", async (c) => {
    const denied = requireScope(c, "images")
    if (denied) return denied
    const deploymentId = c.req.param("deploymentId")
    return handleImageGenerations(c, deploymentId)
  })

  .post("/images/generations", async (c) => {
    const denied = requireScope(c, "images")
    if (denied) return denied
    const deploymentId = await resolveBareRouteDeploymentId(c)
    if (typeof deploymentId !== "string") return deploymentId
    return handleImageGenerations(c, deploymentId)
  })

  .post("/chat/completions", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    const deploymentId = await resolveBareRouteDeploymentId(c)
    if (typeof deploymentId !== "string") return deploymentId

    return handleDeploymentChatCompletions(c, deploymentId)
  })

  // ── Legacy text completions ─────────────────────────────────────────
  .post("/deployments/:deploymentId/completions", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    return handleDeploymentProxyPost(c, c.req.param("deploymentId"), "/v1/completions")
  })

  .post("/completions", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    const deploymentId = await resolveBareRouteDeploymentId(c)
    if (typeof deploymentId !== "string") return deploymentId
    return handleDeploymentProxyPost(c, deploymentId, "/v1/completions")
  })

  // ── Embeddings ──────────────────────────────────────────────────────
  .post("/deployments/:deploymentId/embeddings", async (c) => {
    const denied = requireScope(c, "embeddings")
    if (denied) return denied
    return handleDeploymentProxyPost(c, c.req.param("deploymentId"), "/v1/embeddings")
  })

  .post("/embeddings", async (c) => {
    const denied = requireScope(c, "embeddings")
    if (denied) return denied
    const deploymentId = await resolveBareRouteDeploymentId(c)
    if (typeof deploymentId !== "string") return deploymentId
    return handleDeploymentProxyPost(c, deploymentId, "/v1/embeddings")
  })

  // ── vLLM utility endpoints (tokenizer + server introspection) ───────
  .post("/deployments/:deploymentId/tokenize", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    return handleDeploymentProxyPost(c, c.req.param("deploymentId"), "/tokenize")
  })

  .post("/deployments/:deploymentId/detokenize", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    return handleDeploymentProxyPost(c, c.req.param("deploymentId"), "/detokenize")
  })

  // Read-only introspection, deliberately scope-free (same as GET /models):
  // scopes gate *which model family* a key may invoke, and a liveness probe or
  // a Prometheus scrape belongs to none of them — an images-only key must still
  // be able to health-check its own deployment. Access is not unguarded:
  // resolveDeploymentAccess still enforces API-key auth, workspace ownership and
  // the key→deployment binding, so this only ever exposes aggregate telemetry
  // for a deployment the caller's own workspace already owns.
  .get("/deployments/:deploymentId/health", async (c) => {
    return handleDeploymentProxyGet(c, c.req.param("deploymentId"), "/health")
  })

  .get("/deployments/:deploymentId/metrics", async (c) => {
    return handleDeploymentProxyGet(c, c.req.param("deploymentId"), "/metrics")
  })

  .post("/agents/:agentId/chat/completions", async (c) => {
    const denied = requireScope(c, "chat")
    if (denied) return denied
    const apiKey = c.get("apiKey") as GatewayApiKey
    const agentId = c.req.param("agentId")

    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.isActive, true)),
    })

    if (!agent || agent.workspaceId !== apiKey.workspaceId) {
      return c.json({ error: { message: "Agent not found" } }, 404)
    }

    if (apiKey.agentId && apiKey.agentId !== agent.id) {
      return c.json({ error: { message: "API key cannot access this agent" } }, 403)
    }

    if (apiKey.deploymentId && apiKey.deploymentId !== agent.deploymentId) {
      return c.json({ error: { message: "API key cannot access this agent" } }, 403)
    }

    const body = (await c.req.json()) as ChatBody
    const augmentedBody = withAgentSampling(withSystemPrompt(body, agent.systemPrompt), agent)

    // Resolve the upstream target (local deployment vs external provider).
    let target: { url: string; headers?: Record<string, string> }
    let defaultModel: string | null
    let logDeploymentId: string | null
    let failureMessage: string

    if (agent.sourceType === "deployment") {
      const targetDeploymentId = agent.targetDeploymentId ?? agent.deploymentId

      if (apiKey.deploymentId && apiKey.deploymentId !== targetDeploymentId) {
        return c.json({ error: { message: "API key cannot access this deployment" } }, 403)
      }

      const deployment = await db.query.deployments.findFirst({
        where: eq(deployments.id, targetDeploymentId),
      })

      if (!deployment || deployment.workspaceId !== apiKey.workspaceId || deployment.status !== "running") {
        return c.json({ error: { message: "Deployment not found or not running" } }, 404)
      }

      if (!deployment.endpoint) {
        return c.json({ error: { message: "Deployment endpoint not available" } }, 503)
      }

      target = { url: `${deployment.endpoint}/v1/chat/completions` }
      defaultModel = deployment.huggingfaceId
      logDeploymentId = deployment.id
      failureMessage = "Failed to reach inference engine"
    } else {
      if (!agent.externalBaseUrl || !agent.externalModel) {
        return c.json({ error: { message: "Agent external provider is not configured" } }, 400)
      }
      if (!agent.encryptedExternalApiKey) {
        return c.json({ error: { message: "Agent external API key missing" } }, 400)
      }

      let externalApiKey: string
      try {
        externalApiKey = await decrypt(agent.encryptedExternalApiKey, aadFor.agentExternalApiKey(agent.id))
      } catch {
        return c.json({ error: { message: "Failed to reach external provider" } }, 503)
      }

      target = {
        url: getAgentCompletionUrl(agent.externalBaseUrl),
        headers: { Authorization: `Bearer ${externalApiKey}` },
      }
      defaultModel = agent.externalModel
      logDeploymentId = agent.deploymentId
      failureMessage = "Failed to reach external provider"
    }

    // ── Agentic runtime path: server-side tool loop ──────────────────
    const knowledge = await loadAgentKnowledgeCollections(agent.id)
    if (resolveActiveTools(agent, knowledge).length > 0) {
      const start = Date.now()
      const isStreaming = Boolean(augmentedBody.stream)
      const requestBody = truncateBody(JSON.stringify(augmentedBody))

      let result
      try {
        result = await runAgentLoop({ agent, target, body: augmentedBody, defaultModel, knowledge })
      } catch {
        void logRequest({
          apiKey, c, requestId: requestIdOf(c), deploymentId: logDeploymentId, model: defaultModel,
          statusCode: 503, latencyMs: Date.now() - start, isStreaming,
          requestBody, responseBody: JSON.stringify({ error: { message: failureMessage } }),
        })
        return c.json({ error: { message: failureMessage } }, 503)
      }

      const responseJson = result.ok ? toChatCompletionJson(result, agent.id) : result.errorBody
      void logRequest({
        apiKey, c, requestId: requestIdOf(c), deploymentId: logDeploymentId,
        model: result.model ?? defaultModel,
        statusCode: result.status,
        latencyMs: Date.now() - start,
        isStreaming,
        usage: result.usage,
        requestBody,
        responseBody: truncateBody(JSON.stringify({
          ...(responseJson as Record<string, unknown>),
          _agent_tool_steps: result.steps.map((s) => ({ tool: s.tool, arguments: s.arguments, durationMs: s.durationMs })),
        })),
      })

      if (!result.ok) return c.json(result.errorBody as never, result.status as never)

      if (isStreaming) {
        return new Response(toChatCompletionStream(result, agent.id), {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        })
      }
      return c.json(responseJson as never, 200)
    }

    // ── Plain proxy path (no tools configured) ───────────────────────
    return proxyChatCompletion({
      c,
      apiKey,
      url: target.url,
      payload: { ...augmentedBody, model: defaultModel ?? augmentedBody.model ?? undefined },
      headers: target.headers,
      deploymentId: logDeploymentId,
      model: defaultModel ?? augmentedBody.model,
      failureMessage,
    })
  })

type ResolvedDeployment = typeof deployments.$inferSelect & { endpoint: string }

// Ownership + liveness checks shared by every deployment-scoped gateway route.
async function resolveDeploymentAccess(
  c: Context,
  deploymentId: string
): Promise<{ deployment: ResolvedDeployment } | { error: Response }> {
  const apiKey = c.get("apiKey") as GatewayApiKey

  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })

  if (!deployment || deployment.status !== "running") {
    return { error: c.json({ error: { message: "Deployment not found or not running" } }, 404) }
  }

  if (deployment.workspaceId !== apiKey.workspaceId) {
    return { error: c.json({ error: { message: "Deployment not found" } }, 404) }
  }

  if (apiKey.deploymentId && apiKey.deploymentId !== deploymentId) {
    return { error: c.json({ error: { message: "API key cannot access this deployment" } }, 403) }
  }

  if (!deployment.endpoint) {
    return { error: c.json({ error: { message: "Deployment endpoint not available" } }, 503) }
  }

  return { deployment: deployment as ResolvedDeployment }
}

// Bare routes (no deployment id in the path) resolve the target the way
// api.openai.com does: a deployment-scoped key routes to its own deployment,
// and a workspace-wide key routes by the request body's `model` field — the
// newest running deployment serving that model wins. This is what lets any
// key work in third-party "OpenAI-compatible" integrations.
async function resolveBareRouteDeploymentId(c: Context): Promise<string | Response> {
  const apiKey = c.get("apiKey") as GatewayApiKey
  if (apiKey.deploymentId) return apiKey.deploymentId

  let model: unknown
  try {
    model = ((await c.req.json()) as ChatBody).model
  } catch {
    model = undefined
  }
  if (typeof model !== "string" || !model) {
    return c.json({
      error: {
        message: "This API key is not scoped to a deployment. Pass a `model` in the request body so the gateway can route the request.",
        type: "invalid_request_error",
      },
    }, 400)
  }

  const workspaceDeployments = await db.query.deployments.findMany({
    where: eq(deployments.workspaceId, apiKey.workspaceId),
  })
  const match = workspaceDeployments
    .filter((d) => d.status === "running" && ((d.huggingfaceId ?? d.id) === model || d.id === model))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  if (!match) {
    return c.json({
      error: {
        message: `Model "${model}" not found. Use GET /v1/models to list the models available to this key.`,
        type: "invalid_request_error",
        code: "model_not_found",
      },
    }, 404)
  }
  return match.id
}

function toModelObject(d: { id: string; huggingfaceId: string | null; createdAt: Date }) {
  return {
    id: d.huggingfaceId ?? d.id,
    object: "model" as const,
    created: Math.floor(d.createdAt.getTime() / 1000),
    owned_by: "llmpanel",
  }
}

async function handleDeploymentChatCompletions(c: Context, deploymentId: string) {
  return handleDeploymentProxyPost(c, deploymentId, "/v1/chat/completions")
}

// Forward a JSON POST (chat/text completions, embeddings, tokenize, …) to the
// deployment's inference server and log it — streaming responses included.
async function handleDeploymentProxyPost(c: Context, deploymentId: string, upstreamPath: string) {
  const body = (await c.req.json()) as ChatBody
  const apiKey = c.get("apiKey") as GatewayApiKey

  const resolved = await resolveDeploymentAccess(c, deploymentId)
  if ("error" in resolved) return resolved.error
  const { deployment } = resolved

  const payload: ChatBody = {
    ...body,
    model: body.model ?? deployment.huggingfaceId ?? undefined,
  }

  return proxyChatCompletion({
    c,
    apiKey,
    url: `${deployment.endpoint}${upstreamPath}`,
    payload,
    deploymentId: deployment.id,
    model: deployment.huggingfaceId ?? payload.model ?? null,
    failureMessage: "Failed to reach inference engine",
  })
}

// Forward a GET (health, metrics) to the inference server. Not written to
// request_logs — probes and scrapes would drown out real inference traffic.
async function handleDeploymentProxyGet(c: Context, deploymentId: string, upstreamPath: string) {
  const resolved = await resolveDeploymentAccess(c, deploymentId)
  if ("error" in resolved) return resolved.error
  const { deployment } = resolved

  try {
    const upstream = await fetch(`${deployment.endpoint}${upstreamPath}`)
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/plain" },
    })
  } catch {
    return c.json({ error: { message: "Failed to reach inference engine" } }, 503)
  }
}

async function handleImageGenerations(c: Context, deploymentId: string) {
  const body = (await c.req.json()) as ImageGenBody
  const apiKey = c.get("apiKey") as GatewayApiKey
  const start = Date.now()

  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })

  if (!deployment || deployment.status !== "running") {
    return c.json({ error: { message: "Deployment not found or not running" } }, 404)
  }

  if (deployment.workspaceId !== apiKey.workspaceId) {
    return c.json({ error: { message: "Deployment not found" } }, 404)
  }

  if (apiKey.deploymentId && apiKey.deploymentId !== deploymentId) {
    return c.json({ error: { message: "API key cannot access this deployment" } }, 403)
  }

  const result = await generateImages({
    deployment: {
      id: deployment.id,
      userId: deployment.userId,
      workspaceId: deployment.workspaceId,
      endpoint: deployment.endpoint,
      huggingfaceId: deployment.huggingfaceId,
    },
    body,
    apiKeyId: apiKey.id,
  })

  await logRequest({
    apiKey,
    deploymentId: deployment.id,
    model: deployment.huggingfaceId,
    c,
    requestId: requestIdOf(c),
    statusCode: result.status,
    latencyMs: Date.now() - start,
    isStreaming: false,
    requestBody: truncateBody(JSON.stringify(body)),
    responseBody: truncateBody(JSON.stringify(result.json)),
  })

  return c.json(result.json as never, result.status as never)
}

type LogRequestParams = {
  apiKey: GatewayApiKey
  deploymentId: string | null
  model: string | null
  c: {
    req: {
      method: string
      path: string
      header: (name: string) => string | undefined
    }
  }
  /** Gateway request id — becomes the row id so x-request-id matches the log. */
  requestId?: string
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  usage?: CompletionUsage
  requestBody?: string | null
  responseBody?: string | null
}

async function logRequest(params: LogRequestParams): Promise<void> {
  try {
    await db.insert(requestLogs).values({
      id: params.requestId ?? crypto.randomUUID(),
      clientRequestId: clientRequestIdOf(params.c),
      apiKeyId: params.apiKey.id,
      deploymentId: params.deploymentId,
      userId: params.apiKey.userId,
      workspaceId: params.apiKey.workspaceId,
      model: params.model,
      method: params.c.req.method,
      path: params.c.req.path,
      ipAddress: params.c.req.header("x-forwarded-for") ?? "unknown",
      userAgent: params.c.req.header("user-agent") ?? null,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      isStreaming: params.isStreaming,
      promptTokens: params.usage?.prompt_tokens,
      completionTokens: params.usage?.completion_tokens,
      totalTokens: params.usage?.total_tokens,
      requestBody: params.requestBody ?? null,
      responseBody: params.responseBody ?? null,
      createdAt: new Date(),
    })
  } catch (error) {
    console.error("[gateway] failed to write request log:", error)
  }
}

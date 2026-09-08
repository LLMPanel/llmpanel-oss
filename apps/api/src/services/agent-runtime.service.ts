// Server-side agentic loop: sends the agent's tool definitions with each
// upstream chat-completion call, executes returned tool_calls (currently
// knowledge_search across the agent's attached RAG collections), feeds
// results back, and repeats until the model produces a final answer or
// maxSteps is reached.
import { db } from "@llmpanel/db"
import { agents, agentCollections, deployments, ragCollections } from "@llmpanel/db/schema"
import { eq } from "drizzle-orm"
import { decrypt, aadFor } from "./encryption.service"
import { retrieveFromCollection } from "./rag.service"

export type AgentRow = typeof agents.$inferSelect
export type KnowledgeCollection = typeof ragCollections.$inferSelect

export type CompletionUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type RuntimeMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export type ChatBody = {
  model?: string
  messages?: Array<{ role: string; content: unknown }>
  stream?: boolean
  temperature?: number
  max_tokens?: number
  tools?: unknown
  tool_choice?: unknown
} & Record<string, unknown>

export type RuntimeStep = {
  type: "tool_call"
  tool: string
  arguments: string
  result: string
  durationMs: number
}

export type AgentRunResult = {
  ok: boolean
  status: number
  /** Final assistant message when ok */
  content: string
  model: string | null
  finishReason: string | null
  usage: CompletionUsage
  steps: RuntimeStep[]
  /** True when the upstream rejected tool definitions and we retried without them */
  toolsDegraded: boolean
  /** Upstream error body when not ok */
  errorBody: unknown
}

const AGENT_TOOL_NAMES = ["knowledge_search"] as const
type AgentToolName = (typeof AGENT_TOOL_NAMES)[number]

const MAX_TOOL_RESULT_CHARS = 8_000

export function parseAgentTools(agent: AgentRow): AgentToolName[] {
  try {
    const parsed = JSON.parse(agent.toolsEnabled) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is AgentToolName =>
      AGENT_TOOL_NAMES.includes(t as AgentToolName)
    )
  } catch {
    return []
  }
}

/** Active (non-deleted) RAG collections attached to an agent. */
export async function loadAgentKnowledgeCollections(
  agentId: string
): Promise<KnowledgeCollection[]> {
  const links = await db.query.agentCollections.findMany({
    where: eq(agentCollections.agentId, agentId),
    with: { collection: true },
  })
  return links
    .map((link) => link.collection)
    .filter((collection) => collection.isActive)
}

/** Tools the runtime can actually serve for this agent (config-complete). */
export function resolveActiveTools(
  agent: AgentRow,
  knowledge: KnowledgeCollection[]
): AgentToolName[] {
  return parseAgentTools(agent).filter((tool) => {
    if (tool === "knowledge_search") return knowledge.length > 0
    return false
  })
}

function buildToolDefinitions(tools: AgentToolName[]): unknown[] {
  return tools.map((tool) => {
    switch (tool) {
      case "knowledge_search":
        return {
          type: "function",
          function: {
            name: "knowledge_search",
            description:
              "Search the agent's attached knowledge base for passages relevant to a query. Use this whenever the user asks about topics the knowledge base may cover.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural-language search query",
                },
                top_k: {
                  type: "integer",
                  description: "Number of passages to return (1-10, default 5)",
                },
              },
              required: ["query"],
            },
          },
        }
    }
  })
}

// ── Tool execution ───────────────────────────────────────────────────

async function executeKnowledgeSearch(
  knowledge: KnowledgeCollection[],
  rawArgs: string
): Promise<string> {
  if (knowledge.length === 0) {
    return JSON.stringify({ error: "No knowledge base attached to this agent" })
  }

  let args: { query?: unknown; top_k?: unknown }
  try {
    args = JSON.parse(rawArgs) as { query?: unknown; top_k?: unknown }
  } catch {
    return JSON.stringify({ error: "Invalid tool arguments (expected JSON)" })
  }

  const query = typeof args.query === "string" ? args.query.trim() : ""
  if (!query) return JSON.stringify({ error: "query is required" })

  const topK = args.top_k !== undefined
    ? Math.min(Math.max(Number(args.top_k) || 5, 1), 10)
    : undefined

  // Search every attached collection concurrently and merge by score. A
  // failing collection degrades to a note instead of failing the whole tool.
  const failures: string[] = []
  const perCollection = await Promise.all(
    knowledge.map(async (collection) => {
      try {
        const results = await retrieveFromCollection(collection, query, {
          topK,
        })
        return results.map((r) => ({
          content: r.content,
          score: Number(r.score.toFixed(4)),
          documentId: r.documentId,
          collection: collection.name,
        }))
      } catch (error) {
        failures.push(
          `${collection.name}: ${error instanceof Error ? error.message : "search failed"}`
        )
        return []
      }
    })
  )

  const limit = topK ?? Math.max(...knowledge.map((c) => c.topK), 5)
  const merged = perCollection
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const payload = {
    query,
    results: merged,
    ...(failures.length > 0 ? { warnings: failures } : {}),
  }

  const text = JSON.stringify(payload)
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…"]}`
}

async function executeTool(
  knowledge: KnowledgeCollection[],
  call: ToolCall
): Promise<string> {
  try {
    switch (call.function.name) {
      case "knowledge_search":
        return await executeKnowledgeSearch(knowledge, call.function.arguments)
      default:
        return JSON.stringify({ error: `Unknown tool: ${call.function.name}` })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed"
    return JSON.stringify({ error: message })
  }
}

// ── Upstream call ────────────────────────────────────────────────────

type UpstreamTarget = {
  url: string
  headers?: Record<string, string>
}

type UpstreamChoice = {
  message?: {
    role?: string
    content?: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason?: string | null
}

type UpstreamResponse = {
  model?: string
  usage?: CompletionUsage
  choices?: UpstreamChoice[]
  error?: unknown
} & Record<string, unknown>

async function callUpstream(
  target: UpstreamTarget,
  payload: Record<string, unknown>
): Promise<{ status: number; body: UpstreamResponse | null; rawText: string }> {
  const res = await fetch(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...target.headers },
    body: JSON.stringify(payload),
  })
  const rawText = await res.text()
  let body: UpstreamResponse | null = null
  try {
    body = JSON.parse(rawText) as UpstreamResponse
  } catch {
    body = null
  }
  return { status: res.status, body, rawText }
}

function emptyUsage(): CompletionUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
}

function addUsage(total: CompletionUsage, delta?: CompletionUsage): void {
  if (!delta) return
  total.prompt_tokens += delta.prompt_tokens ?? 0
  total.completion_tokens += delta.completion_tokens ?? 0
  total.total_tokens += delta.total_tokens ?? 0
}

// Heuristic: upstream rejected the request because of tool definitions
// (model or engine without tool-calling support).
function looksLikeToolRejection(status: number, rawText: string): boolean {
  if (status !== 400) return false
  return /tool|function/i.test(rawText)
}

// ── Upstream target resolution ───────────────────────────────────────
// Ownership must already be verified by the caller (session or API key).

export type ResolvedTarget =
  | { ok: true; target: UpstreamTarget; defaultModel: string | null; deploymentId: string | null }
  | { ok: false; status: 400 | 404 | 503; message: string }

function getCompletionUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (normalized.endsWith("/chat/completions")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`
  return `${normalized}/v1/chat/completions`
}

export async function resolveAgentTarget(agent: AgentRow): Promise<ResolvedTarget> {
  if (agent.sourceType === "deployment") {
    const targetDeploymentId = agent.targetDeploymentId ?? agent.deploymentId
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, targetDeploymentId),
    })

    if (!deployment || deployment.status !== "running") {
      return { ok: false, status: 404, message: "Deployment not found or not running" }
    }
    if (!deployment.endpoint) {
      return { ok: false, status: 503, message: "Deployment endpoint not available" }
    }

    return {
      ok: true,
      target: { url: `${deployment.endpoint}/v1/chat/completions` },
      defaultModel: deployment.huggingfaceId,
      deploymentId: deployment.id,
    }
  }

  if (!agent.externalBaseUrl || !agent.externalModel) {
    return { ok: false, status: 400, message: "Agent external provider is not configured" }
  }
  if (!agent.encryptedExternalApiKey) {
    return { ok: false, status: 400, message: "Agent external API key missing" }
  }

  let externalApiKey: string
  try {
    externalApiKey = await decrypt(agent.encryptedExternalApiKey, aadFor.agentExternalApiKey(agent.id))
  } catch {
    return { ok: false, status: 503, message: "Failed to reach external provider" }
  }

  return {
    ok: true,
    target: {
      url: getCompletionUrl(agent.externalBaseUrl),
      headers: { Authorization: `Bearer ${externalApiKey}` },
    },
    defaultModel: agent.externalModel,
    deploymentId: agent.deploymentId,
  }
}

// ── The loop ─────────────────────────────────────────────────────────

export type RunAgentLoopParams = {
  agent: AgentRow
  target: UpstreamTarget
  /** Client body with the agent system prompt already applied */
  body: ChatBody
  /** Fallback model when the client omitted one */
  defaultModel: string | null
  /** Attached RAG collections; loaded from the DB when omitted */
  knowledge?: KnowledgeCollection[]
  onStep?: (step: RuntimeStep) => void
}

export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentRunResult> {
  const { agent, target } = params
  const knowledge =
    params.knowledge ?? (await loadAgentKnowledgeCollections(agent.id))
  const activeTools = resolveActiveTools(agent, knowledge)
  const toolDefinitions = buildToolDefinitions(activeTools)

  const usage = emptyUsage()
  const steps: RuntimeStep[] = []
  let toolsDegraded = false

  // Working message list — grows with assistant tool_calls + tool results.
  const messages: RuntimeMessage[] = Array.isArray(params.body.messages)
    ? (params.body.messages as RuntimeMessage[]).slice()
    : []

  const basePayload: Record<string, unknown> = {
    ...params.body,
    // The agent determines the real upstream model. The client-supplied
    // `model` is just the agent's display name, so `defaultModel` wins.
    model: params.defaultModel ?? params.body.model ?? undefined,
    stream: false,
  }
  delete basePayload.stream_options
  if (basePayload.temperature === undefined && agent.temperature != null) {
    basePayload.temperature = agent.temperature
  }
  if (basePayload.max_tokens === undefined && agent.maxTokens != null) {
    basePayload.max_tokens = agent.maxTokens
  }

  const maxSteps = Math.min(Math.max(agent.maxSteps, 1), 16)

  for (let step = 0; step <= maxSteps; step++) {
    // After maxSteps tool rounds (or after degradation), stop offering tools
    // so the model is forced to answer.
    const offerTools = !toolsDegraded && step < maxSteps && toolDefinitions.length > 0

    const payload: Record<string, unknown> = {
      ...basePayload,
      messages,
      ...(offerTools ? { tools: toolDefinitions, tool_choice: "auto" } : {}),
    }
    if (!offerTools) {
      delete payload.tools
      delete payload.tool_choice
    }

    let result = await callUpstream(target, payload)

    // Graceful degradation: retry once without tools if the engine rejects them.
    if (offerTools && looksLikeToolRejection(result.status, result.rawText)) {
      toolsDegraded = true
      delete payload.tools
      delete payload.tool_choice
      result = await callUpstream(target, payload)
    }

    if (result.status >= 400 || !result.body) {
      return {
        ok: false,
        status: result.status >= 400 ? result.status : 502,
        content: "",
        model: result.body?.model ?? null,
        finishReason: null,
        usage,
        steps,
        toolsDegraded,
        errorBody: result.body ?? { error: { message: result.rawText || "Invalid upstream response" } },
      }
    }

    addUsage(usage, result.body.usage)
    const choice = result.body.choices?.[0]
    const toolCalls = choice?.message?.tool_calls

    if (!toolCalls?.length) {
      return {
        ok: true,
        status: 200,
        content: choice?.message?.content ?? "",
        model: result.body.model ?? null,
        finishReason: choice?.finish_reason ?? "stop",
        usage,
        steps,
        toolsDegraded,
        errorBody: null,
      }
    }

    // Record the assistant turn that requested tools, then run each tool.
    messages.push({
      role: "assistant",
      content: choice?.message?.content ?? null,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const started = Date.now()
      const output = await executeTool(knowledge, call)
      const runtimeStep: RuntimeStep = {
        type: "tool_call",
        tool: call.function.name,
        arguments: call.function.arguments,
        result: output,
        durationMs: Date.now() - started,
      }
      steps.push(runtimeStep)
      params.onStep?.(runtimeStep)

      messages.push({
        role: "tool",
        content: output,
        tool_call_id: call.id,
        name: call.function.name,
      })
    }
  }

  // Loop exhausted without a final answer.
  return {
    ok: false,
    status: 502,
    content: "",
    model: null,
    finishReason: null,
    usage,
    steps,
    toolsDegraded,
    errorBody: { error: { message: `Agent exceeded ${maxSteps} tool steps without producing an answer` } },
  }
}

// ── OpenAI-shaped response helpers ───────────────────────────────────

export function toChatCompletionJson(result: AgentRunResult, agentId: string): Record<string, unknown> {
  return {
    id: `chatcmpl-agent-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model ?? `agent:${agentId}`,
    choices: [{
      index: 0,
      message: { role: "assistant", content: result.content },
      finish_reason: result.finishReason ?? "stop",
    }],
    usage: result.usage,
  }
}

/**
 * Emit a completed agent run as an OpenAI-compatible SSE stream so
 * `stream: true` clients keep working even though the tool loop ran
 * server-side (the answer arrives as chunks once the loop finishes).
 */
export function toChatCompletionStream(result: AgentRunResult, agentId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const id = `chatcmpl-agent-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const model = result.model ?? `agent:${agentId}`

  const chunk = (delta: Record<string, unknown>, finishReason: string | null, extra?: Record<string, unknown>) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
      ...extra,
    })}\n\n`

  // Split the final text into small chunks so clients render progressively.
  const CHUNK_SIZE = 80
  const pieces: string[] = []
  for (let i = 0; i < result.content.length; i += CHUNK_SIZE) {
    pieces.push(result.content.slice(i, i + CHUNK_SIZE))
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(chunk({ role: "assistant" }, null)))
      for (const piece of pieces) {
        controller.enqueue(encoder.encode(chunk({ content: piece }, null)))
      }
      controller.enqueue(encoder.encode(chunk({}, result.finishReason ?? "stop", { usage: result.usage })))
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}

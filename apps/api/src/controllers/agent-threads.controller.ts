// Playground threads: persisted conversations for the dashboard "Test" tab.
// Session-authenticated (unlike the gateway, which uses gpup_sk_ keys).
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { db } from "@llmpanel/db"
import { agentMessages, agentThreads, agents } from "@llmpanel/db/schema"
import { and, asc, desc, eq } from "drizzle-orm"
import {
  resolveAgentTarget,
  runAgentLoop,
  type AgentRow,
  type RuntimeMessage,
} from "../services/agent-runtime.service"
import { getWorkspaceId } from "../lib/workspace-context"

const MAX_HISTORY_MESSAGES = 40
const THREAD_TITLE_MAX = 60

async function findWorkspaceAgent(
  workspaceId: string,
  deploymentId: string,
  agentId: string
): Promise<AgentRow | undefined> {
  return db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.workspaceId, workspaceId),
      eq(agents.deploymentId, deploymentId),
      eq(agents.isActive, true)
    ),
  })
}

async function findWorkspaceThread(workspaceId: string, agentId: string, threadId: string) {
  return db.query.agentThreads.findFirst({
    where: and(
      eq(agentThreads.id, threadId),
      eq(agentThreads.agentId, agentId),
      eq(agentThreads.workspaceId, workspaceId),
      eq(agentThreads.isActive, true)
    ),
  })
}

// ── GET /:agentId/threads ────────────────────────────────────────────
export const getAgentThreads = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const threads = await db.query.agentThreads.findMany({
    where: and(
      eq(agentThreads.agentId, agentId),
      eq(agentThreads.workspaceId, workspaceId),
      eq(agentThreads.isActive, true)
    ),
    orderBy: [desc(agentThreads.updatedAt)],
    limit: 50,
  })

  return c.json({ threads })
}

// ── POST /:agentId/threads ───────────────────────────────────────────
export const createAgentThread = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const body = await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const now = new Date()
  const [thread] = await db.insert(agentThreads).values({
    id: crypto.randomUUID(),
    agentId,
    userId: user.id,
    workspaceId,
    title: body.title?.trim() || null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ thread }, 201)
}

// ── DELETE /:agentId/threads/:threadId ───────────────────────────────
export const deleteAgentThread = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const threadId = c.req.param("threadId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const thread = await findWorkspaceThread(workspaceId, agentId, threadId)
  if (!thread) return c.json({ error: "Thread not found" }, 404)

  await db.update(agentThreads).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(agentThreads.id, threadId))

  return c.json({ success: true })
}

// ── GET /:agentId/threads/:threadId/messages ─────────────────────────
export const getAgentThreadMessages = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const threadId = c.req.param("threadId")

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const thread = await findWorkspaceThread(workspaceId, agentId, threadId)
  if (!thread) return c.json({ error: "Thread not found" }, 404)

  const messages = await db.query.agentMessages.findMany({
    where: eq(agentMessages.threadId, threadId),
    orderBy: [asc(agentMessages.createdAt)],
  })

  return c.json({ messages })
}

// ── POST /:agentId/threads/:threadId/messages ────────────────────────
// Persists the user message, runs the agent loop with thread history, and
// streams SSE events: `step` (tool call), `delta` (final text in chunks),
// `done` (persisted assistant message) or `error`.
export const sendAgentThreadMessage = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const agentId = c.req.param("agentId")
  const threadId = c.req.param("threadId")
  const body = await c.req.json<{ content?: string }>().catch(() => ({} as { content?: string }))

  const content = body.content?.trim()
  if (!content) return c.json({ error: "content is required" }, 400)

  const agent = await findWorkspaceAgent(workspaceId, deploymentId, agentId)
  if (!agent) return c.json({ error: "Agent not found" }, 404)

  const thread = await findWorkspaceThread(workspaceId, agentId, threadId)
  if (!thread) return c.json({ error: "Thread not found" }, 404)

  const resolved = await resolveAgentTarget(agent)
  if (!resolved.ok) return c.json({ error: resolved.message }, resolved.status)

  // Build model history from persisted messages (user/assistant only — tool
  // transcripts are display metadata, not replayable context).
  const history = await db.query.agentMessages.findMany({
    where: eq(agentMessages.threadId, threadId),
    orderBy: [asc(agentMessages.createdAt)],
  })

  const modelMessages: RuntimeMessage[] = []
  if (agent.systemPrompt?.trim()) {
    modelMessages.push({ role: "system", content: agent.systemPrompt })
  }
  for (const m of history.slice(-MAX_HISTORY_MESSAGES)) {
    if ((m.role === "user" || m.role === "assistant") && m.content) {
      modelMessages.push({ role: m.role, content: m.content })
    }
  }
  modelMessages.push({ role: "user", content })

  const now = new Date()
  await db.insert(agentMessages).values({
    id: crypto.randomUUID(),
    threadId,
    role: "user",
    content,
    createdAt: now,
  })

  // First message titles the thread.
  if (!thread.title) {
    const title = content.length > THREAD_TITLE_MAX
      ? `${content.slice(0, THREAD_TITLE_MAX)}…`
      : content
    await db.update(agentThreads).set({ title, updatedAt: now })
      .where(eq(agentThreads.id, threadId))
  } else {
    await db.update(agentThreads).set({ updatedAt: now })
      .where(eq(agentThreads.id, threadId))
  }

  return streamSSE(c, async (stream) => {
    try {
      const result = await runAgentLoop({
        agent,
        target: resolved.target,
        body: { messages: modelMessages },
        defaultModel: resolved.defaultModel,
        onStep: (step) => {
          void stream.writeSSE({
            event: "step",
            data: JSON.stringify({
              tool: step.tool,
              arguments: step.arguments,
              result: step.result.slice(0, 2000),
              durationMs: step.durationMs,
            }),
          })
        },
      })

      if (!result.ok) {
        const errorMessage =
          (result.errorBody as { error?: { message?: string } } | null)?.error?.message
          ?? "Agent run failed"
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: errorMessage }) })
        return
      }

      // Persist tool steps + final assistant message.
      const finishedAt = new Date()
      for (const step of result.steps) {
        await db.insert(agentMessages).values({
          id: crypto.randomUUID(),
          threadId,
          role: "tool",
          content: step.result.slice(0, 4000),
          toolName: step.tool,
          toolCalls: JSON.stringify({ arguments: step.arguments, durationMs: step.durationMs }),
          createdAt: finishedAt,
        })
      }

      const [assistantMessage] = await db.insert(agentMessages).values({
        id: crypto.randomUUID(),
        threadId,
        role: "assistant",
        content: result.content,
        promptTokens: result.usage.prompt_tokens || null,
        completionTokens: result.usage.completion_tokens || null,
        createdAt: finishedAt,
      }).returning()

      await db.update(agentThreads).set({ updatedAt: finishedAt })
        .where(eq(agentThreads.id, threadId))

      // Chunk the final text so the client renders progressively.
      const CHUNK_SIZE = 120
      for (let i = 0; i < result.content.length; i += CHUNK_SIZE) {
        await stream.writeSSE({
          event: "delta",
          data: JSON.stringify({ content: result.content.slice(i, i + CHUNK_SIZE) }),
        })
      }

      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({
          message: assistantMessage,
          usage: result.usage,
          toolsDegraded: result.toolsDegraded,
          steps: result.steps.length,
        }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed"
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message }) })
    }
  })
}

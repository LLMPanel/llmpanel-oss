import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  createAgent,
  createAgentKey,
  deleteAgent,
  getAgent,
  getAgentKeys,
  getAgents,
  getAgentUsage,
  revokeAgentKey,
  updateAgent,
} from "../controllers/agents.controller"
import {
  createAgentThread,
  deleteAgentThread,
  getAgentThreadMessages,
  getAgentThreads,
  sendAgentThreadMessage,
} from "../controllers/agent-threads.controller"

const AgentSourceTypeSchema = z.enum(["deployment", "openai-compatible"])
const AgentToolSchema = z.enum(["knowledge_search"])

const AgentRuntimeFields = {
  emoji: z.string().max(16).optional(),
  toolsEnabled: z.array(AgentToolSchema).max(8).optional(),
  ragCollectionId: z.string().nullable().optional(),
  ragCollectionIds: z.array(z.string()).max(16).optional(),
  maxSteps: z.number().int().min(1).max(16).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(1).max(128000).nullable().optional(),
}

const CreateAgentSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(250).optional(),
  systemPrompt: z.string().max(8000).optional(),
  sourceType: AgentSourceTypeSchema,
  targetDeploymentId: z.string().optional(),
  externalBaseUrl: z.string().url().optional(),
  externalModel: z.string().optional(),
  externalApiKey: z.string().optional(),
  ...AgentRuntimeFields,
}).superRefine((value, ctx) => {
  if (value.sourceType === "deployment") {
    return
  }

  if (!value.externalBaseUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalBaseUrl"],
      message: "externalBaseUrl is required for openai-compatible source",
    })
  }
  if (!value.externalModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalModel"],
      message: "externalModel is required for openai-compatible source",
    })
  }
  if (!value.externalApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalApiKey"],
      message: "externalApiKey is required for openai-compatible source",
    })
  }
})

const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(250).optional(),
  systemPrompt: z.string().max(8000).optional(),
  sourceType: AgentSourceTypeSchema.optional(),
  targetDeploymentId: z.string().optional(),
  externalBaseUrl: z.string().url().optional(),
  externalModel: z.string().optional(),
  externalApiKey: z.string().optional(),
  ...AgentRuntimeFields,
})

const CreateAgentKeySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  expiresAt: z.string().datetime().optional(),
})

// Mounted at /api/v1/deployments/:id/agents
export const agentsRoute = new Hono()
  .use(sessionAuth)
  .get("/", getAgents)
  .post("/", requireRole("member"), zValidator("json", CreateAgentSchema), createAgent)
  .get("/:agentId", getAgent)
  .put("/:agentId", requireRole("member"), zValidator("json", UpdateAgentSchema), updateAgent)
  .delete("/:agentId", requireRole("member"), deleteAgent)
  .get("/:agentId/usage", getAgentUsage)
  .get("/:agentId/keys", getAgentKeys)
  .post("/:agentId/keys", requireRole("member"), zValidator("json", CreateAgentKeySchema), createAgentKey)
  .delete("/:agentId/keys/:keyId", requireRole("member"), revokeAgentKey)
  .get("/:agentId/threads", getAgentThreads)
  .post("/:agentId/threads", requireRole("member"), createAgentThread)
  .delete("/:agentId/threads/:threadId", requireRole("member"), deleteAgentThread)
  .get("/:agentId/threads/:threadId/messages", getAgentThreadMessages)
  .post("/:agentId/threads/:threadId/messages", requireRole("member"), sendAgentThreadMessage)

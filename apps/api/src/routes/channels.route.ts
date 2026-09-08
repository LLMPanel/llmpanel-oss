import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  getChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  startChannel,
  stopChannel,
  restartChannel,
  getMessages,
  getChannelStats,
  getConversations,
  getConversationMessages,
  testChannel,
} from "../controllers/channels.controller"

const ChannelPlatformSchema = z.enum([
  "whatsapp", "telegram", "discord", "slack", "feishu", "twitch", "zalo",
])

const ChannelBehaviorFields = {
  systemPrompt: z.string().max(8000).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  agentId: z.string().nullable().optional(),
  historyEnabled: z.boolean().optional(),
  historyLimit: z.number().int().min(2).max(100).optional(),
  allowlist: z.array(z.string().min(1).max(120)).max(500).nullable().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(600).nullable().optional(),
}

const CreateChannelSchema = z.object({
  platform: ChannelPlatformSchema,
  name: z.string().min(1).max(80),
  config: z.record(z.string(), z.string()),
  ...ChannelBehaviorFields,
})

const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.string()).optional(),
  ...ChannelBehaviorFields,
})

// Mounted at /api/v1/deployments/:id/channels
// (registered in routes/index.ts under deploymentsRoute as a sub-route)
export const channelsRoute = new Hono()
  .use(sessionAuth)

  // GET  /api/v1/deployments/:id/channels
  .get("/", getChannels)

  // POST /api/v1/deployments/:id/channels
  .post("/", requireRole("member"), zValidator("json", CreateChannelSchema), createChannel)

  // GET /api/v1/deployments/:id/channels/:channelId
  .get("/:channelId", getChannel)

  // PATCH /api/v1/deployments/:id/channels/:channelId
  .patch("/:channelId", requireRole("member"), zValidator("json", UpdateChannelSchema), updateChannel)

  // DELETE /api/v1/deployments/:id/channels/:channelId
  .delete("/:channelId", requireRole("member"), deleteChannel)

  // POST /api/v1/deployments/:id/channels/:channelId/start
  .post("/:channelId/start", requireRole("member"), startChannel)

  // POST /api/v1/deployments/:id/channels/:channelId/stop
  .post("/:channelId/stop", requireRole("member"), stopChannel)

  // POST /api/v1/deployments/:id/channels/:channelId/restart
  .post("/:channelId/restart", requireRole("member"), restartChannel)

  // GET /api/v1/deployments/:id/channels/:channelId/messages
  .get("/:channelId/messages", getMessages)

  // GET /api/v1/deployments/:id/channels/:channelId/stats
  .get("/:channelId/stats", getChannelStats)

  // GET /api/v1/deployments/:id/channels/:channelId/conversations
  .get("/:channelId/conversations", getConversations)

  // GET /api/v1/deployments/:id/channels/:channelId/conversations/:platformUserId/messages
  .get("/:channelId/conversations/:platformUserId/messages", getConversationMessages)

  // POST /api/v1/deployments/:id/channels/:channelId/test
  .post("/:channelId/test", requireRole("member"), testChannel)

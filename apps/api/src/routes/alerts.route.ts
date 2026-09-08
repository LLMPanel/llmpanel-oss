import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  getAlertChannels,
  createAlertChannel,
  updateAlertChannel,
  deleteAlertChannel,
  testAlertChannel,
} from "../controllers/alerts.controller"

/**
 * User-level alert channel management.
 * Mounted at /api/v1/alerts
 */
export const alertsRoute = new Hono()
  .use(sessionAuth)

  // GET  /api/v1/alerts/channels        — list all channels for the current user
  .get("/channels", getAlertChannels)

  // POST /api/v1/alerts/channels        — create a new channel
  .post("/channels", requireRole("member"), createAlertChannel)

  // PATCH /api/v1/alerts/channels/:channelId  — update name / credentials
  .patch("/channels/:channelId", requireRole("member"), updateAlertChannel)

  // DELETE /api/v1/alerts/channels/:channelId — soft-delete a channel
  .delete("/channels/:channelId", requireRole("member"), deleteAlertChannel)

  // POST /api/v1/alerts/channels/:channelId/test — send a test notification
  .post("/channels/:channelId/test", requireRole("member"), testAlertChannel)

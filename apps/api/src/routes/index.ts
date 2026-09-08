// apps/api/src/routes/index.ts
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
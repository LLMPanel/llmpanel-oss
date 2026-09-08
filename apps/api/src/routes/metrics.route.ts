// apps/api/src/routes/metrics.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getDeploymentMetrics,
  getDeploymentMetricsHistory,
  getDeploymentInference,
} from "../controllers/metrics.controller"

export const metricsRoute = new Hono()
  .use(sessionAuth)

  // GET /api/v1/metrics/deployments/:id
  .get("/deployments/:id", getDeploymentMetrics)

  // GET /api/v1/metrics/deployments/:id/history?window=1h|6h|24h
  .get("/deployments/:id/history", getDeploymentMetricsHistory)

  // GET /api/v1/metrics/deployments/:id/inference
  .get("/deployments/:id/inference", getDeploymentInference)
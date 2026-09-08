// apps/api/src/routes/analytics.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getAnalyticsOverview,
  getAnalyticsRequests,
  getAnalyticsUsage,
  getSingleLog,
} from "../controllers/metrics.controller"

export const analyticsRoute = new Hono()
  .use(sessionAuth)

  // GET /api/v1/analytics/overview
  .get("/overview", getAnalyticsOverview)

  // GET /api/v1/analytics/requests
  .get("/requests", getAnalyticsRequests)
  .get("/requests/:logId", getSingleLog)

  // GET /api/v1/analytics/usage
  .get("/usage", getAnalyticsUsage)
// apps/api/src/routes/spendings.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { getSpendHistory } from "../controllers/spendings.controller"

export const spendingsRoute = new Hono()
  .use(sessionAuth)
  // GET /api/v1/spendings/history?days=7
  .get("/history", getSpendHistory)

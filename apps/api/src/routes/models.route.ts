// apps/api/src/routes/models.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import {
  getModels,
  getModel,
  checkCompatibility,
} from "../controllers/models.controller"

export const modelsRoute = new Hono()
  .use(sessionAuth)
  .get("/", getModels)
  .get("/:id", getModel)
  .get("/:id/compatibility", checkCompatibility)
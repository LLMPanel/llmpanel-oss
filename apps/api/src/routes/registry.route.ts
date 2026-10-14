// apps/api/src/routes/registry.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { listRegistryModels } from "../controllers/registry.controller"

export const registryRoute = new Hono()
  .use(sessionAuth)
  .get("/models", listRegistryModels)

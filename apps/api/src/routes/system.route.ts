import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { getSystemGpu, getSystemInfo } from "../controllers/system.controller"

export const systemRoute = new Hono()
  .use(sessionAuth)
  .get("/info", getSystemInfo)
  .get("/gpu", getSystemGpu)

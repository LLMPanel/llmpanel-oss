// apps/api/src/routes/providers.route.ts
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  getProviders,
  getProvider,
  createProviderConnection,
  updateProvider,
  deleteProvider,
  verifyProvider,
  getProviderGPUs,
  getProviderCatalog,
  setDefaultProvider,
} from "../controllers/providers.controller"
import { getProviderStats } from "../controllers/provider-stats.controller"

const CreateProviderSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    "local",
    "runpod",
    "vastai",
    "hotaisle",
    "thundercompute",
    "lambdalabs",
    "datacrunch",
    "hyperstack",
    "tensordock",
  ]),
  apiKey: z.string().optional(),
})

const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().optional(),
})

export const providersRoute = new Hono()
  .use(sessionAuth)
  .get("/", getProviders)
  .post("/", requireRole("owner"), zValidator("json", CreateProviderSchema), createProviderConnection)
  .get("/:id", getProvider)
  .put("/:id", requireRole("owner"), zValidator("json", UpdateProviderSchema), updateProvider)
  .delete("/:id", requireRole("owner"), deleteProvider)
  .post("/:id/verify", requireRole("member"), verifyProvider)
  .post("/:id/default", requireRole("owner"), setDefaultProvider)
  .get("/:id/gpus", getProviderGPUs)
  .get("/:id/catalog", getProviderCatalog)
  .get("/:id/stats", getProviderStats)

// apps/api/src/middlewares/admin-auth.middleware.ts
import { createMiddleware } from "hono/factory"
import { auth } from "../lib/auth"

export const adminAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  if (session.user.role !== "admin") {
    return c.json({ error: "Forbidden — admin access required" }, 403)
  }

  c.set("user", session.user)
  c.set("session", session.session)
  await next()
})
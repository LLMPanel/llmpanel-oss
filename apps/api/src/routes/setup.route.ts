import { Hono } from "hono"
import { db } from "@llmpanel/db"
import { user } from "@llmpanel/db/schema"

// Public route — the login/register pages call this before any session exists.
// `needsSetup` is true only while the instance has zero accounts, i.e. the
// first-run state where public registration is allowed.
export const setupRoute = new Hono().get("/status", async (c) => {
  const userCount = await db.$count(user)
  return c.json({ needsSetup: userCount === 0 })
})

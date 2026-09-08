// apps/api/src/routes/waitlist.route.ts
//
// Public founder-pricing waitlist signup, called cross-origin by the static
// marketing site (llmpanel.io). No session, no cookies — index.ts gives this
// path open, credential-less CORS. Duplicate emails collapse via the unique
// constraint, and a hidden honeypot field ("company") swallows naive bots.
import { Hono } from "hono"
import { z } from "zod"
import { db } from "@llmpanel/db"
import { waitlistSignups } from "@llmpanel/db/schema"

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().max(64).optional(),
  // Honeypot — rendered invisibly on the site; humans never fill it.
  company: z.string().max(256).optional(),
})

export const waitlistRoute = new Hono().post("/", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid request body" }, 400)
  }

  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Please enter a valid email address." }, 400)
  }

  const { email, source, company } = parsed.data
  // Bots that filled the honeypot get a success response and no row.
  if (company) return c.json({ ok: true })

  await db
    .insert(waitlistSignups)
    .values({
      id: crypto.randomUUID(),
      email,
      source: source ?? null,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: waitlistSignups.email })

  return c.json({ ok: true })
})

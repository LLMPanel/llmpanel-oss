import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

/**
 * Founder-pricing waitlist signups from the static marketing site
 * (llmpanel.io). Written by a public, unauthenticated endpoint — email is
 * unique so repeat submissions collapse into one row instead of erroring.
 */
export const waitlistSignups = sqliteTable("waitlist_signups", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Where on the site the signup came from, e.g. "scroll-modal".
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

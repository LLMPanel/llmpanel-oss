/// <reference types="node" />
import type { Config } from "drizzle-kit"

// Mirrors packages/db/drizzle.config.ts — run migrations from packages/db, not here.
export default {
  schema: "../../packages/db/src/schema/index.ts",
  out: "../../packages/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:../../packages/db/local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config

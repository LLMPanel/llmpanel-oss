import type { Config } from "drizzle-kit"

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config
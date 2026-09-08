import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Internal URL used by the Next.js proxy route to forward requests to the Hono API
  HONO_API_URL: z.string().url(),
  // Sentry error monitoring — the SDK stays disabled while this is unset.
  // An unset Docker ARG arrives as "" rather than undefined, so empty has to
  // mean absent here: otherwise `docker build` without a DSN fails on .url()
  // instead of just leaving Sentry off, which is what the Dockerfile promises.
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional()
  ),
})

export const env = envSchema.parse(process.env)
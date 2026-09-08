# 04 — Authentication Setup

## How it works
- Better Auth **server** lives in `apps/api`
- Better Auth **client** lives in `apps/web`
- Next.js proxies all `/api/*` calls to Hono — cookies flow automatically
- No manual JWT needed between Next.js and Hono

## Install

```bash
# apps/api
pnpm add better-auth

# apps/web
pnpm add better-auth
```

## apps/api/src/lib/auth.ts

> **Sign-up email verification (current implementation, `apps/api/src/lib/auth.ts`)**
>
> New accounts must prove they own their address with a 6-digit code before
> they can sign in (`emailOTP` plugin, `overrideDefaultEmailVerification`,
> `autoSignInAfterVerification`). Enforced whenever an email provider is
> configured, or in development where the code is printed to the API console.
> Codes live 10 minutes, are stored hashed, and allow 5 attempts.
>
> Email goes through Resend (`RESEND_API_KEY`) or Cloudflare Email Sending
> (`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_EMAIL_API_TOKEN`); `EMAIL_PROVIDER`
> forces one when both are set. `EMAIL_FROM` must be on a domain verified with
> that provider. See `apps/api/src/services/email.service.ts`.
>
> Address policy (`apps/api/src/services/email-policy.service.ts`), applied in
> `databaseHooks.user.create.before` so it covers password, social and
> admin-created accounts:
> - disposable / temp-mail domains are refused (`disposable-email-domains` list);
> - the domain must have MX (or A/AAAA) records — DNS outages fail open;
> - one mailbox, one account: `+tags` and Gmail dots are normalised, so
>   `ada+x@gmail.com` cannot register when `a.da@gmail.com` already exists;
> - `<username>@users.local` is reserved for admin-created accounts and is
>   rejected on the public form; those accounts are marked verified by the
>   admin route because no code can reach them.
>
> The web side: `components/auth/verify-email-form.tsx` is the code step, used
> by the register form after sign-up and by the login form when sign-in fails
> with `EMAIL_NOT_VERIFIED`.
>
> **Forgot password** reuses the same plugin: `/forgot-password`
> (`components/auth/forgot-password-form.tsx`) calls
> `emailOtp.requestPasswordReset` — which always reports success so it cannot
> be used to probe for accounts — then `emailOtp.resetPassword` with the
> emailed code and the new password, and lands on `/login?reset=1`.
> `revokeSessionsOnPasswordReset` signs every other device out. Username-only
> (`@users.local`) accounts have no mailbox, so an admin resets those.

```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { twoFactor } from "better-auth/plugins"
import { db } from "./db"
import { env } from "../env"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },

  plugins: [
    twoFactor({
      issuer: "LLMPanel",
      otpOptions: {
        async sendOTP({ user, otp }) {
          if (env.NODE_ENV === "development") {
            // DEV: check your API terminal for the OTP
            console.log(`\n[DEV 2FA] OTP for ${user.email}: ${otp}\n`)
            return
          }
          // PROD: implement email sending here
          throw new Error("Email sending not configured")
        },
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 days
    updateAge: 60 * 60 * 24,         // refresh if >1 day old
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    generateId: () => crypto.randomUUID(),
  },

  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
})

export type Auth = typeof auth
```

## apps/api/src/lib/db.ts

```typescript
import { db } from "@llmpanel/db"
export { db }
```

## apps/api/src/env.ts

```typescript
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEPLOYMENT_MODE: z.enum(["self-hosted", "cloud"]).default("self-hosted"),
  PORT: z.coerce.number().default(8000),

  DATABASE_URL: z.string().default("file:./local.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),

  ENCRYPTION_KEY: z.string().min(32),
  HF_TOKEN: z.string().default(""),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
})

export const env = envSchema.parse(process.env)
```

## Generate Better Auth DB Tables

```bash
cd apps/api
pnpx @better-auth/cli generate --config src/lib/auth.ts
pnpm --filter @llmpanel/db db:generate
pnpm --filter @llmpanel/db db:migrate
```

`db:generate` records the new auth tables as a migration; `db:migrate` applies
it. Do not substitute `drizzle-kit push` — it skips the `__drizzle_migrations`
ledger and breaks the API's startup migration.

## apps/api/src/index.ts (mount Better Auth)

```typescript
import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth"
import { env } from "./env"
import { errorMiddleware } from "./middlewares/error.middleware"
import { ipRateLimit } from "./middlewares/rate-limit.middleware"
import { registerRoutes } from "./routes"

const app = new Hono()

app.use("*", errorMiddleware)

app.use("*", cors({
  origin: [env.NEXT_PUBLIC_APP_URL],
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}))

// Better Auth — handles /api/auth/* automatically
app.use("/api/auth/*", ipRateLimit(20, 15))
app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw))

registerRoutes(app)

app.notFound((c) => c.json({ error: "Route not found" }, 404))

export default app
```

## Next.js proxy (solves cookie forwarding in dev)

```typescript
// apps/web/app/api/[...proxy]/route.ts
import { env } from "@/env"

async function proxyToHono(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const honoUrl = `${env.HONO_API_URL}${url.pathname}${url.search}`
  return fetch(honoUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error
    duplex: "half",
  })
}

export const GET = proxyToHono
export const POST = proxyToHono
export const PUT = proxyToHono
export const DELETE = proxyToHono
export const PATCH = proxyToHono
```

## apps/web/lib/auth-client.ts

```typescript
import { createAuthClient } from "better-auth/react"
import { twoFactorClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: "/api",  // routes through Next.js proxy → Hono
  plugins: [twoFactorClient()],
})

export const { signIn, signOut, signUp, useSession, twoFactor } = authClient
```

## apps/web/env.ts

```typescript
import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  HONO_API_URL: z.string().url(),
})

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  HONO_API_URL: process.env.HONO_API_URL,
})
```

## Frontend Usage

```typescript
// Sign up
await signUp.email({ email, password, name })

// Sign in
await signIn.email({ email, password })

// OAuth
await signIn.social({ provider: "google" })
await signIn.social({ provider: "github" })

// Session in component
const { data: session } = useSession()

// Sign out
await signOut()

// 2FA — called after sign in if twoFactorRedirect === true
await twoFactor.verifyTotp({ code: otp })
// In dev: OTP prints to your API terminal console

// Enable 2FA
const { data } = await twoFactor.enable({ password: currentPassword })
// data.totpURI → show QR code
// data.backupCodes → show once
```

## Environment Variables

```env
# apps/api/.env
NODE_ENV=development
DEPLOYMENT_MODE=self-hosted
PORT=8000
DATABASE_URL=file:./local.db
BETTER_AUTH_SECRET=<run: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:8000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ENCRYPTION_KEY=<run: openssl rand -hex 32>
HF_TOKEN=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# apps/web/.env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000
HONO_API_URL=http://localhost:8000
```

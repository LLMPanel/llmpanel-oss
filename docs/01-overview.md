# 01 — Project Overview, Stack & Structure

## Two Deployment Modes

**Self-Hosted:** User runs curl script on their GPU machine. Dashboard + API in Docker. Local GPU via dockerode. SQLite DB. Free/open source.

**Cloud:** You host the panel. Users bring RunPod/Vast.ai API keys. Keys encrypted at rest. Turso/Postgres DB.

## Core User Flow

```
curl install → dashboard at :3000 → connect GPU provider
→ browse model registry → select model + GPU + quantization → Deploy
→ background job: spin container → download weights → health check
→ SSE pushes progress → model live → user gets endpoint + API key
→ external apps use Bearer token (OpenAI-compatible)
```

## Tech Stack

### Frontend — apps/web
- Next.js 15 (App Router) + TypeScript strict
- Shadcn UI + Tailwind CSS
- Better Auth (client) — `better-auth/react`
- Nuqs (URL state), Zod (validation), TanStack Query

### Backend — apps/api
- Hono + TypeScript strict
- Better Auth (server)
- Drizzle ORM + SQLite (libsql)
- Zod + @hono/zod-validator
- graphql-request (RunPod API)
- dockerode (local container management)
- Hono SSE (real-time streaming)

### Shared Packages
- `@llmpanel/db` — Drizzle schema + connection
- `@llmpanel/providers` — GPU provider abstraction
- `@llmpanel/shared` — Zod schemas, types, constants

### Monorepo
- pnpm workspaces + Turborepo

## Folder Structure

```
llmpanel/
├── apps/
│   ├── web/                          # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── models/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── deployments/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   │   ├── providers/page.tsx
│   │   │   │   ├── api-keys/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── api/[...proxy]/route.ts
│   │   ├── components/
│   │   │   ├── deployments/
│   │   │   ├── models/
│   │   │   ├── providers/
│   │   │   └── shared/
│   │   ├── hooks/
│   │   │   ├── use-deploy-model.ts
│   │   │   ├── use-deployment-status.ts
│   │   │   ├── use-deployments.ts
│   │   │   ├── use-models.ts
│   │   │   └── use-gpu-metrics.ts
│   │   ├── lib/
│   │   │   ├── api-client.ts
│   │   │   └── auth-client.ts
│   │   └── env.ts
│   │
│   └── api/
│       └── src/
│           ├── index.ts
│           ├── env.ts
│           ├── routes/
│           │   ├── index.ts
│           │   ├── models.route.ts
│           │   ├── deployments.route.ts
│           │   ├── providers.route.ts
│           │   ├── api-keys.route.ts
│           │   ├── metrics.route.ts
│           │   ├── analytics.route.ts
│           │   ├── gateway.route.ts
│           │   └── admin.route.ts
│           ├── controllers/
│           │   ├── models.controller.ts
│           │   ├── deployments.controller.ts
│           │   ├── providers.controller.ts
│           │   ├── api-keys.controller.ts
│           │   └── metrics.controller.ts
│           ├── middlewares/
│           │   ├── session-auth.middleware.ts
│           │   ├── api-key-auth.middleware.ts
│           │   ├── admin-auth.middleware.ts
│           │   ├── error.middleware.ts
│           │   └── rate-limit.middleware.ts
│           ├── services/
│           │   ├── deployment.service.ts
│           │   ├── model.service.ts
│           │   ├── metrics.service.ts
│           │   └── encryption.service.ts
│           └── lib/
│               ├── auth.ts
│               └── db.ts
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── connection.ts
│   │   │   └── schema/
│   │   │       ├── index.ts
│   │   │       ├── users.ts
│   │   │       ├── deployments.ts
│   │   │       ├── models.ts
│   │   │       ├── providers.ts
│   │   │       ├── gateway-api-keys.ts
│   │   │       ├── request-logs.ts
│   │   │       └── audit-logs.ts
│   │   └── drizzle.config.ts
│   │
│   ├── providers/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── factory.ts
│   │       ├── local/
│   │       │   ├── index.ts
│   │       │   ├── local.provider.ts
│   │       │   └── docker.client.ts
│   │       ├── runpod/
│   │       │   ├── index.ts
│   │       │   ├── runpod.provider.ts
│   │       │   └── runpod.client.ts
│   │       └── vastai/
│   │           ├── index.ts
│   │           └── vastai.provider.ts
│   │
│   └── shared/
│       └── src/
│           ├── index.ts
│           ├── schemas/
│           │   ├── deployment.schema.ts
│           │   ├── model.schema.ts
│           │   └── provider.schema.ts
│           ├── types/
│           │   ├── deployment.types.ts
│           │   ├── model.types.ts
│           │   └── provider.types.ts
│           └── constants/
│               ├── models.ts
│               └── providers.ts
│
├── docker-compose.yml
├── docker-compose.cloud.yml
├── install.sh
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Monorepo Bootstrap Commands

```bash
# 1. Init root
mkdir llmpanel && cd llmpanel
pnpm init

# 2. Create apps
cd apps
pnpm create next-app@latest web --typescript --tailwind --app --no-src-dir
mkdir -p api/src

# 3. Create packages
mkdir -p packages/db/src/schema
mkdir -p packages/providers/src/{local,runpod,vastai}
mkdir -p packages/shared/src/{schemas,types,constants}

# 4. Install root deps
pnpm add -D turbo typescript -w

# 5. Link workspace packages — add to apps/api/package.json:
# "@llmpanel/db": "workspace:*"
# "@llmpanel/providers": "workspace:*"
# "@llmpanel/shared": "workspace:*"

pnpm install
```

## Package.json name fields

```
root:                "name": "llmpanel"
apps/web:            "name": "@llmpanel/web"
apps/api:            "name": "@llmpanel/api"
packages/db:         "name": "@llmpanel/db"
packages/providers:  "name": "@llmpanel/providers"
packages/shared:     "name": "@llmpanel/shared"
```

## tsconfig paths (apps/api/tsconfig.json)

```json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@llmpanel/db": ["../../packages/db/src/index.ts"],
      "@llmpanel/db/*": ["../../packages/db/src/*"],
      "@llmpanel/providers": ["../../packages/providers/src/index.ts"],
      "@llmpanel/providers/*": ["../../packages/providers/src/*"],
      "@llmpanel/shared": ["../../packages/shared/src/index.ts"],
      "@llmpanel/shared/*": ["../../packages/shared/src/*"]
    }
  }
}
```

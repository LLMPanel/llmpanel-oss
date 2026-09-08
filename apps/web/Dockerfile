# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, not from apps/web:
#   docker build -f apps/web/Dockerfile -t llmpanel-web .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app


# ── deps ───────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/providers/package.json packages/providers/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @llmpanel/web...


# ── build ──────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/ packages/
COPY apps/web/ apps/web/

# Next bakes rewrites() into routes-manifest.json at build time, so the API URL
# must be known now. It defaults to the compose service name, not localhost.
ARG NEXT_PUBLIC_API_URL=http://api:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# app/api/*/route.ts imports env.ts, which Zod-validates HONO_API_URL at module
# load — and `next build` loads those modules while collecting routes.
ENV HONO_API_URL=$NEXT_PUBLIC_API_URL
# NEXT_PUBLIC_* is inlined at build time, so Sentry's DSN has to be baked here
# too. Empty (the default) leaves the SDK disabled — self-builders opt in.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN pnpm run build


# ── runner ─────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` with outputFileTracingRoot at the workspace root emits
# a self-contained tree rooted at the monorepo, hence the apps/web/ nesting.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/login || exit 1

CMD ["node", "apps/web/server.js"]

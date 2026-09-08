# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, not from apps/api:
#   docker build -f apps/api/Dockerfile -t llmpanel-api .
#
# The API bundles the @llmpanel/* workspace packages (they ship raw TypeScript),
# so the build needs the whole workspace even though only apps/api is shipped.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app


# ── deps: full install (incl. dev) so we can run esbuild ────────────────────────
FROM base AS deps
# node-gyp fallbacks for any dependency without a prebuilt binary
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/providers/package.json packages/providers/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @llmpanel/api...


# ── build: bundle src + workspace packages into a single ESM file ───────────────
FROM deps AS build
COPY packages/ packages/
COPY apps/api/ apps/api/
WORKDIR /app/apps/api
RUN pnpm run build


# ── prod-deps: the same install, minus devDependencies ──────────────────────────
FROM deps AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @llmpanel/api...


# ── runner ─────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# The bundle has no source tree to search, so point the migrator at an absolute path.
ENV MIGRATIONS_DIR=/app/packages/db/migrations
ENV DATABASE_URL=file:/data/llmpanel.db
ENV PORT=8000

# curl for the healthcheck; the API talks to the host Docker daemon over the
# mounted socket, so no docker CLI is needed in the image.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# pnpm links apps/api/node_modules into the root .pnpm store, so both are required.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/db/migrations ./packages/db/migrations

# Runs as root: it needs to talk to /var/run/docker.sock, whose group id varies
# by host. Dropping privileges here would break GPU container provisioning.
WORKDIR /app/apps/api
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["node", "dist/server.mjs"]

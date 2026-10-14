# Contributing to LLMPanel

Thanks for wanting to help. A couple of things about how this repository works
will save you time.

## This repository is a mirror

LLMPanel is developed in a private monorepo that also contains the code for the
hosted service at llmpanel.io. This repository is generated from it: the code you
see here is the real thing, but commits land as periodic "Sync from upstream"
commits rather than as individual authored commits.

What that means for you:

- **Your pull requests are welcome and do get merged.** A maintainer applies the
  change upstream, and it comes back down in the next sync. The PR is then closed
  with a link to the commit that carries it. You keep authorship in the commit
  trailer.
- **Don't be alarmed if your branch shows conflicts after a sync.** Rebase onto
  the new `master` and force-push; the content is the same.
- **Small, focused PRs merge much faster** than large ones, because each has to
  be replayed by hand.

If you are planning something substantial, open an issue first so we can agree on
the approach before you write it.

## Getting set up

Node 20.9+, pnpm 10, Docker.

```bash
pnpm install

cat > apps/api/.env <<EOF
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_BASE_URL=http://localhost:8000
EOF
echo "HONO_API_URL=http://localhost:8000" > apps/web/.env.local

pnpm dev
```

The dashboard comes up on `:3000` and the API on `:8000`. The API applies
database migrations itself on every start. The root `.env.example` configures the
Docker Compose install, not local development.

You do not need a GPU to work on most of the codebase. Set `GPU_AVAILABLE=false`
and the panel reports "no GPU detected" instead of failing at deploy time. To
exercise the chat and gateway paths locally, point a deployment at an
OpenAI-compatible server you already run.

## Before you open a PR

```bash
pnpm typecheck
pnpm lint
pnpm build
```

All three have to pass. CI runs the same three.

## House rules

These are enforced in review, so knowing them up front helps.

- **TypeScript strict, and no `any`.** If you genuinely cannot type something,
  say so in the PR and we will work it out.
- **Every environment variable is validated with Zod at startup**, in
  `apps/api/src/env.ts` or `apps/web/env.ts`. A variable read straight from
  `process.env` in application code will be asked about.
- **Import through the package name** — `@llmpanel/db`, `@llmpanel/providers`,
  `@llmpanel/shared` — never by relative path across a package boundary.
- **Soft delete only.** Set `isActive: false`; never `DELETE FROM`.
- **SSE for anything real-time.** Not WebSockets.
- **Return from the API fast and provision in the background.** A request that
  waits on a container pull is a bug.
- **Schema changes need a generated migration.** Run
  `pnpm --filter @llmpanel/db db:generate` after editing anything under
  `packages/db/src/schema/`, and commit the generated file. Never
  `drizzle-kit push`.

## Commit messages

Lowercase, imperative, scoped by area, describing the effect rather than the
mechanism:

```
api: return the deployment id before the container starts
web: keep the model filter in the url so it survives a refresh
```

## Reporting bugs

Open an issue with the version (`docker inspect llmpanel-api-1 --format '{{.Image}}'`),
whether you are in `self-hosted` or `cloud` mode, and the relevant lines from
`docker logs llmpanel-api-1`. Redact your keys first — the API logs request
bodies.

Security vulnerabilities go to the address in [SECURITY.md](SECURITY.md), not to
the issue tracker.

## License

Contributions are accepted under the [AGPL v3](LICENSE), the same license the
project ships under.

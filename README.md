# LLMPanel

**An open-source control panel for self-hosted LLM inference.** Point it at a GPU
box or a cloud GPU account, pick a model, and get an OpenAI-compatible endpoint —
without writing a Dockerfile or an nginx config.

Think Coolify, but for model inference.

```bash
curl -fsSL https://raw.githubusercontent.com/LLMPanel/llmpanel-oss/master/install.sh | sudo bash
```

That installs Docker if it is missing, pulls the panel and API images, and brings
up the dashboard on `http://<your-ip>:3000`. For a TLS install on your own
domain, see [Installation](#installation) below.

---

## What it does

- **Deploy models from a registry.** Browse a curated catalogue, choose a
  quantization and a GPU, and deploy. Weights download, the container starts, and
  a health check gates it live.
- **Run anywhere.** `self-hosted` mode provisions containers on the local Docker
  daemon. `cloud` mode provisions on RunPod or Vast.ai with your own API keys.
- **OpenAI-compatible gateway.** Every deployment is reachable at
  `/v1/chat/completions`, `/v1/completions`, and `/v1/embeddings` with a Bearer
  token, so existing SDKs work unchanged.
- **Per-GPU metrics.** Utilisation, VRAM, temperature, power, and token
  throughput, collected per device rather than averaged across the box.
- **API keys with usage accounting.** Scope keys per deployment, rate-limit them,
  and see request counts, latency, and token spend per key.
- **RAG pipeline.** Upload documents, chunk and embed them, and query them
  through the same gateway.
- **Alerting and channels.** Route deployment and spend alerts to email, Slack,
  Discord, or a webhook.
- **Teams.** Multi-user with roles, invitations, 2FA, and an audit log.

## Requirements

|                | Minimum                                          |
| -------------- | ------------------------------------------------ |
| OS             | Linux with Docker (Ubuntu 22.04+ tested)         |
| RAM            | 4 GB for the panel itself                        |
| GPU            | NVIDIA + drivers, for local inference            |
| Cloud instead  | A RunPod or Vast.ai API key — no local GPU needed |

The panel runs fine on a small CPU-only VPS if every deployment targets a cloud
GPU provider.

## Installation

With no environment variables you get a plain-HTTP install on ports 3000 and
8000. To get TLS on your own domain, set them:

```bash
PANEL_DOMAIN=panel.example.com \
API_DOMAIN=api.example.com \
BASE_DOMAIN=example.com \
ACME_EMAIL=you@example.com \
CF_DNS_API_TOKEN=your-cloudflare-dns-token \
  curl -fsSL https://raw.githubusercontent.com/LLMPanel/llmpanel-oss/master/install.sh | sudo -E bash
```

`BASE_DOMAIN` gives each deployment its own hostname
(`qwen3-ab12cd34.example.com`), which needs a `*.example.com` DNS record pointing
at the host. `CF_DNS_API_TOKEN` is required for wildcard certificates —
Let's Encrypt issues those only over the DNS-01 challenge.

Every option lives in [`.env.example`](.env.example), and the installer writes a
real `.env` to `/data/llmpanel`.

To upgrade:

```bash
cd /data/llmpanel && docker compose pull && docker compose up -d
```

## Development

Requires Node 20+, pnpm 10, and Docker.

```bash
pnpm install
cp .env.example .env          # then fill in BETTER_AUTH_SECRET and ENCRYPTION_KEY
pnpm --filter @llmpanel/db db:migrate
pnpm dev                      # web on :3000, api on :8000
```

Generate both secrets with `openssl rand -hex 32`.

After editing anything under `packages/db/src/schema/`, generate a migration:

```bash
pnpm --filter @llmpanel/db db:generate
```

Never run `drizzle-kit push` against a database the API will boot against. Push
writes schema changes straight to the database without recording them in the
`__drizzle_migrations` ledger, so the next startup replays migrations that were
already applied and fails with `table ... already exists`.

## Architecture

```
apps/
  web/        Next.js 15 App Router dashboard — Shadcn UI, TanStack Query, Better Auth
  api/        Hono API — Drizzle ORM, SSE for live status, the inference gateway
packages/
  db/         Drizzle schema and connection (libsql / SQLite)
  providers/  GPU provider abstraction — Docker, RunPod, Vast.ai
  shared/     Zod schemas, types, constants shared by both apps
  ui/         Shared component primitives
infra/
  kms-worker/ Optional Cloudflare Worker that holds the encryption key off-host
```

The API returns immediately and provisions in the background; the dashboard
follows progress over SSE. Deletes are soft everywhere — records are marked
inactive, never dropped.

Deeper documentation lives in [`docs/`](docs/), starting with
[`docs/01-overview.md`](docs/01-overview.md).

## Security

Provider credentials are encrypted at rest with AES-256-GCM, keyed by HKDF-SHA256
from `ENCRYPTION_KEY`. The API refuses to start in production without it. If you
would rather the key never sat on the host at all, deploy
[`infra/kms-worker`](infra/kms-worker/) and set `KMS_URL` and `KMS_TOKEN` instead
— the key is then fetched at boot, held in memory only, and revocable.

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please do not open a
public issue for one.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how this
repository is maintained (it is a mirror of a private monorepo, which changes the
workflow slightly) and what a good pull request looks like.

## License

[GNU AGPL v3](LICENSE).

You can run, modify, and self-host LLMPanel freely, including commercially. If
you modify it and offer it to others over a network, the AGPL requires you to
publish your modified source. A managed LLMPanel service is available at
[llmpanel.io](https://llmpanel.io) for teams who would rather not host it.

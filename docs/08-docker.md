# 08 — Docker & Install Script

> The compose files and installer live in the repo root. This page explains them;
> it is not the source of truth. See `docker-compose.yml` and `install.sh`.

## Install

```bash
# Plain HTTP on :3000 / :8000 — no domain needed
curl -fsSL https://raw.githubusercontent.com/LLMPanel/llmpanel-oss/master/install.sh | sudo bash

# With a domain, TLS, and per-deployment subdomains
curl -fsSL https://raw.githubusercontent.com/LLMPanel/llmpanel-oss/master/install.sh | sudo \
  PANEL_DOMAIN=panel.example.com \
  API_DOMAIN=api.example.com \
  BASE_DOMAIN=example.com \
  ACME_EMAIL=you@example.com \
  CF_DNS_API_TOKEN=xxxx \
  bash
```

The variables go after `sudo`. Written in front of `curl`, they would reach only
curl, never the bash on the other side of the pipe.

Configuration is passed as environment variables, never prompted for: when the
script is piped from curl, stdin is the script itself, so there is nothing to
read answers from. Coolify writes a `.env` and asks you to edit it for the same
reason.

Re-running the installer is the upgrade path. It pulls the newest images,
re-downloads the compose files (a copy that changed is kept as `.bak.<time>`), and
keeps the secrets and every setting already in `.env` unless a new value is passed.
`LLMPANEL_KEEP_FILES=1` keeps the compose files on disk untouched, and so does a
failed download; `LLMPANEL_RAW_BASE` points the downloads at a mirror.

Installs to `/data/llmpanel` (override with `LLMPANEL_DIR`).

## Layered compose files

`docker-compose.yml` publishes **no host ports**. `install.sh` selects an edge by
writing `COMPOSE_FILE` into `.env`:

| File | Role |
|------|------|
| `docker-compose.yml` | web + api, internal network only |
| `docker-compose.ports.yml` | plain HTTP on :3000 / :8000 |
| `docker-compose.traefik.yml` | Traefik :80/:443, TLS for panel + api |
| `docker-compose.traefik-wildcard.yml` | adds `*.BASE_DOMAIN` deployment routing |
| `docker-compose.gpu.yml` | injects the NVIDIA runtime into the api container |

## Images

Built by `.github/workflows/release.yml` and published to
`ghcr.io/llmpanel/llmpanel-{api,web}`. Both build from the **repo root** — they
need the pnpm workspace, not just their own app directory. `linux/amd64` only.
Nothing is compiled on the user's VPS.

## Key implementation notes

**The API is bundled, not `tsc`-compiled.**
The `@llmpanel/*` packages ship raw TypeScript (`"main": "src/index.ts"`), so
Node cannot load them. `apps/api/build.mjs` inlines them with esbuild and leaves
npm deps external. Consequence: every npm package the workspace code imports must
be a **production dependency of `apps/api`**, even if it is declared in
`packages/*`. That is why `dockerode`, `@libsql/client`, `graphql-request`, and
`otplib` appear there.

**Migrations run on API boot.**
`runMigrations()` is called before anything touches the database. `MIGRATIONS_DIR`
is set to an absolute path in the image, because the bundle has no source tree to
search.

**Deployment containers join the stack's network and publish no host port.**
The API inspects its own container (its hostname is the container ID), finds its
user-defined network (`llmpanel_llmpanel`), and creates each inference container on
it. The gateway, and the web container's chat route, reach the model as
`http://llmpanel-<deployment-id>:8000`. Nothing listens on the host, so a model is
only reachable through the gateway, which checks API keys. `DEPLOYMENT_NETWORK`
names the network outright when the lookup cannot work.

Containers created before v0.1.2 published a port on every interface and are
reached via `DEPLOYMENT_HOST=host.docker.internal`; both `api` and `web` carry the
`extra_hosts` host-gateway entry that makes that name resolve on Linux. Redeploying
such a model moves it onto the network and closes its port.

**Host ports, when used, come from Docker, not from a probe socket.**
With the API running straight on the host (`pnpm dev`), container names do not
resolve, so deployments publish a port on `127.0.0.1` instead. `allocateHostPort()`
asks the daemon which ports are taken: binding a probe socket would only describe
the caller's own network namespace. Ports are pinned for the container's lifetime
so they survive a restart — an auto-assigned port would be reallocated and strand
the endpoint stored in the database.

**Wildcard TLS requires DNS-01.**
Let's Encrypt issues wildcard certificates only over the DNS-01 challenge, and
Traefik cannot request a certificate for a `HostRegexp` rule at all — it has no
concrete domain list. Without `CF_DNS_API_TOKEN`, TLS covers the panel and API
only, and per-deployment subdomains are disabled.

**Traefik must be v3.6 or newer.**
Earlier releases pin the Docker API to v1.24, which Docker Engine 29 refuses
("client version 1.24 is too old"). The provider then discovers nothing and every
host gets Traefik's own plain-text 404 — while Traefik itself starts up clean.

**The API host must not be mistaken for a deployment.**
`API_DOMAIN` is normally a subdomain of `BASE_DOMAIN` (`api.example.com` under
`example.com`), so a naive `isDeploymentDomain()` matches the API's own hostname
and 404s every request to it. `domain.service.ts` excludes the panel and API
hostnames, derived from `PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` /
`BETTER_AUTH_BASE_URL`.

**Traefik needs no per-deployment labels.**
Coolify stamps Traefik labels on every app container and watches the Docker
socket. LLMPanel does not: `apps/api/src/index.ts` already routes deployment
subdomains internally by `Host` header, so the proxy has two static routes plus
one catch-all.

**GPU detection happens on the host.**
The API image is not a CUDA image. `install.sh` probes the host (`nvidia-smi`,
the Docker runtime registration, and a real `docker run --gpus all`) and writes
`GPU_AVAILABLE`. When false, Local Docker deployments run on the CPU instead of
failing deep inside `docker run --gpus` at deploy time — see below.

**No GPU means llama.cpp on the CPU.**
On a host without a GPU, `GET /api/v1/system/gpu` also returns the host's CPU
cores and free RAM, and the wizard's third step becomes "CPU & RAM". The API
stores the deployment with `inferenceEngine: "llamacpp"`, `gpuType: "cpu"` and
the model's GGUF repo (the registry's `gguf` quantization `huggingfaceId`) as
`huggingfaceId`. The container is `ghcr.io/ggml-org/llama.cpp:server-<build>`,
pinned in `docker.client.ts`; it pulls the repo's Q4_K_M file on first start
into the shared `llmpanel-llamacpp-cache` volume. Only models whose `gguf` repo
name says GGUF can be picked, and the API refuses a deploy whose estimated RAM
(`estimateCpuRamGb` in `@llmpanel/shared`) exceeds the host's free RAM. Metrics
come from `docker stats` (CPU %, memory %), not `nvidia-smi`. The server runs
with `--reasoning-format none`, so a thinking model streams its thoughts as
ordinary content, as vLLM does; the panel's chat has no `reasoning_content`
support and would otherwise show nothing until the thinking ends.

## Key Architecture Decisions

**Why Hono not Next.js API routes?**
Long-running processes (model downloads, SSE) need a persistent server. Next.js API routes are serverless-style. Hono runs as a proper Node.js server.

**Why SQLite not Postgres?**
Zero external dependencies for self-hosted. Drizzle supports both — swap to Turso/Postgres by changing `DATABASE_URL`. SQLite handles thousands of req/sec easily.

**Why SSE not WebSockets?**
SSE is one-directional server→client (perfect for status updates). Built into Hono natively. Works through standard HTTP proxies.

**Why Next.js proxy for API calls?**
Solves cookie forwarding between Next.js (:3000) and Hono (:8000) in dev. In production, same domain = no proxy needed.

**Why Docker container per deployment?**
Full isolation. Easy to stop/start/restart individual models. vLLM handles GPU memory within its container. Docker overhead is near-zero on Linux.

**Why vLLM only (v1)?**
Both vLLM and SGLang expose OpenAI-compatible API. SGLang = add new IInferenceEngine class later. Ship v1 clean and fast.

**Why provider abstraction layer?**
New GPU provider = new class implementing IGPUProvider. Nothing else changes. Testable with mock providers.

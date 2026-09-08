# LLMPanel KMS Worker

Holds the credential-encryption master key in a Cloudflare Worker secret so it
never sits on the API host's disk. The API fetches the key **once at boot**
(`POST /v1/key`) and holds it in memory only.

What this buys you over `ENCRYPTION_KEY` in `.env`:

- A stolen disk, `.env` file, or backup no longer contains the key.
- Access is **revocable**: rotate `AUTH_TOKEN` and any stolen credentials stop
  working at the next boot attempt.
- Every key release and denied attempt is **audited** (`wrangler tail`, or
  Workers Logs in the dashboard).
- Optional IP pinning: with `ALLOWED_IPS` set, even a stolen `KMS_TOKEN` is
  useless from anywhere but your VPS.

Honest limit: an attacker with live code execution on the VPS can still trigger
a key fetch while the token is valid — same as AWS KMS / Azure Key Vault. The
win is shrinking "permanent offline copy of the key" down to "access only while
the breach is live and the token unrevoked".

## Setup

All commands run from this directory (`infra/kms-worker`).

1. Install and log in (opens a browser for Cloudflare OAuth):

```bash
npm install
```

```bash
npx wrangler login
```

2. Set the two secrets. Each command prompts for the value on stdin:

   - `MASTER_KEY` — paste your **current** `ENCRYPTION_KEY` value from the
     server's `.env` (do NOT generate a new one — existing credentials are
     encrypted with it). On the VPS: `grep '^ENCRYPTION_KEY=' .env`
   - `AUTH_TOKEN` — a fresh random token; generate with `openssl rand -hex 32`
     and keep a copy for step 4.

```bash
npx wrangler secret put MASTER_KEY
```

```bash
npx wrangler secret put AUTH_TOKEN
```

3. (Recommended) Pin to your VPS IP, then deploy:

   Add the address to `wrangler.jsonc` as a plain var, e.g.
   `"vars": { "ALLOWED_IPS": "203.0.113.7" }` — or set it later in the
   dashboard under the worker's Variables. Leave unset to disable the check.

```bash
npx wrangler deploy
```

   The deploy output prints the worker URL (`https://llmpanel-kms.<your-subdomain>.workers.dev`).

4. On the API host, edit `.env`: **remove** the `ENCRYPTION_KEY` value and add

   ```
   KMS_URL=https://llmpanel-kms.<your-subdomain>.workers.dev
   KMS_TOKEN=<the AUTH_TOKEN from step 2>
   ```

   then restart (`docker compose up -d`). Boot logs should show
   `Encryption key loaded from KMS`.

## Operations

- **Watch the audit log:** `npx wrangler tail` — every release logs
  `{"event":"kms.release","ip":...}`; denials log `kms.denied` with a reason.
- **Kill switch / rotate access:** `npx wrangler secret put AUTH_TOKEN` with a
  new value, then update `KMS_TOKEN` on the API host. Old token is dead
  immediately.
- **Never lose MASTER_KEY.** It still decrypts every stored credential. Keep
  an offline backup (password manager). Cloudflare secrets are write-only —
  you cannot read it back out of the worker.

## Endpoint

```
POST /v1/key
Authorization: Bearer <AUTH_TOKEN>

200 → {"key": "<MASTER_KEY>"}
401 → bad/missing token     403 → caller IP not in ALLOWED_IPS
```

import { z } from "zod"

export const env = {
  NODE_ENV: (process.env.NODE_ENV ?? "development") as
    | "development"
    | "production"
    | "test",
  DEPLOYMENT_MODE: (process.env.DEPLOYMENT_MODE ?? "self-hosted") as "self-hosted" | "cloud",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /**
   * Which transactional-email provider to use. Unset → auto: Resend when
   * RESEND_API_KEY is set, else Cloudflare when its two vars are set, else
   * email features stay disabled. `||` not `??`: docker-compose passes "".
   */
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || undefined) as
    | "resend"
    | "cloudflare"
    | undefined,
  /** Resend API key for transactional email (sign-up OTP, 2FA OTP, password reset). */
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  /**
   * Cloudflare Email Sending (REST API). Needs the account ID and an API token
   * with the Email Sending permission; EMAIL_FROM must be on a domain that has
   * been onboarded with `wrangler email sending enable <domain>`.
   */
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || undefined,
  CLOUDFLARE_EMAIL_API_TOKEN: process.env.CLOUDFLARE_EMAIL_API_TOKEN || undefined,
  /**
   * From address for outgoing email. Must be on a domain verified in Resend;
   * the resend.dev default only works for testing to your own address.
   * `||` not `??`: docker-compose passes "" when unset, which must still default.
   */
  EMAIL_FROM: process.env.EMAIL_FROM || "LLMPanel <onboarding@resend.dev>",
  BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
  /** Set to "true" in dev to mock nvidia-smi with a fake 16 GB GPU */
  MOCK_GPU: process.env.MOCK_GPU === "true",
  /**
   * Whether the *host* has a usable NVIDIA GPU. Written by install.sh, which can
   * probe the host directly — this container only sees nvidia-smi when the NVIDIA
   * container runtime injects it. An explicit "false" lets the UI say "no GPU
   * detected" up front instead of letting a self-hosted deploy fail inside Docker.
   */
  GPU_AVAILABLE: process.env.GPU_AVAILABLE !== "false",
  /** Set to "true" on macOS / CI to simulate deployment without Docker */
  MOCK_DEPLOYMENT: process.env.MOCK_DEPLOYMENT === "true",
  /** Directory on the API host where generated images are written */
  IMAGE_OUTPUT_DIR: process.env.IMAGE_OUTPUT_DIR ?? "./generated-images",
  /** Directory on the API host where deployment backup snapshots are written */
  BACKUP_DATA_DIR: process.env.BACKUP_DATA_DIR ?? "./backup-data",
  /** Public base URL of this API, used to build absolute image URLs */
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? "http://localhost:8000",
  /**
   * Wildcard base domain used to auto-generate a routable hostname per deployment,
   * e.g. BASE_DOMAIN="llmpanel.example.com" yields "qwen3-ab12cd34.llmpanel.example.com".
   * Requires a wildcard DNS record (*.BASE_DOMAIN) pointing at this API host.
   */
  BASE_DOMAIN: process.env.BASE_DOMAIN ?? "llmpanel.local",
  /** Scheme used when advertising deployment domains to clients ("https" in production). */
  GATEWAY_PROTOCOL: (process.env.GATEWAY_PROTOCOL ?? "https") as "http" | "https",
  /**
   * Optional KMS worker (infra/kms-worker) that releases the credential-
   * encryption key at boot, so ENCRYPTION_KEY never sits on this host's disk.
   * When KMS_URL is set, KMS_TOKEN is required and ENCRYPTION_KEY may be unset.
   * `||` not `??`: docker-compose passes "" when unset.
   */
  KMS_URL: process.env.KMS_URL || undefined,
  KMS_TOKEN: process.env.KMS_TOKEN || undefined,
  /**
   * The model registry (ModelRegistry.md) the deployable-model catalog comes
   * from. Only the API talks to it — the dashboard reads it through
   * /api/v1/registry/models — so pointing this at your own copy of the registry
   * Worker changes the catalog for everyone on this install. Validated at
   * startup. `||` not `??`: docker-compose passes "" when unset.
   */
  MODEL_REGISTRY_URL: z
    .string()
    .url("MODEL_REGISTRY_URL must be an absolute URL, e.g. https://registry.llmpanel.io")
    .parse(process.env.MODEL_REGISTRY_URL || "https://registry.llmpanel.io")
    .replace(/\/+$/, ""),
  /**
   * Log request and response bodies (redacted) for debugging. Off by default:
   * bodies carry prompts, completions and freshly issued keys, and the default
   * log line — method, path, status, duration — is enough to follow traffic.
   */
  LOG_REQUEST_BODIES: process.env.LOG_REQUEST_BODIES === "true",
  /**
   * Which RunPod REST API the RunPod provider talks to. v2 is the default;
   * "v1" is the escape hatch while v2 is in public beta. REST v1 retires
   * 2026-12-01, after which this setting and the v1 code path go away.
   */
  RUNPOD_API_VERSION: (process.env.RUNPOD_API_VERSION === "v1" ? "v1" : "v2") as "v1" | "v2",
}

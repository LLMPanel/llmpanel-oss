import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto"

const ALGORITHM = "aes-256-gcm"

// ── v3 scheme (current) ──────────────────────────────────────────────
// Format:  "v3:<iv hex>:<tag hex>:<ciphertext hex>"
// Key:     HKDF-SHA256 over the FULL ENCRYPTION_KEY (min 32 chars), with a
//          domain-separation label naming the scheme.
// AAD:     every ciphertext is bound to its owning row via GCM associated
//          data ("<table>:<rowId>:<column>"), so an attacker with DB write
//          access cannot copy an encrypted credential into a row they
//          control and have the server decrypt it for them.
//
// v3 differs from v2 only in the HKDF label — which is enough to change the
// derived key, so the two are not interchangeable. Rows are carried over
// automatically by the boot sweep in credential-migration.service.ts.

const V3_PREFIX = "v3:"
const HKDF_INFO_V3 = "llmpanel-credentials-v3"

// ── v2 scheme (read-only) ────────────────────────────────────────────
// Identical construction under the project's former name. Kept solely so the
// boot sweep can decrypt existing rows and rewrite them as v3; nothing writes
// v2 any more. Safe to delete once every install has booted once on v3 — the
// sweep logs a count, and a `SELECT ... WHERE col NOT LIKE 'v3:%'` confirms it.

const V2_PREFIX = "v2:"
const HKDF_INFO_V2 = "openpanel-credentials-v2"

// ── pre-v2 (read-only) ───────────────────────────────────────────────
// No prefix, no AAD, key truncated to 32 chars and space-padded — which capped
// strength at 128 bits or far less. Also carried forward by the same sweep.

const MIN_KEY_LENGTH = 32

// Key material comes from one of two places:
//   1. The KMS worker (infra/kms-worker), injected at boot via setKeyMaterial()
//      — preferred, because the key never touches this host's disk.
//   2. The ENCRYPTION_KEY env var — fallback for self-hosted installs.
let kmsKeyMaterial: string | null = null

/** Inject key material fetched from the KMS worker at boot. */
export function setKeyMaterial(material: string): void {
  kmsKeyMaterial = material
  // Re-derive every scheme's key against the injected material.
  cachedV3Key = null
  cachedV2Key = null
}

/** True when key material is available from either the KMS or the env var. */
export function hasKeyMaterial(): boolean {
  return Boolean(kmsKeyMaterial ?? process.env.ENCRYPTION_KEY)
}

function getRawKey(): string {
  const key = kmsKeyMaterial ?? process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("No encryption key: set ENCRYPTION_KEY, or KMS_URL + KMS_TOKEN")
  }
  return key
}

/**
 * Fail fast on weak key material. Called from bootstrap so a misconfigured
 * production instance refuses to boot instead of silently space-padding a
 * short key into a guessable AES key (the legacy behavior).
 */
export function assertEncryptionKey(): void {
  const key = getRawKey()
  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters ` +
      `(got ${key.length}). Generate one with: openssl rand -hex 32`
    )
  }
}

let cachedV3Key: Buffer | null = null
let cachedV2Key: Buffer | null = null

function deriveKey(info: string): Buffer {
  const raw = getRawKey()
  if (raw.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters. ` +
      `Generate one with: openssl rand -hex 32`
    )
  }
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(raw, "utf8"), Buffer.alloc(0), info, 32)
  )
}

function getV3Key(): Buffer {
  cachedV3Key ??= deriveKey(HKDF_INFO_V3)
  return cachedV3Key
}

/** Read-only: only the boot sweep needs this, to carry v2 rows onto v3. */
function getV2Key(): Buffer {
  cachedV2Key ??= deriveKey(HKDF_INFO_V2)
  return cachedV2Key
}

/** Legacy derivation, kept only to decrypt pre-v2 rows during migration. */
function getLegacyKey(): Buffer {
  return Buffer.from(getRawKey().slice(0, 32).padEnd(32), "utf8")
}

/** AAD builders — one per encrypted column, so contexts can't drift or typo. */
export const aadFor = {
  providerApiKey: (rowId: string) => `provider_connections:${rowId}:api_key`,
  providerTotpSecret: (rowId: string) => `provider_connections:${rowId}:totp_secret`,
  agentExternalApiKey: (rowId: string) => `agents:${rowId}:external_api_key`,
  alertChannelConfig: (rowId: string) => `alert_channels:${rowId}:config`,
  channelConnectionConfig: (rowId: string) => `channel_connections:${rowId}:config`,
  ragQdrantApiKey: (rowId: string) => `rag_collections:${rowId}:qdrant_api_key`,
  ragExternalEmbeddingKey: (rowId: string) => `rag_collections:${rowId}:external_embedding_key`,
}

/**
 * True for ciphertext not written by the current scheme, and so due for
 * re-encryption by the boot sweep. Widening this is the whole mechanism for
 * rolling a scheme forward — credential-migration.service.ts iterates every
 * encrypted column and defers to this predicate.
 */
export function isLegacyCiphertext(ciphertext: string): boolean {
  return !ciphertext.startsWith(V3_PREFIX)
}

export async function encrypt(plaintext: string, context: string): Promise<string> {
  const iv = randomBytes(12) // 96-bit IV — the GCM-recommended size
  const cipher = createCipheriv(ALGORITHM, getV3Key(), iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${V3_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export async function decrypt(ciphertext: string, context: string): Promise<string> {
  // v3 and v2 share a format and differ only in the derived key, so they read
  // identically once the right key is chosen.
  for (const [prefix, key] of [
    [V3_PREFIX, getV3Key] as const,
    [V2_PREFIX, getV2Key] as const,
  ]) {
    if (!ciphertext.startsWith(prefix)) continue
    const [ivHex, tagHex, encryptedHex] = ciphertext.slice(prefix.length).split(":")
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, "hex"))
    decipher.setAAD(Buffer.from(context, "utf8"))
    decipher.setAuthTag(Buffer.from(tagHex, "hex"))
    return decipher.update(Buffer.from(encryptedHex, "hex")) + decipher.final("utf8")
  }

  // Pre-v2 format "iv:tag:ct" — no AAD, truncated/padded key. Rows are carried
  // forward by the startup sweep (credential-migration.service).
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":")
  const decipher = createDecipheriv(ALGORITHM, getLegacyKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return decipher.update(Buffer.from(encryptedHex, "hex")) + decipher.final("utf8")
}

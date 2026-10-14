// apps/api/src/lib/redact.ts
//
// Scrubs secrets from values before they reach a log line. Two nets: field
// names that hold secrets, and value shapes that are secret wherever they turn
// up — a key pasted into a free-text field or a URL still gets caught.

const REDACTED = "[REDACTED]"

/** Field names that hold secrets. Numbers and booleans under them are kept. */
const SECRET_FIELD =
  /secret|token|password|passwd|credential|authorization|cookie|api_?key|webhook_?url|private_?key|signature|totp|backup_?codes|access_?key/i

/** Short names matched exactly — as substrings they would catch too much. */
const SECRET_FIELD_EXACT = new Set(["key", "pin"])

/**
 * One-time codes arrive as "otp" or "code". Only short values containing a
 * digit count, so error codes such as "plan_limit_reached" stay readable.
 */
const ONE_TIME_CODE_FIELD = new Set(["otp", "code"])
const ONE_TIME_CODE = /^(?=.*\d)[A-Za-z0-9-]{4,12}$/

const SECRET_VALUES: RegExp[] = [
  /gpup_sk_[A-Za-z0-9]+/g, // LLMPanel gateway and agent keys
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style keys
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, // Authorization header values
  /otpauth:\/\/[^\s"']+/g, // TOTP enrolment URIs carry the seed
  /\bhf_[A-Za-z0-9]{20,}/g, // Hugging Face tokens
  /\brpa_[A-Za-z0-9]{20,}/g, // RunPod keys
  /\bre_[A-Za-z0-9_]{20,}/g, // Resend keys
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bpolar_[a-z]{2,4}_[A-Za-z0-9]{16,}/g, // payment-provider access tokens (polar_oat_, polar_pat_, …)
  /\bwhsec_[A-Za-z0-9+/=]{16,}/g, // webhook signing secrets
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

/** `text` with every secret-shaped substring replaced. */
export function redactText(text: string): string {
  return SECRET_VALUES.reduce((out, pattern) => out.replace(pattern, REDACTED), text)
}

/** The value of a field whose name marks it secret. */
function redactSecretField(value: unknown): unknown {
  if (value == null || value === "" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  // A list of plain strings (backup codes, say) is secret as a whole; anything
  // structured is walked, so e.g. an `apiKey` record keeps its id and name.
  if (typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) {
    return REDACTED
  }
  return redact(value)
}

/** A deep copy of `value` with secret fields and secret-shaped strings replaced. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value)
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, v]) => {
        const lower = name.toLowerCase()
        if (SECRET_FIELD.test(name) || SECRET_FIELD_EXACT.has(lower)) return [name, redactSecretField(v)]
        if (ONE_TIME_CODE_FIELD.has(lower) && typeof v === "string" && ONE_TIME_CODE.test(v)) {
          return [name, REDACTED]
        }
        return [name, redact(v)]
      })
    )
  }
  return value
}

// apps/api/src/services/email-policy.service.ts
//
// Who is allowed to register with which address. Three independent gates:
//
//   1. Disposable domains  — the open-source `disposable-email-domains` list
//                            (exact matches + wildcard suffixes), refreshed by
//                            bumping the package.
//   2. Deliverability      — the domain must publish MX records (or, per
//                            RFC 5321, at least an A/AAAA record). A domain
//                            that cannot receive mail can never pass the OTP.
//   3. One person, one     — sub-addresses (`ada+x@`) and Gmail dot variants
//      account               are folded into a canonical form so the same
//                            mailbox cannot own several accounts.
//
// DNS failures that are not a definitive "no such domain" fail OPEN: a resolver
// outage must not lock the sign-up page. The OTP step still proves ownership.
import { promises as dns } from "node:dns"
import { createRequire } from "node:module"
import { db } from "@llmpanel/db"
import * as schema from "@llmpanel/db/schema"
import { and, like, ne, or, type SQL } from "drizzle-orm"

/**
 * Synthetic domain for admin-created, username-only accounts (see
 * admin.route.ts). Never reachable by mail, so every gate skips it — and the
 * public sign-up form is not allowed to claim it (enforced in auth.ts).
 */
export const USERNAME_EMAIL_DOMAIN = "users.local"

export const isUsernameOnlyEmail = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`)

export type EmailPolicyCode = "invalid" | "disposable" | "undeliverable" | "alias_taken"

export class EmailPolicyError extends Error {
  constructor(
    public readonly code: EmailPolicyCode,
    message: string
  ) {
    super(message)
    this.name = "EmailPolicyError"
  }
}

// ── Parsing / normalization ─────────────────────────────────────────────────

export function splitEmail(email: string): { local: string; domain: string } | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!domain.includes(".") || /\s/.test(trimmed)) return null
  return { local, domain }
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"])

/**
 * Canonical mailbox identity. Lower-cases, strips a `+tag` sub-address on any
 * domain, and on Gmail also removes dots and folds googlemail.com → gmail.com,
 * since Gmail delivers all of those to one inbox.
 */
export function normalizeEmail(email: string): string {
  const parts = splitEmail(email)
  if (!parts) return email.trim().toLowerCase()

  let { local, domain } = parts
  const plus = local.indexOf("+")
  if (plus > 0) local = local.slice(0, plus)

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "")
    domain = "gmail.com"
  }

  return `${local}@${domain}`
}

// ── Gate 1: disposable domains ──────────────────────────────────────────────

// The lists are JSON. The API bundle leaves npm packages external, and Node's
// ESM loader refuses a bare JSON import without an import attribute — which
// tsx quietly allows in dev, so the failure only shows up in the built image.
// require() has no such rule.
const requireJson = createRequire(import.meta.url)
const disposableDomains = requireJson("disposable-email-domains") as string[]
const wildcardDomains = requireJson("disposable-email-domains/wildcard.json") as string[]

const DISPOSABLE = new Set<string>(disposableDomains)
const WILDCARD_SUFFIXES: readonly string[] = wildcardDomains

export function isDisposableDomain(domain: string): boolean {
  const host = domain.toLowerCase()

  // Exact match, or any parent domain (mail.tempmail.io → tempmail.io).
  const labels = host.split(".")
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE.has(labels.slice(i).join("."))) return true
  }

  return WILDCARD_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  )
}

// ── Gate 2: the domain can receive mail ─────────────────────────────────────

const resolver = new dns.Resolver({ timeout: 3000, tries: 2 })

const MX_CACHE_TTL_MS = 60 * 60 * 1000
const MX_CACHE_MAX = 5000
const mxCache = new Map<string, { deliverable: boolean; expiresAt: number }>()

const DEFINITIVE_DNS_ERRORS = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"])

function dnsErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined
}

/**
 * true  → MX (or fallback A/AAAA) records exist
 * false → the domain definitively has no mail service
 * null  → DNS could not answer (timeout, SERVFAIL, no network)
 */
export async function domainAcceptsMail(domain: string): Promise<boolean | null> {
  const host = domain.toLowerCase()
  const cached = mxCache.get(host)
  if (cached && cached.expiresAt > Date.now()) return cached.deliverable

  const remember = (deliverable: boolean): boolean => {
    if (mxCache.size >= MX_CACHE_MAX) mxCache.clear()
    mxCache.set(host, { deliverable, expiresAt: Date.now() + MX_CACHE_TTL_MS })
    return deliverable
  }

  try {
    const mx = await resolver.resolveMx(host)
    // RFC 7505 "null MX" (a single record whose exchange is ".") means "we do
    // not accept mail" — treat like no MX at all.
    const usable = mx.filter((r) => r.exchange && r.exchange !== "." && r.exchange !== "")
    if (usable.length > 0) return remember(true)
    if (mx.length > 0) return remember(false)
  } catch (err) {
    const code = dnsErrorCode(err)
    if (code && !DEFINITIVE_DNS_ERRORS.has(code)) return null
    // No MX record — fall through to the implicit-MX check below.
  }

  // RFC 5321 §5.1: with no MX, mail goes to the host's A/AAAA address.
  try {
    const a = await resolver.resolve4(host)
    if (a.length > 0) return remember(true)
  } catch (err) {
    const code = dnsErrorCode(err)
    if (code && !DEFINITIVE_DNS_ERRORS.has(code)) return null
  }
  try {
    const aaaa = await resolver.resolve6(host)
    if (aaaa.length > 0) return remember(true)
  } catch (err) {
    const code = dnsErrorCode(err)
    if (code && !DEFINITIVE_DNS_ERRORS.has(code)) return null
  }

  return remember(false)
}

// ── Gate 3: one mailbox, one account ────────────────────────────────────────

/**
 * Throws when another account already owns the same canonical mailbox.
 * Candidates are narrowed in SQL, then compared on the normalized form in JS,
 * so no extra column is needed. `excludeUserId` lets an existing user keep
 * their own address when the check runs on updates.
 */
export async function assertNotAliasOfExistingAccount(
  email: string,
  excludeUserId?: string
): Promise<void> {
  const parts = splitEmail(email)
  if (!parts) return
  const canonical = normalizeEmail(email)

  // Gmail dots can sit anywhere in the local part, so every Gmail address is
  // a candidate. Elsewhere only a `+tag` can differ, so the prefix narrows it.
  // (`_` in the LIKE pattern is a wildcard; that only widens the candidate
  // set, which the exact comparison below filters again.)
  const domainFilter: SQL | undefined = GMAIL_DOMAINS.has(parts.domain)
    ? or(
        like(schema.user.email, "%@gmail.com"),
        like(schema.user.email, "%@googlemail.com")
      )
    : like(schema.user.email, `${parts.local.split("+")[0]!}%@${parts.domain}`)

  const where = excludeUserId
    ? and(domainFilter, ne(schema.user.id, excludeUserId))
    : domainFilter

  const candidates = await db.query.user.findMany({
    where,
    columns: { id: true, email: true },
  })

  const clash = candidates.find((u) => normalizeEmail(u.email) === canonical)
  if (clash) {
    throw new EmailPolicyError(
      "alias_taken",
      "An account already exists for this mailbox. Sign in instead, or use a different email address."
    )
  }
}

// ── Composite check used at sign-up ─────────────────────────────────────────

/**
 * Rejects addresses that should never become an account: malformed,
 * disposable, or on a domain with no mail service. Username-only synthetic
 * addresses are exempt (they are created by admins, never by the public form).
 */
export async function assertEmailAllowed(email: string): Promise<void> {
  if (isUsernameOnlyEmail(email)) return

  const parts = splitEmail(email)
  if (!parts) {
    throw new EmailPolicyError("invalid", "Enter a valid email address.")
  }

  if (isDisposableDomain(parts.domain)) {
    throw new EmailPolicyError(
      "disposable",
      "Temporary or disposable email addresses are not allowed. Use your real email address."
    )
  }

  const deliverable = await domainAcceptsMail(parts.domain)
  if (deliverable === false) {
    throw new EmailPolicyError(
      "undeliverable",
      `${parts.domain} does not accept email. Check the address for typos.`
    )
  }
  if (deliverable === null) {
    console.warn(`[email-policy] DNS lookup for ${parts.domain} failed — allowing sign-up`)
  }
}

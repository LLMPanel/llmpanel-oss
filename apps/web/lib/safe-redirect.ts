export const DEFAULT_REDIRECT = "/dashboard"

/**
 * Narrows an attacker-controllable `?redirect=` value down to a same-origin path.
 *
 * `//evil.com` and `/\evil.com` are protocol-relative URLs that browsers happily
 * navigate off-site, so a leading slash alone is not enough to trust the value.
 */
export function safeRedirect(
  target: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT
): string {
  if (!target) return fallback
  if (!target.startsWith("/")) return fallback
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback
  return target
}

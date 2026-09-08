// Non-sensitive hint cookie for the static marketing site (llmpanel.io): it
// can't read the httpOnly Better Auth session, so the dashboard drops this
// readable flag on the parent domain to switch its navbar between "Sign in"
// and "Dashboard". Carries no auth value — the session cookie stays httpOnly.
const COOKIE_NAME = "llmpanel_signed_in"

// Scope to .llmpanel.io in production so llmpanel.io can read it; on localhost
// or other hosts a Domain attribute for llmpanel.io would be rejected, so omit
// it and the cookie stays first-party (harmless, just unused).
function domainAttribute(): string {
  const host = globalThis.location?.hostname ?? ""
  return host === "llmpanel.io" || host.endsWith(".llmpanel.io")
    ? "; Domain=.llmpanel.io"
    : ""
}

export function setSignedInHint(): void {
  document.cookie = `${COOKIE_NAME}=1${domainAttribute()}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function clearSignedInHint(): void {
  document.cookie = `${COOKIE_NAME}=${domainAttribute()}; Path=/; Max-Age=0; SameSite=Lax`
}

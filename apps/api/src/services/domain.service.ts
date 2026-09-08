import { env } from "../env"

/**
 * Turn an arbitrary model identifier into a DNS-safe label.
 * "Qwen/Qwen3.5-0.8B" -> "qwen-qwen3-5-0-8b"
 */
function slugifyLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // collapse anything non-alphanumeric to a dash
    .replace(/^-+|-+$/g, "")     // trim leading/trailing dashes
    .slice(0, 40) || "model"     // DNS labels max 63 chars; keep room for the suffix
}

/**
 * Build a stable, unique, routable hostname for a deployment.
 *
 * Format: `<model-slug>-<short-id>.<BASE_DOMAIN>`
 * The short id (first 8 chars of the deployment UUID) guarantees uniqueness even
 * when two deployments use the same model.
 */
export function buildDeploymentDomain(modelSlug: string, deploymentId: string): string {
  const label = slugifyLabel(modelSlug)
  const shortId = deploymentId.replace(/-/g, "").slice(0, 8)
  return `${label}-${shortId}.${env.BASE_DOMAIN}`
}

/** Full client-facing URL for a deployment domain, e.g. "https://qwen3-ab12cd34.llmpanel.local". */
export function deploymentDomainUrl(domain: string): string {
  return `${env.GATEWAY_PROTOCOL}://${domain}`
}

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Hosts that belong to LLMPanel itself and can never name a deployment.
 *
 * A typical install puts the API on `api.example.com` with BASE_DOMAIN
 * `example.com`, so the API's own hostname is a subdomain of the wildcard and
 * would otherwise be mistaken for a deployment — 404-ing every request to it.
 */
function reservedHosts(): Set<string> {
  return new Set(
    [
      hostnameOf(env.PUBLIC_API_URL),
      hostnameOf(env.NEXT_PUBLIC_APP_URL),
      hostnameOf(env.BETTER_AUTH_BASE_URL),
    ].filter((host): host is string => host !== null),
  )
}

/** True when an incoming Host header targets a deployment subdomain (not the API host itself). */
export function isDeploymentDomain(host: string): boolean {
  if (reservedHosts().has(host)) return false

  const suffix = `.${env.BASE_DOMAIN.toLowerCase()}`
  return host.endsWith(suffix) && host.length > suffix.length
}

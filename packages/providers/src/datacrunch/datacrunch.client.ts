// DataCrunch (now "Verda Cloud") API client.
//
// Auth is OAuth2 client-credentials — there is no simple API key — so the
// stored credential is a composite "client_id:client_secret". Access tokens
// last an hour; this client caches one per instance and refreshes early.

export const DATACRUNCH_API_BASE = "https://api.datacrunch.io/v1"

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

interface DataCrunchErrorBody {
  code?: string
  message?: string
}

export interface DataCrunchCredentials {
  clientId: string
  clientSecret: string
}

/** Split the stored "client_id:client_secret" credential. Neither half ever
 *  contains a colon, but split on the first one defensively. */
export function parseDataCrunchKey(apiKey: string): DataCrunchCredentials {
  const idx = apiKey.indexOf(":")
  if (idx < 1 || idx === apiKey.length - 1) {
    throw new Error(
      "DataCrunch credentials must be in the form CLIENT_ID:CLIENT_SECRET"
    )
  }
  return {
    clientId: apiKey.slice(0, idx).trim(),
    clientSecret: apiKey.slice(idx + 1).trim(),
  }
}

function describeError(status: number, text: string): string {
  let detail = text
  try {
    const parsed = JSON.parse(text) as DataCrunchErrorBody
    if (parsed.code) detail = `(${parsed.code}) ${parsed.message ?? ""}`.trim()
  } catch {
    // Non-JSON body — keep the raw text.
  }
  return `DataCrunch API error ${status}: ${detail}`
}

export class DataCrunchClient {
  private readonly creds: DataCrunchCredentials
  private token: string | null = null
  private tokenExpiresAt = 0

  constructor(apiKey: string) {
    // Parsing is deferred: the metrics controller builds providers with a
    // dummy key purely to read capabilities, so the constructor must not throw.
    let creds: DataCrunchCredentials
    try {
      creds = parseDataCrunchKey(apiKey)
    } catch {
      creds = { clientId: "", clientSecret: "" }
    }
    this.creds = creds
  }

  private async accessToken(): Promise<string> {
    // Refresh at ~80% of the hour-long TTL rather than on expiry.
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token
    if (!this.creds.clientId || !this.creds.clientSecret) {
      throw new Error("DataCrunch credentials must be in the form CLIENT_ID:CLIENT_SECRET")
    }

    const res = await fetch(`${DATACRUNCH_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
      }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(describeError(res.status, text))

    const body = JSON.parse(text) as TokenResponse
    this.token = body.access_token
    this.tokenExpiresAt = Date.now() + body.expires_in * 1000 * 0.8
    return this.token
  }

  async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.accessToken()
    const res = await fetch(`${DATACRUNCH_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const text = await res.text()
    if (!res.ok) throw new Error(describeError(res.status, text))
    if (!text) return undefined as T
    // Several creating endpoints return a bare quoted JSON string (the new id)
    // rather than an object — JSON.parse handles both.
    return JSON.parse(text) as T
  }
}

/** Instance types + pricing are public — no credentials needed. */
export async function fetchDataCrunchInstanceTypes<T>(): Promise<T> {
  const res = await fetch(`${DATACRUNCH_API_BASE}/instance-types`, {
    headers: { Accept: "application/json" },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(describeError(res.status, text))
  return JSON.parse(text) as T
}

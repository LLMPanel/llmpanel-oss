import { env } from "@/env"

async function proxyToHono(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const honoUrl = `${env.HONO_API_URL}${url.pathname}${url.search}`

  return fetch(honoUrl, {
    method: req.method,
    headers: req.headers,     // forwards cookies automatically
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error — duplex required for streaming request bodies
    duplex: "half",
  })
}

export const GET = proxyToHono
export const POST = proxyToHono
export const PUT = proxyToHono
export const DELETE = proxyToHono
export const PATCH = proxyToHono
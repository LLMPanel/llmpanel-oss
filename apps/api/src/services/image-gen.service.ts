import { db } from "@llmpanel/db"
import { imageGenerations } from "@llmpanel/db/schema"
import { saveBase64Image } from "./image-storage.service"

export interface ImageGenBody {
  prompt?: string
  negative_prompt?: string
  n?: number
  width?: number
  height?: number
  num_inference_steps?: number
  steps?: number // alias
  guidance_scale?: number
  seed?: number
  size?: string // "1024x1024"
  [key: string]: unknown
}

interface UpstreamImage {
  b64_json?: string
  url?: string
}

interface UpstreamResponse {
  created?: number
  model?: string
  data?: UpstreamImage[]
}

export interface GenerateContext {
  deployment: {
    id: string
    userId: string
    workspaceId: string | null
    endpoint: string | null
    huggingfaceId: string
  }
  body: ImageGenBody
  apiKeyId: string | null
}

export interface GenerateResult {
  ok: boolean
  status: number
  json: unknown
}

function parseSize(size?: string): { width?: number; height?: number } {
  if (!size || !size.includes("x")) return {}
  const [w, h] = size.toLowerCase().split("x")
  const width = Number(w)
  const height = Number(h)
  return {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
  }
}

/**
 * Run a text-to-image generation against a deployment's image server, persist
 * each returned image to disk, record it in the DB, and return an OpenAI-shaped
 * response whose `data[].url` points at the stored files.
 *
 * Shared by the API-key gateway route and the session-protected deployment route.
 */
export async function generateImages(ctx: GenerateContext): Promise<GenerateResult> {
  const { deployment, body, apiKeyId } = ctx

  if (!deployment.endpoint) {
    return { ok: false, status: 503, json: { error: { message: "Deployment endpoint not available" } } }
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return { ok: false, status: 400, json: { error: { message: "`prompt` is required" } } }
  }

  const start = Date.now()

  let upstream: Response
  try {
    upstream = await fetch(`${deployment.endpoint}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 503, json: { error: { message: "Failed to reach image server" } } }
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "")
    return {
      ok: false,
      status: upstream.status,
      json: { error: { message: `Image server error: ${text || upstream.statusText}` } },
    }
  }

  const data = (await upstream.json()) as UpstreamResponse
  const latencyMs = Date.now() - start

  const sizeFromString = parseSize(body.size)
  const width = body.width ?? sizeFromString.width ?? null
  const height = body.height ?? sizeFromString.height ?? null
  const steps = body.num_inference_steps ?? body.steps ?? null
  const guidanceScale = body.guidance_scale ?? null
  const seed = body.seed ?? null

  const images = Array.isArray(data.data) ? data.data : []
  const out: Array<{ url: string }> = []

  for (const img of images) {
    if (!img.b64_json) {
      // Already a URL from upstream — pass through without persisting.
      if (img.url) out.push({ url: img.url })
      continue
    }
    const saved = await saveBase64Image(img.b64_json, "png")
    out.push({ url: saved.url })

    await db.insert(imageGenerations).values({
      id: crypto.randomUUID(),
      userId: deployment.userId,
      workspaceId: deployment.workspaceId,
      deploymentId: deployment.id,
      apiKeyId,
      model: deployment.huggingfaceId,
      prompt: body.prompt,
      negativePrompt: body.negative_prompt ?? null,
      width,
      height,
      steps,
      guidanceScale,
      seed,
      filePath: saved.path,
      url: saved.url,
      latencyMs,
      createdAt: new Date(),
    })
  }

  return {
    ok: true,
    status: 200,
    json: {
      created: data.created ?? Math.floor(Date.now() / 1000),
      model: deployment.huggingfaceId,
      data: out,
    },
  }
}

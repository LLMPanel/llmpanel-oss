import { env } from "@/env"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as {
    deploymentId: string
    messages: { role: string; content: string }[]
    stream?: boolean
    system?: string
    temperature?: number
    max_tokens?: number
    top_p?: number
  }

  const {
    deploymentId,
    messages,
    stream = true,
    system,
    temperature,
    max_tokens,
    top_p,
  } = body

  // Prepend the system prompt when provided (and not already present).
  const outgoingMessages =
    system && system.trim() && messages[0]?.role !== "system"
      ? [{ role: "system", content: system }, ...messages]
      : messages

  // Fetch deployment info from Hono using session cookies
  const deploymentRes = await fetch(
    `${env.HONO_API_URL}/api/v1/deployments/${deploymentId}`,
    {
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
    }
  )

  if (!deploymentRes.ok) {
    return Response.json({ error: "Deployment not found" }, { status: 404 })
  }

  const deploymentData = (await deploymentRes.json()) as {
    deployment: {
      endpoint: string | null
      status: string
      huggingfaceId?: string
      model: { slug: string } | null
    }
  }

  const { deployment } = deploymentData

  if (deployment.status !== "running") {
    return Response.json(
      { error: `Deployment is ${deployment.status}, not running.` },
      { status: 503 }
    )
  }

  if (!deployment.endpoint) {
    // A deployment can report "running" before its inference endpoint has been
    // resolved (e.g. a RunPod pod without a public IP / port mapping yet). There
    // is nothing to forward to, so say so explicitly instead of a generic 503.
    return Response.json(
      {
        error:
          "This deployment has no reachable endpoint yet. It may still be starting up, or the pod never exposed its inference port. Try again shortly, or redeploy the model.",
      },
      { status: 503 }
    )
  }

  // Forward to the inference engine
  let inferenceRes: Response
  try {
    inferenceRes = await fetch(`${deployment.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: deployment.model?.slug ?? deployment.huggingfaceId,
        messages: outgoingMessages,
        stream,
        // Sampling params — only forward when explicitly provided so we keep
        // the engine defaults otherwise.
        ...(temperature != null ? { temperature } : {}),
        ...(max_tokens != null ? { max_tokens } : {}),
        ...(top_p != null ? { top_p } : {}),
        // Ask the OpenAI-compatible engine (vLLM / SGLang) to emit a final
        // usage chunk so the UI can show real prompt/completion token counts.
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      // @ts-expect-error — duplex required for streaming
      duplex: "half",
    })
  } catch (err) {
    // Connection refused / DNS / TLS — the endpoint is set but unreachable.
    return Response.json(
      {
        error: `Could not connect to the model at ${deployment.endpoint}: ${
          (err as Error).message
        }`,
      },
      { status: 502 }
    )
  }

  if (!inferenceRes.ok) {
    // Surface the engine's own error body so the UI can show what went wrong
    // (bad request, model not loaded, unsupported param, etc.).
    const detail = await inferenceRes.text().catch(() => "")
    return Response.json(
      {
        error: `Inference engine returned ${inferenceRes.status}`,
        detail: detail.slice(0, 500),
      },
      { status: inferenceRes.status }
    )
  }

  if (stream) {
    return new Response(inferenceRes.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  const data = await inferenceRes.json()
  return Response.json(data)
}

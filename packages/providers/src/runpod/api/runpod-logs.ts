import { runpodStreamV2 } from "../runpod.client"
import type { LogSource } from "../runpod.types"

/**
 * `GET /v2/pods/{id}/logs` — RunPod's SSE log stream.
 *
 * Lives outside both API implementations because v1 uses it too: the endpoint
 * is on the v2 host but authenticates with the same API key, and the pre-v2
 * provider already relied on it for host lifecycle events. When v1 is deleted
 * on 2026-12-01 this file stays.
 *
 * Frames look like:
 *
 *   id: 2026-08-18T14:43:48.546857847Z
 *   data: {"source":"container","line":"…","ts":"2026-08-18T14:43:48.546857847Z"}
 *
 * The `id` doubles as the resume cursor for `Last-Event-ID`.
 */

interface LogFrame {
  ts?: string
  source?: string
  line?: string
}

interface StreamParams {
  source?: LogSource
  /** History to replay before following. RunPod default 100, max 5000, 0 = live only. */
  tail?: number
  /** RFC3339 lower bound. Ignored upstream when `lastEventId` is set. */
  since?: string
  lastEventId?: string
  signal?: AbortSignal
}

function buildPath(podId: string, params: StreamParams): string {
  const query = new URLSearchParams()
  // Omitting `source` returns both container and system lines.
  if (params.source) query.set("source", params.source)
  if (params.tail !== undefined) query.set("tail", String(params.tail))
  if (params.since) query.set("since", params.since)
  const qs = query.toString()
  return `/v2/pods/${podId}/logs${qs ? `?${qs}` : ""}`
}

/**
 * Split an SSE byte stream into log lines.
 *
 * Events are separated by a blank line; a `data:` line carries the JSON
 * payload. Keep-alive comments and any non-JSON data are skipped rather than
 * surfaced to the log viewer.
 */
async function* parseFrames(
  res: Response,
): AsyncGenerator<{ line: string; id: string | null }> {
  // runpodStreamV2 guarantees a body.
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split("\n\n")
      buffer = events.pop() ?? ""

      for (const event of events) {
        let id: string | null = null
        let payload: LogFrame | null = null
        for (const raw of event.split("\n")) {
          if (raw.startsWith("id:")) {
            id = raw.slice(3).trim()
          } else if (raw.startsWith("data:")) {
            try {
              payload = JSON.parse(raw.slice(5).trim()) as LogFrame
            } catch {
              // Keep-alive or non-JSON data — skip.
            }
          }
        }
        if (payload?.line?.trim()) yield { line: payload.line, id }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Follow a pod's logs indefinitely.
 *
 * The generator ends when `signal` aborts or RunPod closes the stream; an
 * abort is a normal end, not an error.
 */
export async function* streamPodLogs(
  apiKey: string,
  podId: string,
  params: StreamParams = {},
): AsyncGenerator<string> {
  const res = await runpodStreamV2(apiKey, buildPath(podId, params), {
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
    ...(params.lastEventId !== undefined ? { lastEventId: params.lastEventId } : {}),
  })

  try {
    for await (const frame of parseFrames(res)) {
      yield frame.line
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return
    throw error
  }
}

/**
 * Read the backfill and stop.
 *
 * There is no non-streaming log endpoint, so a bounded read of the same SSE
 * stream stands in for one: collect until `tail` lines arrive, the stream goes
 * quiet, or the overall deadline passes — whichever comes first. RunPod
 * replays history as fast as it can, so the idle gap is what normally ends it.
 */
export async function fetchPodLogs(
  apiKey: string,
  podId: string,
  params: StreamParams & { idleMs?: number; timeoutMs?: number } = {},
): Promise<string[]> {
  const tail = params.tail ?? 500
  const idleMs = params.idleMs ?? 1500
  const timeoutMs = params.timeoutMs ?? 10_000

  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  params.signal?.addEventListener("abort", onOuterAbort, { once: true })
  const deadline = setTimeout(() => controller.abort(), timeoutMs)

  const lines: string[] = []
  let idle: ReturnType<typeof setTimeout> | undefined
  const resetIdle = () => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => controller.abort(), idleMs)
  }

  try {
    const res = await runpodStreamV2(apiKey, buildPath(podId, { ...params, tail }), {
      signal: controller.signal,
    })
    resetIdle()
    for await (const frame of parseFrames(res)) {
      lines.push(frame.line)
      if (lines.length >= tail) break
      resetIdle()
    }
  } catch (error) {
    // An abort here is the expected exit — the backfill simply ran dry. Any
    // lines already collected are still good, so only a genuine failure with
    // nothing to show is worth propagating.
    if ((error as Error).name !== "AbortError") {
      if (lines.length === 0) throw error
    }
  } finally {
    if (idle) clearTimeout(idle)
    clearTimeout(deadline)
    params.signal?.removeEventListener("abort", onOuterAbort)
    controller.abort()
  }

  return lines
}

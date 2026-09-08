// Client for the on-instance metrics/logs agent that VM providers install via
// cloud-init (see cloud-init.ts). Every VM provider talks to it the same way,
// so the polling, follow-mode bookkeeping and aggregation live here.

import { z } from "zod"
import type { GPUMetrics, SingleGPUMetrics } from "../types"
import { SingleGPUMetricsSchema } from "../types"
import { METRICS_AGENT_PORT } from "./agent-script"

export interface AgentLogResponse {
  lines?: string[]
  chunk?: string
  offset?: number
  size: number
}

async function agentFetch<T>(
  ip: string,
  token: string,
  path: string,
  timeoutMs: number,
  port: number = METRICS_AGENT_PORT,
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://${ip}:${port}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Agent responded ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Providers that NAT-forward to a randomly assigned external port pass it
 *  here; everyone else reaches the agent on its native port. */
export function fetchAgentLogs(
  ip: string,
  token: string,
  params: string,
  port?: number,
): Promise<AgentLogResponse> {
  return agentFetch<AgentLogResponse>(ip, token, `/logs?${params}`, 8000, port)
}

/** Per-GPU nvidia-smi readings. The instance is semi-trusted and this data
 *  flows into DB inserts, so the response is validated. */
export async function fetchAgentGpus(
  ip: string,
  token: string,
  port?: number,
): Promise<SingleGPUMetrics[]> {
  const body = await agentFetch<{ gpus?: unknown }>(ip, token, "/metrics", 4000, port)
  return z.array(SingleGPUMetricsSchema).parse(body.gpus ?? [])
}

/** Mean utilization/temperature, summed VRAM/power — mirrors the local provider. */
export function aggregateGpuMetrics(
  gpus: SingleGPUMetrics[],
  costPerHour: number | null,
): GPUMetrics {
  const count = gpus.length
  return {
    gpuCount: count,
    gpuUtilization: Math.round(gpus.reduce((s, g) => s + g.gpuUtilization, 0) / count),
    vramUsedGb: gpus.reduce((s, g) => s + g.vramUsedGb, 0),
    vramTotalGb: gpus.reduce((s, g) => s + g.vramTotalGb, 0),
    temperatureCelsius: Math.round(
      gpus.reduce((s, g) => s + (g.temperatureCelsius ?? 0), 0) / count,
    ),
    powerDrawWatts: gpus.reduce((s, g) => s + (g.powerDrawWatts ?? 0), 0),
    containerCpuPercent: null,
    containerMemoryPercent: null,
    uptimeSeconds: null,
    costPerHour,
    gpus,
  }
}

/**
 * Follow the engine log: emit recent context, then poll for new bytes from the
 * current end of file. A partial line at the end of a chunk is carried into
 * the next poll so lines are never split across events.
 */
export async function* streamAgentLogs(
  ip: string,
  token: string,
  label: string,
  port?: number,
): AsyncGenerator<string> {
  let offset = 0
  try {
    const head = await fetchAgentLogs(ip, token, "tail=200", port)
    for (const line of head.lines ?? []) yield line
    offset = head.size
  } catch {
    yield `[${label}] Waiting for the log agent to come up...`
  }

  let carry = ""
  let failures = 0
  while (true) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const body = await fetchAgentLogs(ip, token, `offset=${offset}`, port)
      failures = 0
      offset = body.offset ?? offset
      const text = carry + (body.chunk ?? "")
      const lines = text.split("\n")
      carry = lines.pop() ?? ""
      for (const line of lines) {
        if (line.trim()) yield line
      }
    } catch {
      failures++
      if (failures >= 5) {
        yield `[${label}] Lost connection to the log agent — stream stopped. The instance may have been terminated.`
        return
      }
    }
  }
}

/** Recent log lines, with provider-flavored fallbacks when the agent is unreachable. */
export async function fetchAgentLogLines(
  ip: string | null,
  token: string | null | undefined,
  tail: number,
  label: string,
  port?: number,
): Promise<string[]> {
  if (!token) {
    return [
      `[${label}] Container logs require the on-instance log agent. This deployment predates log capture — redeploy the model to enable logs.`,
    ]
  }
  if (!ip) {
    return [`[${label}] Instance has no public IP yet — logs appear once it finishes booting.`]
  }
  try {
    const body = await fetchAgentLogs(ip, token, `tail=${tail}`, port)
    return body.lines ?? []
  } catch {
    return [
      `[${label}] Log agent unreachable — the instance may still be booting or was terminated.`,
    ]
  }
}

export { METRICS_AGENT_PORT }

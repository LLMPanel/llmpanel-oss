import { z } from "zod"
import type { SingleGPUMetrics } from "../types"
import { SingleGPUMetricsSchema } from "../types"
import { METRICS_AGENT_PORT } from "../shared/agent-script"
import type { AgentLogResponse } from "../shared/agent-client"

/**
 * Talking to the in-pod metrics agent on RunPod.
 *
 * `shared/agent-client.ts` can't be reused as-is: VM providers reach the agent
 * at `http://<ip>:<port>`, but RunPod pods have no routable address (the ports
 * RunPod reports are CGNAT) and are only reachable through its HTTPS proxy.
 * The token is also sent twice, in case the proxy strips Authorization.
 */

export function runpodAgentUrl(podId: string, path: string): string {
  return `https://${podId}-${METRICS_AGENT_PORT}.proxy.runpod.net${path}`
}

async function agentFetch<T>(
  podId: string,
  token: string,
  path: string,
  timeoutMs: number,
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(runpodAgentUrl(podId, path), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-LLMPanel-Token": token,
      },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Metrics agent responded ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Per-GPU nvidia-smi readings — temperature, power, clocks, PCIe, ECC and true
 * VRAM, none of which the RunPod API reports at any version. The pod is
 * semi-trusted and this data flows into DB inserts, so it is validated.
 */
export async function fetchRunpodAgentGpus(
  podId: string,
  token: string | null | undefined,
): Promise<SingleGPUMetrics[]> {
  if (!token) throw new Error("Deployment has no metrics agent token")
  const body = await agentFetch<{ gpus?: unknown }>(podId, token, "/metrics", 4000)
  return z.array(SingleGPUMetricsSchema).parse(body.gpus ?? [])
}

/** Engine output the agent serves from the file the entrypoint tees into. v1 only. */
export function fetchRunpodAgentLogs(
  podId: string,
  token: string,
  params: string,
): Promise<AgentLogResponse> {
  return agentFetch<AgentLogResponse>(podId, token, `/logs?${params}`, 8000)
}

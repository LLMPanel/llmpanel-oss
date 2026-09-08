"use client"

import { useQuery } from "@tanstack/react-query"

export interface ContainerLogsResponse {
  lines: string[]
  externalId?: string
  providerType?: string
  status?: string
  message?: string
  error?: string
}

async function fetchContainerLogs(
  deploymentId: string,
  tail: number
): Promise<ContainerLogsResponse> {
  const res = await globalThis.fetch(
    `/api/v1/deployments/${deploymentId}/container-logs?tail=${tail}`,
    { credentials: "include" }
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<ContainerLogsResponse>
}

export function useContainerLogs(
  deploymentId: string,
  options: { tail?: number; enabled?: boolean; refetchInterval?: number | false } = {}
) {
  const { tail = 500, enabled = true, refetchInterval = false } = options

  const query = useQuery({
    queryKey: ["container-logs", deploymentId, tail],
    queryFn: () => fetchContainerLogs(deploymentId, tail),
    enabled,
    staleTime: 5_000,
    refetchInterval,
  })

  return {
    lines: query.data?.lines ?? [],
    providerType: query.data?.providerType ?? null,
    status: query.data?.status ?? null,
    externalId: query.data?.externalId ?? null,
    message: query.data?.message ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  }
}

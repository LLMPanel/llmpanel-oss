"use client"

import { useState, useEffect, useCallback } from "react"

// ── Types ───────────────────────────────────────────────────────────

export interface SnapshotIncludes {
  requestLogs: boolean
  metrics: boolean
  images: boolean
}

export interface SnapshotCounts {
  agents: number
  threads: number
  messages: number
  collections: number
  documents: number
  chunks: number
  apiKeys: number
  alertRules: number
  channels: number
  channelMessages: number
  requestLogs: number
  metricSamples: number
  images: number
}

export interface DeploymentBackup {
  id: string
  deploymentId: string
  name: string
  fileName: string
  sizeBytes: number
  version: number
  source: "manual" | "import"
  counts: Partial<SnapshotCounts>
  includes: Partial<SnapshotIncludes>
  createdAt: string
}

export interface RestoreResult {
  ok: true
  remapped: boolean
  agents: number
  threads: number
  messages: number
  collections: number
  documents: number
  chunks: number
  apiKeys: number
  apiKeysSkipped: number
  alertRules: number
  alertRulesSkipped: number
  channels: number
  channelMessages: number
  requestLogs: number
  metricSamples: number
  images: number
}

export interface CreateSnapshotOptions {
  name?: string
  requestLogs: boolean
  metrics: boolean
  images: boolean
}

// ── Actions ─────────────────────────────────────────────────────────

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}))
  throw new Error(
    typeof data.error === "string" && data.error ? data.error : fallback
  )
}

export async function createSnapshot(
  deploymentId: string,
  options: CreateSnapshotOptions
): Promise<DeploymentBackup> {
  const res = await globalThis.fetch(`/api/v1/backups/deployments/${deploymentId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  if (!res.ok) await parseError(res, "Failed to create backup")
  const data = await res.json()
  return data.backup as DeploymentBackup
}

export async function restoreSnapshot(backupId: string): Promise<RestoreResult> {
  const res = await globalThis.fetch(`/api/v1/backups/snapshots/${backupId}/restore`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) await parseError(res, "Failed to restore backup")
  return res.json()
}

export async function deleteSnapshot(backupId: string): Promise<void> {
  const res = await globalThis.fetch(`/api/v1/backups/snapshots/${backupId}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) await parseError(res, "Failed to delete backup")
}

export async function importSnapshot(
  deploymentId: string,
  file: File
): Promise<{ restore: RestoreResult; backup: DeploymentBackup }> {
  const form = new FormData()
  form.append("file", file)
  const res = await globalThis.fetch(
    `/api/v1/backups/deployments/${deploymentId}/import`,
    { method: "POST", credentials: "include", body: form }
  )
  if (!res.ok) await parseError(res, "Failed to import backup")
  return res.json()
}

export function snapshotDownloadUrl(backupId: string): string {
  return `/api/v1/backups/snapshots/${backupId}/download`
}

// ── List hook ───────────────────────────────────────────────────────

export function useDeploymentBackups(deploymentId: string) {
  const [backups, setBackups] = useState<DeploymentBackup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await globalThis.fetch(
        `/api/v1/backups/deployments/${deploymentId}`,
        { credentials: "include" }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Failed to load backups"
        )
      }
      const data = await res.json()
      setBackups(data.backups as DeploymentBackup[])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backups")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId])

  useEffect(() => {
    setIsLoading(true)
    void refetch()
  }, [refetch])

  return { backups, isLoading, error, refetch }
}

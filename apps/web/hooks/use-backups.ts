"use client"

import { useState, useCallback } from "react"

// ── Types ───────────────────────────────────────────────────────────

export interface S3BackupConfig {
  /** Optional custom endpoint for S3-compatible stores (MinIO, R2, …). */
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Optional key prefix/folder, e.g. "llmpanel-backups". */
  prefix?: string
}

export interface BackupResult {
  ok: true
  key: string
  size: number
  collections: number
  documents: number
  chunks: number
}

export interface RestoreResult {
  ok: true
  collectionsRestored: number
  collectionsSkipped: number
  documents: number
  chunks: number
}

// ── Action ──────────────────────────────────────────────────────────

export async function createBackup(
  config: S3BackupConfig
): Promise<BackupResult> {
  const res = await globalThis.fetch("/api/v1/backups", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to create backup")
  }
  return res.json()
}

export async function restoreBackup(
  config: S3BackupConfig & { key: string }
): Promise<RestoreResult> {
  const res = await globalThis.fetch("/api/v1/backups/restore", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to restore backup")
  }
  return res.json()
}

// ── Hooks ───────────────────────────────────────────────────────────

export function useCreateBackup() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const run = useCallback(async (config: S3BackupConfig) => {
    setIsSubmitting(true)
    try {
      return await createBackup(config)
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return { createBackup: run, isSubmitting }
}

export function useRestoreBackup() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const run = useCallback(async (config: S3BackupConfig & { key: string }) => {
    setIsSubmitting(true)
    try {
      return await restoreBackup(config)
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return { restoreBackup: run, isSubmitting }
}

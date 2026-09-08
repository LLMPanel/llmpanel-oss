// apps/api/src/controllers/backup.controller.ts
import type { Context } from "hono"
import { z } from "zod"
import { backupRagToS3, restoreRagFromS3 } from "../services/backup.service"
import { getWorkspaceId } from "../lib/workspace-context"

const s3ConfigSchema = z.object({
  endpoint: z.string().trim().url().optional().or(z.literal("")),
  region: z.string().trim().min(1, "Region is required"),
  bucket: z.string().trim().min(1, "Bucket is required"),
  accessKeyId: z.string().trim().min(1, "Access key ID is required"),
  secretAccessKey: z.string().trim().min(1, "Secret access key is required"),
  prefix: z.string().trim().optional(),
  forcePathStyle: z.boolean().optional(),
})

/**
 * POST /api/v1/backups
 * Exports all of the authenticated user's RAG data to S3 as a single JSON file.
 * S3 credentials are provided in the request body and used only in-memory.
 */
export const createBackup = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = s3ConfigSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid S3 configuration" },
      400
    )
  }

  const { endpoint, ...rest } = parsed.data

  try {
    const result = await backupRagToS3(workspaceId, {
      ...rest,
      endpoint: endpoint || undefined,
    })
    return c.json({ ok: true, ...result })
  } catch (err) {
    console.error("[backup] RAG backup to S3 failed:", err)
    const message =
      err instanceof Error ? err.message : "Failed to upload backup to S3"
    return c.json({ error: message }, 502)
  }
}

const restoreSchema = s3ConfigSchema.extend({
  key: z.string().trim().min(1, "Object key is required"),
})

/**
 * POST /api/v1/backups/restore
 * Downloads a RAG backup JSON from S3 (by object key) and restores it into the
 * authenticated user's account (upsert; collections with a missing deployment
 * are skipped).
 */
export const restoreBackup = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = restoreSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid restore request" },
      400
    )
  }

  const { endpoint, key, ...rest } = parsed.data

  try {
    const result = await restoreRagFromS3(
      user.id,
      workspaceId,
      { ...rest, endpoint: endpoint || undefined },
      key
    )
    return c.json({ ok: true, ...result })
  } catch (err) {
    console.error("[backup] RAG restore from S3 failed:", err)
    const message =
      err instanceof Error ? err.message : "Failed to restore backup from S3"
    return c.json({ error: message }, 502)
  }
}

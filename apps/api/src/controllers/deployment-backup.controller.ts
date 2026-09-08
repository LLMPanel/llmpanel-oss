// apps/api/src/controllers/deployment-backup.controller.ts
import type { Context } from "hono"
import { z } from "zod"
import {
  createDeploymentBackup,
  listDeploymentBackups,
  deleteDeploymentBackup,
  getDeploymentBackupFile,
  restoreDeploymentBackup,
  importDeploymentBackup,
} from "../services/deployment-backup.service"
import { getWorkspaceId } from "../lib/workspace-context"

/** Uploaded snapshot files larger than this are rejected. */
const MAX_IMPORT_BYTES = 512 * 1024 * 1024 // 512 MB

const notFound = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message === "Deployment not found" || err.message === "Backup not found")

const fail = (c: Context, err: unknown, fallback: string) => {
  console.error(`[backup] ${fallback}:`, err)
  if (notFound(err)) {
    return c.json({ error: (err as Error).message }, 404)
  }
  const message = err instanceof Error ? err.message : fallback
  return c.json({ error: message }, 500)
}

const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  requestLogs: z.boolean().optional().default(false),
  metrics: z.boolean().optional().default(false),
  images: z.boolean().optional().default(false),
})

/** POST /api/v1/backups/deployments/:deploymentId — create a snapshot. */
export const createSnapshot = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("deploymentId")

  let body: unknown = {}
  try {
    body = await c.req.json()
  } catch {
    // Empty body = default options.
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid backup options" },
      400
    )
  }

  try {
    const backup = await createDeploymentBackup(user.id, workspaceId, deploymentId, parsed.data)
    return c.json({ ok: true, backup }, 201)
  } catch (err) {
    return fail(c, err, "Failed to create backup")
  }
}

/** GET /api/v1/backups/deployments/:deploymentId — list snapshots. */
export const listSnapshots = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("deploymentId")

  try {
    const backups = await listDeploymentBackups(workspaceId, deploymentId)
    return c.json({ backups })
  } catch (err) {
    return fail(c, err, "Failed to list backups")
  }
}

/** GET /api/v1/backups/snapshots/:backupId/download — download the JSON file. */
export const downloadSnapshot = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const backupId = c.req.param("backupId")

  try {
    const { record, body } = await getDeploymentBackupFile(workspaceId, backupId)
    c.header("Content-Type", "application/json")
    c.header("Content-Disposition", `attachment; filename="${record.fileName}"`)
    return c.body(new Uint8Array(body))
  } catch (err) {
    return fail(c, err, "Failed to download backup")
  }
}

/** POST /api/v1/backups/snapshots/:backupId/restore — merge back into its deployment. */
export const restoreSnapshot = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const backupId = c.req.param("backupId")

  try {
    const result = await restoreDeploymentBackup(user.id, workspaceId, backupId)
    return c.json({ ok: true, ...result })
  } catch (err) {
    return fail(c, err, "Failed to restore backup")
  }
}

/** DELETE /api/v1/backups/snapshots/:backupId — soft-delete + remove the file. */
export const deleteSnapshot = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const backupId = c.req.param("backupId")

  try {
    await deleteDeploymentBackup(workspaceId, backupId)
    return c.json({ ok: true })
  } catch (err) {
    return fail(c, err, "Failed to delete backup")
  }
}

/** POST /api/v1/backups/deployments/:deploymentId/import — upload + restore a snapshot file. */
export const importSnapshot = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("deploymentId")

  let file: File | null = null
  try {
    const form = await c.req.formData()
    const entry = form.get("file")
    if (entry instanceof File) file = entry
  } catch {
    return c.json({ error: "Expected a multipart form upload" }, 400)
  }

  if (!file) {
    return c.json({ error: "No backup file provided" }, 400)
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return c.json({ error: "Backup file is too large (512 MB max)" }, 413)
  }

  try {
    const raw = await file.text()
    const result = await importDeploymentBackup(user.id, workspaceId, deploymentId, raw)
    return c.json({ ok: true, ...result })
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("not valid JSON") ||
        err.message.includes("not an LLMPanel") ||
        err.message.includes("Unsupported backup version") ||
        err.message.includes("unexpected format") ||
        err.message.includes("missing"))
    ) {
      return c.json({ error: err.message }, 400)
    }
    return fail(c, err, "Failed to import backup")
  }
}

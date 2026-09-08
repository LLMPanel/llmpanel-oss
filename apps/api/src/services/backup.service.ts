// apps/api/src/services/backup.service.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { db } from "@llmpanel/db"
import {
  ragCollections,
  ragDocuments,
  ragChunks,
  deployments,
} from "@llmpanel/db/schema"
import { eq, inArray } from "drizzle-orm"

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
  /** Needed for path-style endpoints like MinIO. Defaults to true when an endpoint is set. */
  forcePathStyle?: boolean
}

export interface RagBackupResult {
  key: string
  size: number
  collections: number
  documents: number
  chunks: number
}

/** The archive discriminator. New backups are written under the current name;
 *  the previous one is still accepted on restore, because archives taken before
 *  the rename to LLMPanel are on people's disks and must keep working. */
const BACKUP_TYPE = "llmpanel-rag-backup"
const LEGACY_BACKUP_TYPE = "openpanel-rag-backup"

/** Versioned envelope so the format can grow (chat, etc.) without breaking restores. */
interface RagBackupPayload {
  version: 1
  type: typeof BACKUP_TYPE | typeof LEGACY_BACKUP_TYPE
  createdAt: string
  workspaceId: string
  collections: unknown[]
  documents: unknown[]
  chunks: unknown[]
}

// ── Gather ──────────────────────────────────────────────────────────

/**
 * Collects all RAG data owned by a workspace (across every deployment) into a
 * single serializable payload. Encrypted credential fields are stripped — backups
 * never contain secrets. Chunk embeddings are kept so the backup is restorable.
 */
export async function gatherRagBackup(workspaceId: string): Promise<RagBackupPayload> {
  const collections = await db.query.ragCollections.findMany({
    where: eq(ragCollections.workspaceId, workspaceId),
  })

  const safeCollections = collections.map(
    ({ encryptedQdrantApiKey, encryptedExternalEmbeddingKey, ...rest }) => rest
  )

  const collectionIds = collections.map((c) => c.id)

  const documents =
    collectionIds.length > 0
      ? await db.query.ragDocuments.findMany({
          where: inArray(ragDocuments.collectionId, collectionIds),
        })
      : []

  const chunks =
    collectionIds.length > 0
      ? await db.query.ragChunks.findMany({
          where: inArray(ragChunks.collectionId, collectionIds),
        })
      : []

  return {
    version: 1,
    type: BACKUP_TYPE,
    createdAt: new Date().toISOString(),
    workspaceId,
    collections: safeCollections,
    documents,
    chunks,
  }
}

// ── Upload ──────────────────────────────────────────────────────────

function makeS3Client(config: S3BackupConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

/** Uploads a JSON payload to S3 (or any S3-compatible store) and returns the object key + size. */
export async function uploadJsonToS3(
  config: S3BackupConfig,
  fileName: string,
  payload: unknown
): Promise<{ key: string; size: number }> {
  const client = makeS3Client(config)

  const prefix = config.prefix?.replace(/^\/+|\/+$/g, "")
  const key = prefix ? `${prefix}/${fileName}` : fileName

  const body = Buffer.from(JSON.stringify(payload), "utf-8")

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  )

  return { key, size: body.byteLength }
}

// ── Orchestration ───────────────────────────────────────────────────

/** Gathers the workspace's RAG data and uploads it as a timestamped JSON backup. */
export async function backupRagToS3(
  workspaceId: string,
  config: S3BackupConfig
): Promise<RagBackupResult> {
  const payload = await gatherRagBackup(workspaceId)

  const stamp = payload.createdAt.replace(/[:.]/g, "-")
  const fileName = `rag-backup-${stamp}.json`

  const { key, size } = await uploadJsonToS3(config, fileName, payload)

  return {
    key,
    size,
    collections: payload.collections.length,
    documents: payload.documents.length,
    chunks: payload.chunks.length,
  }
}

// ── Restore ─────────────────────────────────────────────────────────

export interface RagRestoreResult {
  collectionsRestored: number
  collectionsSkipped: number
  documents: number
  chunks: number
}

type CollectionInsert = typeof ragCollections.$inferInsert
type DocumentInsert = typeof ragDocuments.$inferInsert
type ChunkInsert = typeof ragChunks.$inferInsert

/** Downloads and parses a backup JSON object from S3. */
async function downloadBackupFromS3(
  config: S3BackupConfig,
  key: string
): Promise<RagBackupPayload> {
  const client = makeS3Client(config)

  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key })
  )

  if (!res.Body) {
    throw new Error("Backup object is empty")
  }

  const raw = await res.Body.transformToString("utf-8")

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error("Backup file is not valid JSON")
  }

  return validateBackupPayload(data)
}

/** Structural validation of the backup envelope. */
function validateBackupPayload(data: unknown): RagBackupPayload {
  if (!data || typeof data !== "object") {
    throw new Error("Backup file has an unexpected format")
  }
  const obj = data as Record<string, unknown>
  if (obj.type !== BACKUP_TYPE && obj.type !== LEGACY_BACKUP_TYPE) {
    throw new Error("This file is not an LLMPanel RAG backup")
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(obj.version)}`)
  }
  if (
    !Array.isArray(obj.collections) ||
    !Array.isArray(obj.documents) ||
    !Array.isArray(obj.chunks)
  ) {
    throw new Error("Backup file is missing collections, documents or chunks")
  }
  return data as RagBackupPayload
}

/**
 * Restores a backup into the caller's workspace.
 * - Rows are re-owned to `workspaceId` (with `userId` as the restoring user) and
 *   upserted (insert or overwrite by id).
 * - Collections whose deployment no longer exists are skipped (FK-safe), along
 *   with their documents and chunks.
 */
export async function restoreRagFromS3(
  userId: string,
  workspaceId: string,
  config: S3BackupConfig,
  key: string
): Promise<RagRestoreResult> {
  const payload = await downloadBackupFromS3(config, key)

  // Only deployments in the caller's workspace are valid restore targets.
  const deps = await db.query.deployments.findMany({
    where: eq(deployments.workspaceId, workspaceId),
    columns: { id: true },
  })
  const validDeploymentIds = new Set(deps.map((d) => d.id))

  const rawCollections = payload.collections as Record<string, unknown>[]
  const rawDocuments = payload.documents as Record<string, unknown>[]
  const rawChunks = payload.chunks as Record<string, unknown>[]

  const keptCollections = rawCollections.filter((c) =>
    validDeploymentIds.has(String(c.deploymentId))
  )
  const keptIds = new Set(keptCollections.map((c) => String(c.id)))
  const collectionsSkipped = rawCollections.length - keptCollections.length

  const keptDocuments = rawDocuments.filter((d) =>
    keptIds.has(String(d.collectionId))
  )
  const keptChunks = rawChunks.filter((ch) => keptIds.has(String(ch.collectionId)))

  const toDate = (v: unknown): Date =>
    v instanceof Date ? v : new Date(v as string | number)

  const collectionRows: CollectionInsert[] = keptCollections.map((c) => ({
    ...(c as CollectionInsert),
    userId,
    workspaceId,
    createdAt: toDate(c.createdAt),
    updatedAt: toDate(c.updatedAt),
  }))

  const documentRows: DocumentInsert[] = keptDocuments.map((d) => ({
    ...(d as DocumentInsert),
    userId,
    workspaceId,
    createdAt: toDate(d.createdAt),
  }))

  const chunkRows: ChunkInsert[] = keptChunks.map((ch) => ({
    ...(ch as ChunkInsert),
    createdAt: toDate(ch.createdAt),
  }))

  await db.transaction(async (tx) => {
    for (const row of collectionRows) {
      await tx
        .insert(ragCollections)
        .values(row)
        .onConflictDoUpdate({ target: ragCollections.id, set: row })
    }
    for (const row of documentRows) {
      await tx
        .insert(ragDocuments)
        .values(row)
        .onConflictDoUpdate({ target: ragDocuments.id, set: row })
    }
    for (const row of chunkRows) {
      await tx
        .insert(ragChunks)
        .values(row)
        .onConflictDoUpdate({ target: ragChunks.id, set: row })
    }
  })

  return {
    collectionsRestored: collectionRows.length,
    collectionsSkipped,
    documents: documentRows.length,
    chunks: chunkRows.length,
  }
}

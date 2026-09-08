// apps/api/src/services/deployment-backup.service.ts
//
// Per-deployment snapshot backups: gathers everything tied to one deployment
// (agents, chat threads, RAG data, API keys, channels, alerts + optional
// logs/metrics/images) into a versioned JSON file on disk, with a browsable
// history in the deployment_backups table. Snapshots can be restored
// (merge/upsert), downloaded as a file, or imported into any deployment the
// user owns — importing into a different deployment remaps every row id.
//
// The zvec vector index is intentionally NOT part of a snapshot: rag_chunks
// rows carry the embeddings and zvec rebuilds itself lazily from SQLite, so
// after a restore we just drop the on-disk index for affected collections.

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises"
import path from "node:path"
import { db } from "@llmpanel/db"
import {
  deployments,
  deploymentBackups,
  agents,
  agentCollections,
  agentThreads,
  agentMessages,
  ragCollections,
  ragDocuments,
  ragChunks,
  apiKeys,
  alertRules,
  alertChannels,
  channelConnections,
  channelMessages,
  requestLogs,
  metricSamples,
  imageGenerations,
} from "@llmpanel/db/schema"
import { and, eq, desc, inArray, or } from "drizzle-orm"
import { env } from "../env"
import { destroyZvecCollection } from "./vector-store.service"

// ── Types ───────────────────────────────────────────────────────────

/** Optional heavyweight data toggles chosen when creating a backup. */
export interface DeploymentBackupIncludes {
  requestLogs: boolean
  metrics: boolean
  images: boolean
}

export interface DeploymentBackupCounts {
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

type Row = Record<string, unknown>

/** The archive discriminator. New backups are written under the current name;
 *  the previous one is still accepted on restore, because archives taken before
 *  the rename to LLMPanel are on people's disks and must keep working. */
const BACKUP_TYPE = "llmpanel-deployment-backup"
const LEGACY_BACKUP_TYPE = "openpanel-deployment-backup"

/** Versioned envelope so the format can grow without breaking restores. */
export interface DeploymentBackupPayload {
  version: 1
  type: typeof BACKUP_TYPE | typeof LEGACY_BACKUP_TYPE
  createdAt: string
  deployment: {
    id: string
    name: string | null
    huggingfaceId: string
    providerType: string
    modelType: string | null
  }
  includes: DeploymentBackupIncludes
  data: {
    agents: Row[]
    agentCollections: Row[]
    agentThreads: Row[]
    agentMessages: Row[]
    ragCollections: Row[]
    ragDocuments: Row[]
    ragChunks: Row[]
    apiKeys: Row[]
    alertRules: Row[]
    channelConnections: Row[]
    channelMessages: Row[]
    requestLogs: Row[]
    metricSamples: Row[]
    imageGenerations: Row[]
  }
}

export interface DeploymentBackupRecord {
  id: string
  deploymentId: string
  name: string
  fileName: string
  sizeBytes: number
  version: number
  source: string
  counts: DeploymentBackupCounts
  includes: DeploymentBackupIncludes
  createdAt: Date
}

export interface DeploymentRestoreResult {
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

// ── Helpers ─────────────────────────────────────────────────────────

const BACKUP_DIR = path.resolve(env.BACKUP_DATA_DIR)

async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true })
}

function backupFilePath(fileName: string): string {
  // fileName is server-generated, but never trust a stored value blindly
  const resolved = path.resolve(BACKUP_DIR, fileName)
  if (!resolved.startsWith(BACKUP_DIR + path.sep)) {
    throw new Error("Invalid backup file path")
  }
  return resolved
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string | number)
}

function toDateOrNull(v: unknown): Date | null {
  return v == null ? null : toDate(v)
}

function parseCounts(raw: string): DeploymentBackupCounts {
  try {
    return JSON.parse(raw) as DeploymentBackupCounts
  } catch {
    return {} as DeploymentBackupCounts
  }
}

function parseIncludes(raw: string): DeploymentBackupIncludes {
  try {
    return JSON.parse(raw) as DeploymentBackupIncludes
  } catch {
    return { requestLogs: false, metrics: false, images: false }
  }
}

function toRecord(row: typeof deploymentBackups.$inferSelect): DeploymentBackupRecord {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    name: row.name,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    version: row.version,
    source: row.source,
    counts: parseCounts(row.counts),
    includes: parseIncludes(row.includes),
    createdAt: row.createdAt,
  }
}

async function requireWorkspaceDeployment(workspaceId: string, deploymentId: string) {
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) {
    throw new Error("Deployment not found")
  }
  return deployment
}

async function requireWorkspaceBackup(workspaceId: string, backupId: string) {
  const record = await db.query.deploymentBackups.findFirst({
    where: and(
      eq(deploymentBackups.id, backupId),
      eq(deploymentBackups.workspaceId, workspaceId),
      eq(deploymentBackups.isActive, true)
    ),
  })
  if (!record) {
    throw new Error("Backup not found")
  }
  return record
}

// ── Gather ──────────────────────────────────────────────────────────

/** Collects everything tied to one deployment into a serializable payload. */
export async function gatherDeploymentBackup(
  workspaceId: string,
  deploymentId: string,
  includes: DeploymentBackupIncludes
): Promise<DeploymentBackupPayload> {
  const deployment = await requireWorkspaceDeployment(workspaceId, deploymentId)

  const agentRows = await db.query.agents.findMany({
    where: eq(agents.deploymentId, deploymentId),
  })
  const agentIds = agentRows.map((a) => a.id)

  const agentCollectionRows = agentIds.length
    ? await db.query.agentCollections.findMany({
        where: inArray(agentCollections.agentId, agentIds),
      })
    : []

  const threadRows = agentIds.length
    ? await db.query.agentThreads.findMany({
        where: inArray(agentThreads.agentId, agentIds),
      })
    : []
  const threadIds = threadRows.map((t) => t.id)

  const messageRows = threadIds.length
    ? await db.query.agentMessages.findMany({
        where: inArray(agentMessages.threadId, threadIds),
      })
    : []

  const collectionRows = await db.query.ragCollections.findMany({
    where: eq(ragCollections.deploymentId, deploymentId),
  })
  const collectionIds = collectionRows.map((c) => c.id)

  const documentRows = collectionIds.length
    ? await db.query.ragDocuments.findMany({
        where: inArray(ragDocuments.collectionId, collectionIds),
      })
    : []

  const chunkRows = collectionIds.length
    ? await db.query.ragChunks.findMany({
        where: inArray(ragChunks.collectionId, collectionIds),
      })
    : []

  // Keys scoped to this deployment, plus keys locked to one of its agents.
  const keyFilters = [eq(apiKeys.deploymentId, deploymentId)]
  if (agentIds.length) keyFilters.push(inArray(apiKeys.agentId, agentIds))
  const apiKeyRows = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.workspaceId, workspaceId), or(...keyFilters)),
  })

  const alertRuleRows = await db.query.alertRules.findMany({
    where: eq(alertRules.deploymentId, deploymentId),
  })

  const channelRows = await db.query.channelConnections.findMany({
    where: eq(channelConnections.deploymentId, deploymentId),
  })
  const channelIds = channelRows.map((c) => c.id)

  const channelMessageRows = channelIds.length
    ? await db.query.channelMessages.findMany({
        where: inArray(channelMessages.channelConnectionId, channelIds),
      })
    : []

  const requestLogRows = includes.requestLogs
    ? await db.query.requestLogs.findMany({
        where: eq(requestLogs.deploymentId, deploymentId),
      })
    : []

  const metricRows = includes.metrics
    ? await db.query.metricSamples.findMany({
        where: eq(metricSamples.deploymentId, deploymentId),
      })
    : []

  const imageRows = includes.images
    ? await db.query.imageGenerations.findMany({
        where: eq(imageGenerations.deploymentId, deploymentId),
      })
    : []

  return {
    version: 1,
    type: BACKUP_TYPE,
    createdAt: new Date().toISOString(),
    deployment: {
      id: deployment.id,
      name: deployment.name,
      huggingfaceId: deployment.huggingfaceId,
      providerType: deployment.providerType,
      modelType: deployment.modelType,
    },
    includes,
    data: {
      agents: agentRows as unknown as Row[],
      agentCollections: agentCollectionRows as unknown as Row[],
      agentThreads: threadRows as unknown as Row[],
      agentMessages: messageRows as unknown as Row[],
      ragCollections: collectionRows as unknown as Row[],
      ragDocuments: documentRows as unknown as Row[],
      ragChunks: chunkRows as unknown as Row[],
      apiKeys: apiKeyRows as unknown as Row[],
      alertRules: alertRuleRows as unknown as Row[],
      channelConnections: channelRows as unknown as Row[],
      channelMessages: channelMessageRows as unknown as Row[],
      requestLogs: requestLogRows as unknown as Row[],
      metricSamples: metricRows as unknown as Row[],
      imageGenerations: imageRows as unknown as Row[],
    },
  }
}

function countsOf(payload: DeploymentBackupPayload): DeploymentBackupCounts {
  const d = payload.data
  return {
    agents: d.agents.length,
    threads: d.agentThreads.length,
    messages: d.agentMessages.length,
    collections: d.ragCollections.length,
    documents: d.ragDocuments.length,
    chunks: d.ragChunks.length,
    apiKeys: d.apiKeys.length,
    alertRules: d.alertRules.length,
    channels: d.channelConnections.length,
    channelMessages: d.channelMessages.length,
    requestLogs: d.requestLogs.length,
    metricSamples: d.metricSamples.length,
    images: d.imageGenerations.length,
  }
}

// ── Create / list / delete / download ───────────────────────────────

export async function createDeploymentBackup(
  userId: string,
  workspaceId: string,
  deploymentId: string,
  options: { name?: string } & DeploymentBackupIncludes
): Promise<DeploymentBackupRecord> {
  const payload = await gatherDeploymentBackup(workspaceId, deploymentId, {
    requestLogs: options.requestLogs,
    metrics: options.metrics,
    images: options.images,
  })

  const id = crypto.randomUUID()
  const stamp = payload.createdAt.replace(/[:.]/g, "-")
  const fileName = `deployment-${deploymentId.slice(0, 8)}-${stamp}-${id.slice(0, 8)}.json`

  await ensureBackupDir()
  const body = Buffer.from(JSON.stringify(payload), "utf-8")
  await writeFile(backupFilePath(fileName), body)

  const name =
    options.name?.trim() ||
    `Backup ${new Date(payload.createdAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`

  const row: typeof deploymentBackups.$inferInsert = {
    id,
    deploymentId,
    userId,
    workspaceId,
    name,
    fileName,
    sizeBytes: body.byteLength,
    version: payload.version,
    source: "manual",
    counts: JSON.stringify(countsOf(payload)),
    includes: JSON.stringify(payload.includes),
    isActive: true,
    createdAt: new Date(payload.createdAt),
  }
  await db.insert(deploymentBackups).values(row)

  const inserted = await requireWorkspaceBackup(workspaceId, id)
  return toRecord(inserted)
}

export async function listDeploymentBackups(
  workspaceId: string,
  deploymentId: string
): Promise<DeploymentBackupRecord[]> {
  await requireWorkspaceDeployment(workspaceId, deploymentId)
  const rows = await db.query.deploymentBackups.findMany({
    where: and(
      eq(deploymentBackups.deploymentId, deploymentId),
      eq(deploymentBackups.workspaceId, workspaceId),
      eq(deploymentBackups.isActive, true)
    ),
    orderBy: desc(deploymentBackups.createdAt),
  })
  return rows.map(toRecord)
}

/** Soft-deletes the record and best-effort removes the snapshot file. */
export async function deleteDeploymentBackup(
  workspaceId: string,
  backupId: string
): Promise<void> {
  const record = await requireWorkspaceBackup(workspaceId, backupId)
  await db
    .update(deploymentBackups)
    .set({ isActive: false })
    .where(eq(deploymentBackups.id, record.id))
  try {
    await unlink(backupFilePath(record.fileName))
  } catch {
    // File already gone — the record is soft-deleted either way.
  }
}

export async function getDeploymentBackupFile(
  workspaceId: string,
  backupId: string
): Promise<{ record: DeploymentBackupRecord; body: Buffer }> {
  const record = await requireWorkspaceBackup(workspaceId, backupId)
  const body = await readFile(backupFilePath(record.fileName))
  return { record: toRecord(record), body }
}

// ── Validation ──────────────────────────────────────────────────────

const DATA_KEYS: (keyof DeploymentBackupPayload["data"])[] = [
  "agents",
  "agentCollections",
  "agentThreads",
  "agentMessages",
  "ragCollections",
  "ragDocuments",
  "ragChunks",
  "apiKeys",
  "alertRules",
  "channelConnections",
  "channelMessages",
  "requestLogs",
  "metricSamples",
  "imageGenerations",
]

/** Structural validation of the snapshot envelope. */
export function validateDeploymentBackupPayload(data: unknown): DeploymentBackupPayload {
  if (!data || typeof data !== "object") {
    throw new Error("Backup file has an unexpected format")
  }
  const obj = data as Record<string, unknown>
  if (obj.type !== BACKUP_TYPE && obj.type !== LEGACY_BACKUP_TYPE) {
    throw new Error("This file is not an LLMPanel deployment backup")
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(obj.version)}`)
  }
  const deployment = obj.deployment as Record<string, unknown> | undefined
  if (!deployment || typeof deployment.id !== "string") {
    throw new Error("Backup file is missing deployment metadata")
  }
  const payloadData = obj.data as Record<string, unknown> | undefined
  if (!payloadData) {
    throw new Error("Backup file is missing its data section")
  }
  for (const key of DATA_KEYS) {
    // Missing sections from older/partial exports are treated as empty.
    if (payloadData[key] == null) payloadData[key] = []
    if (!Array.isArray(payloadData[key])) {
      throw new Error(`Backup section "${key}" has an unexpected format`)
    }
  }
  return data as DeploymentBackupPayload
}

// ── Restore ─────────────────────────────────────────────────────────

/**
 * Merges a snapshot payload into `targetDeploymentId` (owned by `workspaceId`).
 * - Same deployment: rows are upserted with their original ids.
 * - Different deployment (import): every row id is regenerated and all
 *   references are remapped, so the source deployment is never touched.
 * - Rows are re-owned to the caller's workspace (with the restoring user kept
 *   as "created by"). Dangling references (missing alert channels, foreign
 *   agents/collections) are skipped or nulled.
 */
export async function restoreDeploymentBackupPayload(
  userId: string,
  workspaceId: string,
  targetDeploymentId: string,
  payload: DeploymentBackupPayload
): Promise<DeploymentRestoreResult> {
  await requireWorkspaceDeployment(workspaceId, targetDeploymentId)

  const remap = payload.deployment.id !== targetDeploymentId
  const idMap = new Map<string, string>()
  const mapId = (old: unknown): string => {
    const key = String(old)
    if (!remap) return key
    let mapped = idMap.get(key)
    if (!mapped) {
      mapped = crypto.randomUUID()
      idMap.set(key, mapped)
    }
    return mapped
  }

  const d = payload.data

  // Reference sets used to sanitize dangling links.
  const userDeployments = await db.query.deployments.findMany({
    where: eq(deployments.workspaceId, workspaceId),
    columns: { id: true },
  })
  const userDeploymentIds = new Set(userDeployments.map((r) => r.id))

  const userCollections = await db.query.ragCollections.findMany({
    where: eq(ragCollections.workspaceId, workspaceId),
    columns: { id: true },
  })
  const existingCollectionIds = new Set(userCollections.map((r) => r.id))

  const userAgentRows = await db.query.agents.findMany({
    where: eq(agents.workspaceId, workspaceId),
    columns: { id: true },
  })
  const existingAgentIds = new Set(userAgentRows.map((r) => r.id))

  const userAlertChannels = await db.query.alertChannels.findMany({
    where: eq(alertChannels.workspaceId, workspaceId),
    columns: { id: true },
  })
  const existingAlertChannelIds = new Set(userAlertChannels.map((r) => r.id))

  const backupCollectionIds = new Set(d.ragCollections.map((c) => String(c.id)))
  const backupAgentIds = new Set(d.agents.map((a) => String(a.id)))

  /** Resolves a collection reference to a usable id, or null. */
  const resolveCollectionRef = (ref: unknown): string | null => {
    if (ref == null) return null
    const key = String(ref)
    if (backupCollectionIds.has(key)) return mapId(key)
    return existingCollectionIds.has(key) ? key : null
  }

  /** Resolves an agent reference to a usable id, or null. */
  const resolveAgentRef = (ref: unknown): string | null => {
    if (ref == null) return null
    const key = String(ref)
    if (backupAgentIds.has(key)) return mapId(key)
    return existingAgentIds.has(key) ? key : null
  }

  // ── Prepare rows (dates coerced, ownership + deployment forced) ──

  const collectionRows = d.ragCollections.map((c) => ({
    ...(c as typeof ragCollections.$inferInsert),
    id: mapId(c.id),
    deploymentId: targetDeploymentId,
    userId,
    workspaceId,
    createdAt: toDate(c.createdAt),
    updatedAt: toDate(c.updatedAt),
  }))

  const documentRows = d.ragDocuments
    .filter((doc) => backupCollectionIds.has(String(doc.collectionId)))
    .map((doc) => ({
      ...(doc as typeof ragDocuments.$inferInsert),
      id: mapId(doc.id),
      collectionId: mapId(doc.collectionId),
      userId,
      workspaceId,
      createdAt: toDate(doc.createdAt),
    }))
  const backupDocumentIds = new Set(d.ragDocuments.map((doc) => String(doc.id)))

  const chunkRows = d.ragChunks
    .filter(
      (ch) =>
        backupCollectionIds.has(String(ch.collectionId)) &&
        backupDocumentIds.has(String(ch.documentId))
    )
    .map((ch) => ({
      ...(ch as typeof ragChunks.$inferInsert),
      id: mapId(ch.id),
      documentId: mapId(ch.documentId),
      collectionId: mapId(ch.collectionId),
      createdAt: toDate(ch.createdAt),
    }))

  const agentRows = d.agents.map((a) => {
    const targetRef = a.targetDeploymentId == null ? null : String(a.targetDeploymentId)
    return {
      ...(a as typeof agents.$inferInsert),
      id: mapId(a.id),
      deploymentId: targetDeploymentId,
      userId,
      workspaceId,
      // Chat-to-itself agents follow the deployment they're restored into;
      // links to deployments the user doesn't own are dropped.
      targetDeploymentId:
        targetRef == null
          ? null
          : targetRef === payload.deployment.id
            ? targetDeploymentId
            : userDeploymentIds.has(targetRef)
              ? targetRef
              : null,
      ragCollectionId: resolveCollectionRef(a.ragCollectionId),
      createdAt: toDate(a.createdAt),
      updatedAt: toDate(a.updatedAt),
    }
  })

  const agentCollectionRows = d.agentCollections
    .filter(
      (link) =>
        backupAgentIds.has(String(link.agentId)) &&
        resolveCollectionRef(link.collectionId) != null
    )
    .map((link) => ({
      agentId: mapId(link.agentId),
      collectionId: resolveCollectionRef(link.collectionId) as string,
      createdAt: toDate(link.createdAt),
    }))

  const threadRows = d.agentThreads
    .filter((t) => backupAgentIds.has(String(t.agentId)))
    .map((t) => ({
      ...(t as typeof agentThreads.$inferInsert),
      id: mapId(t.id),
      agentId: mapId(t.agentId),
      userId,
      workspaceId,
      createdAt: toDate(t.createdAt),
      updatedAt: toDate(t.updatedAt),
    }))
  const backupThreadIds = new Set(d.agentThreads.map((t) => String(t.id)))

  const messageRows = d.agentMessages
    .filter((m) => backupThreadIds.has(String(m.threadId)))
    .map((m) => ({
      ...(m as typeof agentMessages.$inferInsert),
      id: mapId(m.id),
      threadId: mapId(m.threadId),
      createdAt: toDate(m.createdAt),
    }))

  // API keys: keys locked to an agent that can't be resolved are skipped
  // (nulling agentId would silently widen the key's access).
  const hashToKeyId = new Map(
    (
      await db.query.apiKeys.findMany({ columns: { id: true, keyHash: true } })
    ).map((k) => [k.keyHash, k.id])
  )
  const hashOwnedByOther = (id: string, hash: string): boolean => {
    const owner = hashToKeyId.get(hash)
    return owner != null && owner !== id
  }

  let apiKeysSkipped = 0
  const apiKeyRows: (typeof apiKeys.$inferInsert)[] = []
  for (const k of d.apiKeys) {
    const agentRef = k.agentId == null ? null : resolveAgentRef(k.agentId)
    if (k.agentId != null && agentRef == null) {
      apiKeysSkipped++
      continue
    }
    const id = mapId(k.id)
    const keyHash = String(k.keyHash)
    if (hashOwnedByOther(id, keyHash)) {
      apiKeysSkipped++
      continue
    }
    apiKeyRows.push({
      ...(k as typeof apiKeys.$inferInsert),
      id,
      deploymentId: targetDeploymentId,
      userId,
      workspaceId,
      agentId: agentRef,
      expiresAt: toDateOrNull(k.expiresAt),
      lastUsedAt: toDateOrNull(k.lastUsedAt),
      createdAt: toDate(k.createdAt),
    })
  }

  let alertRulesSkipped = 0
  const alertRuleRows: (typeof alertRules.$inferInsert)[] = []
  for (const r of d.alertRules) {
    if (!existingAlertChannelIds.has(String(r.channelId))) {
      alertRulesSkipped++
      continue
    }
    alertRuleRows.push({
      ...(r as typeof alertRules.$inferInsert),
      id: mapId(r.id),
      deploymentId: targetDeploymentId,
      createdAt: toDate(r.createdAt),
    })
  }

  const channelRows = d.channelConnections.map((c) => ({
    ...(c as typeof channelConnections.$inferInsert),
    id: mapId(c.id),
    deploymentId: targetDeploymentId,
    userId,
    workspaceId,
    // Direct-deployment mode still works without the agent binding.
    agentId: resolveAgentRef(c.agentId),
    connectedAt: toDateOrNull(c.connectedAt),
    createdAt: toDate(c.createdAt),
  }))
  const backupChannelIds = new Set(d.channelConnections.map((c) => String(c.id)))

  const channelMessageRows = d.channelMessages
    .filter((m) => backupChannelIds.has(String(m.channelConnectionId)))
    .map((m) => ({
      ...(m as typeof channelMessages.$inferInsert),
      id: mapId(m.id),
      channelConnectionId: mapId(m.channelConnectionId),
      createdAt: toDate(m.createdAt),
    }))

  const backupApiKeyIds = new Set(d.apiKeys.map((k) => String(k.id)))
  const mapApiKeyRef = (ref: unknown): string | null => {
    if (ref == null) return null
    const key = String(ref)
    return backupApiKeyIds.has(key) ? mapId(key) : key
  }

  const requestLogRows = d.requestLogs.map((l) => ({
    ...(l as typeof requestLogs.$inferInsert),
    id: mapId(l.id),
    deploymentId: targetDeploymentId,
    userId,
    workspaceId,
    apiKeyId: mapApiKeyRef(l.apiKeyId),
    createdAt: toDate(l.createdAt),
  }))

  const metricRows = d.metricSamples.map((m) => ({
    ...(m as typeof metricSamples.$inferInsert),
    id: mapId(m.id),
    deploymentId: targetDeploymentId,
    timestamp: toDate(m.timestamp),
  }))

  const imageRows = d.imageGenerations.map((img) => ({
    ...(img as typeof imageGenerations.$inferInsert),
    id: mapId(img.id),
    deploymentId: targetDeploymentId,
    userId,
    workspaceId,
    apiKeyId: mapApiKeyRef(img.apiKeyId),
    createdAt: toDate(img.createdAt),
  }))

  // ── Upsert everything in FK order ─────────────────────────────────

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
    for (const row of agentRows) {
      await tx
        .insert(agents)
        .values(row)
        .onConflictDoUpdate({ target: agents.id, set: row })
    }
    for (const row of agentCollectionRows) {
      await tx.insert(agentCollections).values(row).onConflictDoNothing()
    }
    for (const row of threadRows) {
      await tx
        .insert(agentThreads)
        .values(row)
        .onConflictDoUpdate({ target: agentThreads.id, set: row })
    }
    for (const row of messageRows) {
      await tx
        .insert(agentMessages)
        .values(row)
        .onConflictDoUpdate({ target: agentMessages.id, set: row })
    }
    for (const row of apiKeyRows) {
      await tx
        .insert(apiKeys)
        .values(row)
        .onConflictDoUpdate({ target: apiKeys.id, set: row })
    }
    for (const row of alertRuleRows) {
      await tx
        .insert(alertRules)
        .values(row)
        .onConflictDoUpdate({ target: alertRules.id, set: row })
    }
    for (const row of channelRows) {
      await tx
        .insert(channelConnections)
        .values(row)
        .onConflictDoUpdate({ target: channelConnections.id, set: row })
    }
    for (const row of channelMessageRows) {
      await tx
        .insert(channelMessages)
        .values(row)
        .onConflictDoUpdate({ target: channelMessages.id, set: row })
    }
    for (const row of requestLogRows) {
      await tx
        .insert(requestLogs)
        .values(row)
        .onConflictDoUpdate({ target: requestLogs.id, set: row })
    }
    for (const row of metricRows) {
      await tx
        .insert(metricSamples)
        .values(row)
        .onConflictDoUpdate({ target: metricSamples.id, set: row })
    }
    for (const row of imageRows) {
      await tx
        .insert(imageGenerations)
        .values(row)
        .onConflictDoUpdate({ target: imageGenerations.id, set: row })
    }
  })

  // Drop the zvec index for restored local collections — it rebuilds lazily
  // from the rag_chunks rows on the next search.
  for (const row of collectionRows) {
    if ((row.vectorStoreType ?? "local") === "local") {
      try {
        await destroyZvecCollection(row.id)
      } catch (err) {
        console.error(
          `[backup] Failed to reset vector index for collection ${row.id}:`,
          err
        )
      }
    }
  }

  return {
    remapped: remap,
    agents: agentRows.length,
    threads: threadRows.length,
    messages: messageRows.length,
    collections: collectionRows.length,
    documents: documentRows.length,
    chunks: chunkRows.length,
    apiKeys: apiKeyRows.length,
    apiKeysSkipped,
    alertRules: alertRuleRows.length,
    alertRulesSkipped,
    channels: channelRows.length,
    channelMessages: channelMessageRows.length,
    requestLogs: requestLogRows.length,
    metricSamples: metricRows.length,
    images: imageRows.length,
  }
}

/** Restores a stored snapshot back into the deployment it was taken from. */
export async function restoreDeploymentBackup(
  userId: string,
  workspaceId: string,
  backupId: string
): Promise<DeploymentRestoreResult> {
  const record = await requireWorkspaceBackup(workspaceId, backupId)
  const raw = await readFile(backupFilePath(record.fileName), "utf-8")

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error("Backup file on disk is not valid JSON")
  }
  const payload = validateDeploymentBackupPayload(data)

  return restoreDeploymentBackupPayload(userId, workspaceId, record.deploymentId, payload)
}

// ── Import ──────────────────────────────────────────────────────────

export interface DeploymentImportResult {
  restore: DeploymentRestoreResult
  backup: DeploymentBackupRecord
}

/**
 * Imports an uploaded snapshot file into `targetDeploymentId`: validates the
 * envelope, restores it (remapping ids when the file came from a different
 * deployment), and keeps a copy in the backup history for re-use.
 */
export async function importDeploymentBackup(
  userId: string,
  workspaceId: string,
  targetDeploymentId: string,
  raw: string
): Promise<DeploymentImportResult> {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error("Uploaded file is not valid JSON")
  }
  const payload = validateDeploymentBackupPayload(data)

  const restore = await restoreDeploymentBackupPayload(
    userId,
    workspaceId,
    targetDeploymentId,
    payload
  )

  // Keep the imported snapshot in this deployment's history.
  const id = crypto.randomUUID()
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const fileName = `deployment-${targetDeploymentId.slice(0, 8)}-${stamp}-${id.slice(0, 8)}.json`

  await ensureBackupDir()
  const body = Buffer.from(raw, "utf-8")
  await writeFile(backupFilePath(fileName), body)

  const sourceName = payload.deployment.name || payload.deployment.huggingfaceId
  const row: typeof deploymentBackups.$inferInsert = {
    id,
    deploymentId: targetDeploymentId,
    userId,
    workspaceId,
    name: `Imported from ${sourceName}`,
    fileName,
    sizeBytes: body.byteLength,
    version: payload.version,
    source: "import",
    counts: JSON.stringify(countsOf(payload)),
    includes: JSON.stringify(payload.includes),
    isActive: true,
    createdAt: new Date(),
  }
  await db.insert(deploymentBackups).values(row)

  const inserted = await requireWorkspaceBackup(workspaceId, id)
  return { restore, backup: toRecord(inserted) }
}

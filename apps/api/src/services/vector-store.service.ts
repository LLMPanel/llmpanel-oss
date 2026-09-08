// apps/api/src/services/vector-store.service.ts
//
// Local vector store backed by zvec (https://github.com/alibaba/zvec) — an
// in-process vector database with an HNSW index. One zvec collection lives on
// disk per RAG collection. SQLite (`rag_chunks`) remains the source of truth;
// zvec is the search index and can always be rebuilt from it, which is also
// how collections created before zvec existed are migrated: on first search
// an empty index is lazily backfilled from the chunks already in SQLite.
import path from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import type { ZVecCollection, ZVecCollectionSchema } from "@zvec/zvec"
import { db } from "@llmpanel/db"
import { ragChunks } from "@llmpanel/db/schema"
import { eq } from "drizzle-orm"

const ZVEC_DATA_DIR = process.env.ZVEC_DATA_DIR ?? "./zvec-data"

const VECTOR_FIELD = "embedding"

// The zvec native binding is loaded lazily so an unsupported platform only
// fails RAG search (which then falls back to the SQLite linear scan) instead
// of crashing the API at boot.
type ZvecModule = typeof import("@zvec/zvec")
let zvecModule: Promise<ZvecModule> | null = null

function loadZvec(): Promise<ZvecModule> {
  zvecModule ??= import("@zvec/zvec")
  return zvecModule
}

export interface ZvecChunkInput {
  id: string
  embedding: number[]
  content: string
  documentId: string
  chunkIndex: number
}

export interface ZvecSearchHit {
  chunkId: string
  documentId: string
  content: string
  /** Cosine similarity in [0, 1] (zvec returns distance; converted here). */
  score: number
  chunkIndex: number
}

// One handle per collection per process — zvec supports concurrent reads and
// reopening the same path twice in-process is wasteful.
const openCollections = new Map<string, ZVecCollection>()
// Serialises lazy backfills so concurrent searches don't migrate twice.
const backfillLocks = new Map<string, Promise<void>>()
// Collections this process has already written to or backfilled. zvec's
// docCount doesn't count fresh in-memory inserts, so without this a search
// right after ingest would re-trigger the SQLite backfill.
const populatedCollections = new Set<string>()

function collectionPath(collectionId: string): string {
  return path.join(ZVEC_DATA_DIR, `col_${collectionId}`)
}

function buildSchema(
  zvec: ZvecModule,
  collectionId: string,
  dimensions: number
): ZVecCollectionSchema {
  return new zvec.ZVecCollectionSchema({
    name: `col_${collectionId}`,
    vectors: [
      {
        name: VECTOR_FIELD,
        dataType: zvec.ZVecDataType.VECTOR_FP32,
        dimension: dimensions,
        indexParams: {
          indexType: zvec.ZVecIndexType.HNSW,
          metricType: zvec.ZVecMetricType.COSINE,
        },
      },
    ],
    fields: [
      { name: "content", dataType: zvec.ZVecDataType.STRING },
      {
        name: "documentId",
        dataType: zvec.ZVecDataType.STRING,
        indexParams: { indexType: zvec.ZVecIndexType.INVERT },
      },
      { name: "chunkIndex", dataType: zvec.ZVecDataType.INT64 },
    ],
  })
}

async function openOrCreate(
  collectionId: string,
  dimensions: number
): Promise<ZVecCollection> {
  const cached = openCollections.get(collectionId)
  if (cached) return cached

  const zvec = await loadZvec()
  const dir = collectionPath(collectionId)
  let collection: ZVecCollection
  if (existsSync(dir)) {
    collection = zvec.ZVecOpen(dir)
    // A dimension change (e.g. the embedding model was switched) invalidates
    // the index — drop it and let the backfill rebuild from SQLite.
    const schemaDim = collection.schema.vector(VECTOR_FIELD).dimension ?? 0
    if (schemaDim !== dimensions) {
      collection.destroySync()
      collection = zvec.ZVecCreateAndOpen(dir, buildSchema(zvec, collectionId, dimensions))
    }
  } else {
    mkdirSync(path.dirname(dir), { recursive: true })
    collection = zvec.ZVecCreateAndOpen(dir, buildSchema(zvec, collectionId, dimensions))
  }

  openCollections.set(collectionId, collection)
  return collection
}

/** Escape a string value for a zvec filter expression. */
function filterValue(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`
}

// ── Backfill (lazy migration from SQLite) ────────────────────────────

async function backfillFromSqlite(
  store: ZVecCollection,
  collectionId: string
): Promise<void> {
  const rows = await db.query.ragChunks.findMany({
    where: eq(ragChunks.collectionId, collectionId),
  })
  if (rows.length === 0) return

  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    store.upsertSync(
      batch.map((chunk) => ({
        id: chunk.id,
        vectors: { [VECTOR_FIELD]: JSON.parse(chunk.embedding) as number[] },
        fields: {
          content: chunk.content,
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
        },
      }))
    )
  }
}

/**
 * Make sure the zvec index contains the collection's chunks. Cheap when the
 * index is already populated; otherwise rebuilds it from SQLite once.
 */
async function ensurePopulated(
  store: ZVecCollection,
  collectionId: string
): Promise<void> {
  if (populatedCollections.has(collectionId)) return
  if (store.stats.docCount > 0) {
    populatedCollections.add(collectionId)
    return
  }

  let lock = backfillLocks.get(collectionId)
  if (!lock) {
    lock = backfillFromSqlite(store, collectionId)
      .then(() => {
        populatedCollections.add(collectionId)
      })
      .catch((error) => {
        // A failed backfill must not fail the search — the index may simply
        // be empty, and the next search retries the backfill.
        console.warn(
          `[rag] zvec backfill failed for collection ${collectionId}:`,
          error instanceof Error ? error.message : error
        )
      })
      .finally(() => {
        backfillLocks.delete(collectionId)
      })
    backfillLocks.set(collectionId, lock)
  }
  await lock
}

// ── Public API ───────────────────────────────────────────────────────

export async function upsertZvecChunks(
  collectionId: string,
  dimensions: number,
  chunks: ZvecChunkInput[]
): Promise<void> {
  if (chunks.length === 0) return
  const store = await openOrCreate(collectionId, dimensions)

  const batchSize = 200
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    store.upsertSync(
      batch.map((chunk) => ({
        id: chunk.id,
        vectors: { [VECTOR_FIELD]: chunk.embedding },
        fields: {
          content: chunk.content,
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
        },
      }))
    )
  }
  populatedCollections.add(collectionId)
}

export async function searchZvec(
  collectionId: string,
  dimensions: number,
  queryEmbedding: number[],
  topK: number
): Promise<ZvecSearchHit[]> {
  const store = await openOrCreate(collectionId, dimensions)
  await ensurePopulated(store, collectionId)

  const docs = await store.query({
    fieldName: VECTOR_FIELD,
    vector: queryEmbedding,
    topk: topK,
  })

  return docs.map((doc) => ({
    chunkId: doc.id,
    documentId: String(doc.fields.documentId ?? ""),
    content: String(doc.fields.content ?? ""),
    // COSINE metric returns distance (0 = identical); expose similarity.
    score: 1 - doc.score,
    chunkIndex: Number(doc.fields.chunkIndex ?? 0),
  }))
}

export async function deleteZvecDocument(
  collectionId: string,
  dimensions: number,
  documentId: string
): Promise<void> {
  const dir = collectionPath(collectionId)
  if (!existsSync(dir)) return
  const store = await openOrCreate(collectionId, dimensions)
  await store.deleteByFilter(`documentId = ${filterValue(documentId)}`)
}

/** Remove a collection's on-disk index entirely (used on collection delete). */
export async function destroyZvecCollection(collectionId: string): Promise<void> {
  populatedCollections.delete(collectionId)
  const dir = collectionPath(collectionId)
  const cached = openCollections.get(collectionId)
  if (cached) {
    openCollections.delete(collectionId)
    try {
      cached.destroySync()
      return
    } catch {
      // fall through to the path check below
    }
  }
  if (!existsSync(dir)) return
  try {
    const zvec = await loadZvec()
    zvec.ZVecOpen(dir).destroySync()
  } catch {
    // Index directory is corrupt or locked — nothing else references it.
  }
}

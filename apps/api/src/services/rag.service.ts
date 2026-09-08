// apps/api/src/services/rag.service.ts
import { db } from "@llmpanel/db"
import { ragCollections, ragDocuments, ragChunks, deployments } from "@llmpanel/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { decrypt, aadFor } from "./encryption.service"

// ── Chunking (Mastra-style recursive text splitter) ─────────────────

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]

interface ChunkOptions {
  maxSize: number
  overlap: number
  strategy: string
  separators?: string[]
}

export function chunkText(text: string, options: ChunkOptions): string[] {
  const { maxSize, overlap, separators = DEFAULT_SEPARATORS } = options

  if (text.length <= maxSize) return [text]

  const chunks: string[] = []

  function splitRecursive(text: string, separatorIndex: number): string[] {
    if (text.length <= maxSize) return [text]
    if (separatorIndex >= separators.length) {
      // Force split at maxSize
      const result: string[] = []
      for (let i = 0; i < text.length; i += maxSize - overlap) {
        result.push(text.slice(i, i + maxSize))
      }
      return result
    }

    const sep = separators[separatorIndex]
    const parts = sep === "" ? [text] : text.split(sep)

    const result: string[] = []
    let current = ""

    for (const part of parts) {
      const candidate = current ? current + sep + part : part

      if (candidate.length <= maxSize) {
        current = candidate
      } else {
        if (current) result.push(current)

        if (part.length > maxSize) {
          // Recurse with next separator
          const subChunks = splitRecursive(part, separatorIndex + 1)
          result.push(...subChunks)
          current = ""
        } else {
          current = part
        }
      }
    }

    if (current) result.push(current)
    return result
  }

  const rawChunks = splitRecursive(text, 0)

  // Apply overlap
  if (overlap > 0 && rawChunks.length > 1) {
    for (let i = 0; i < rawChunks.length; i++) {
      if (i > 0) {
        const prevEnd = rawChunks[i - 1].slice(-overlap)
        rawChunks[i] = prevEnd + rawChunks[i]
      }
    }
  }

  return rawChunks.map((c) => c.trim()).filter((c) => c.length > 0)
}

// ── Embedding ───────────────────────────────────────────────────────

// Curated built-in embedding models that run locally inside the API process
// via Transformers.js (ONNX runtime, q8 quantized). No deployment endpoint or
// external API key required — weights are downloaded + cached on first use.
export interface BuiltinEmbeddingModel {
  id: string
  label: string
  dimensions: number
  sizeMb: number
  languages: string
  /** e5-family models need instruction prefixes for good retrieval quality. */
  prefixes?: { query: string; passage: string }
}

export const BUILTIN_EMBEDDING_MODELS: BuiltinEmbeddingModel[] = [
  {
    id: "Xenova/all-MiniLM-L6-v2",
    label: "all-MiniLM-L6-v2",
    dimensions: 384,
    sizeMb: 23,
    languages: "English",
  },
  {
    id: "Xenova/bge-small-en-v1.5",
    label: "bge-small-en-v1.5",
    dimensions: 384,
    sizeMb: 34,
    languages: "English",
  },
  {
    id: "Xenova/gte-small",
    label: "gte-small",
    dimensions: 384,
    sizeMb: 34,
    languages: "English",
  },
  {
    id: "Xenova/multilingual-e5-small",
    label: "multilingual-e5-small",
    dimensions: 384,
    sizeMb: 118,
    languages: "100+ languages",
    prefixes: { query: "query: ", passage: "passage: " },
  },
]

export const BUILTIN_EMBEDDING_MODEL = BUILTIN_EMBEDDING_MODELS[0].id
export const BUILTIN_EMBEDDING_DIMENSIONS = BUILTIN_EMBEDDING_MODELS[0].dimensions

export function findBuiltinModel(id: string | null | undefined): BuiltinEmbeddingModel | undefined {
  if (!id) return undefined
  return BUILTIN_EMBEDDING_MODELS.find((m) => m.id === id)
}

/** What the text being embedded is — e5-family models embed the two differently. */
export type EmbeddingKind = "query" | "passage"

interface EmbeddingConfig {
  source: "http" | "builtin"
  url: string
  apiKey?: string
  model?: string
}

export async function getEmbeddingConfig(
  collection: typeof ragCollections.$inferSelect
): Promise<EmbeddingConfig> {
  if (collection.embeddingSource === "builtin") {
    const model = findBuiltinModel(collection.embeddingModel) ??
      BUILTIN_EMBEDDING_MODELS[0]
    return {
      source: "builtin",
      url: "",
      model: model.id,
    }
  }

  if (collection.embeddingSource === "external") {
    if (!collection.externalEmbeddingUrl) {
      throw new Error("External embedding URL not configured")
    }
    const apiKey = collection.encryptedExternalEmbeddingKey
      ? await decrypt(collection.encryptedExternalEmbeddingKey, aadFor.ragExternalEmbeddingKey(collection.id))
      : undefined
    return {
      source: "http",
      url: collection.externalEmbeddingUrl,
      apiKey,
      model: collection.embeddingModel ?? undefined,
    }
  }

  // Use deployment endpoint
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, collection.deploymentId),
  })
  if (!deployment?.endpoint) {
    throw new Error("Deployment is not running — no embedding endpoint available")
  }
  return {
    source: "http",
    url: deployment.endpoint,
    model: collection.embeddingModel ?? undefined,
  }
}

// Lazily-initialised, cached Transformers.js feature-extraction pipelines,
// keyed by model id. The model is downloaded + compiled once per process.
type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist: () => number[][] }>

const builtinExtractors = new Map<string, Promise<FeatureExtractor>>()

async function getBuiltinExtractor(model: string): Promise<FeatureExtractor> {
  let extractor = builtinExtractors.get(model)
  if (!extractor) {
    extractor = import("@huggingface/transformers").then(
      ({ pipeline }) =>
        pipeline("feature-extraction", model, {
          dtype: "q8",
        }) as unknown as Promise<FeatureExtractor>
    )
    builtinExtractors.set(model, extractor)
  }
  return extractor
}

async function generateBuiltinEmbeddings(
  texts: string[],
  model: string
): Promise<number[][]> {
  const extractor = await getBuiltinExtractor(model)
  const allEmbeddings: number[][] = []

  // Batch to keep peak memory bounded on large documents.
  const batchSize = 32
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const output = await extractor(batch, { pooling: "mean", normalize: true })
    allEmbeddings.push(...output.tolist())
  }

  return allEmbeddings
}

export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
  kind: EmbeddingKind = "query"
): Promise<number[][]> {
  if (config.source === "builtin") {
    const model = findBuiltinModel(config.model) ?? BUILTIN_EMBEDDING_MODELS[0]
    const prefix = model.prefixes?.[kind]
    const input = prefix ? texts.map((t) => prefix + t) : texts
    return generateBuiltinEmbeddings(input, model.id)
  }

  const baseUrl = config.url.replace(/\/$/, "")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`

  // Batch in groups of 32 to avoid timeouts
  const batchSize = 32
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const body: Record<string, unknown> = { input: batch }
    if (config.model) body.model = config.model

    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Embedding API error ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>
    }

    // Sort by index to preserve order
    const sorted = data.data.sort((a, b) => a.index - b.index)
    allEmbeddings.push(...sorted.map((d) => d.embedding))
  }

  return allEmbeddings
}

// ── Vector Search (Local) ───────────────────────────────────────────
// Primary local path is zvec (HNSW index on disk); the linear SQLite scan
// below is kept only as a fallback if the native zvec binding is unavailable.

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface SearchResult {
  chunkId: string
  documentId: string
  content: string
  score: number
  metadata: Record<string, unknown> | null
  chunkIndex: number
}

export async function searchLocalVectors(
  collectionId: string,
  queryEmbedding: number[],
  topK: number = 5
): Promise<SearchResult[]> {
  const chunks = await db.query.ragChunks.findMany({
    where: eq(ragChunks.collectionId, collectionId),
  })

  const scored = chunks.map((chunk) => {
    const embedding = JSON.parse(chunk.embedding) as number[]
    const score = cosineSimilarity(queryEmbedding, embedding)
    return {
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      score,
      metadata: chunk.metadata ? (JSON.parse(chunk.metadata) as Record<string, unknown>) : null,
      chunkIndex: chunk.chunkIndex,
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
}

// ── Vector Search (Qdrant Cloud) ────────────────────────────────────

interface QdrantSearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

export async function searchQdrantVectors(
  collection: typeof ragCollections.$inferSelect,
  queryEmbedding: number[],
  topK: number = 5
): Promise<SearchResult[]> {
  if (!collection.qdrantUrl || !collection.qdrantCollectionName) {
    throw new Error("Qdrant not configured for this collection")
  }

  const apiKey = collection.encryptedQdrantApiKey
    ? await decrypt(collection.encryptedQdrantApiKey, aadFor.ragQdrantApiKey(collection.id))
    : undefined

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["api-key"] = apiKey

  const baseUrl = collection.qdrantUrl.replace(/\/$/, "")
  const res = await fetch(
    `${baseUrl}/collections/${collection.qdrantCollectionName}/points/search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        vector: queryEmbedding,
        limit: topK,
        with_payload: true,
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Qdrant search error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { result: QdrantSearchResult[] }

  return data.result.map((r) => ({
    chunkId: String(r.id),
    documentId: String(r.payload.documentId ?? ""),
    content: String(r.payload.content ?? ""),
    score: r.score,
    metadata: r.payload,
    chunkIndex: Number(r.payload.chunkIndex ?? 0),
  }))
}

// ── Qdrant Collection Management ────────────────────────────────────

export async function createQdrantCollection(
  collection: typeof ragCollections.$inferSelect
): Promise<void> {
  if (!collection.qdrantUrl || !collection.qdrantCollectionName) return

  const apiKey = collection.encryptedQdrantApiKey
    ? await decrypt(collection.encryptedQdrantApiKey, aadFor.ragQdrantApiKey(collection.id))
    : undefined

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["api-key"] = apiKey

  const baseUrl = collection.qdrantUrl.replace(/\/$/, "")
  await fetch(`${baseUrl}/collections/${collection.qdrantCollectionName}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      vectors: {
        size: collection.embeddingDimensions,
        distance: "Cosine",
      },
    }),
  })
}

export async function upsertQdrantPoints(
  collection: typeof ragCollections.$inferSelect,
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>
): Promise<void> {
  if (!collection.qdrantUrl || !collection.qdrantCollectionName) return

  const apiKey = collection.encryptedQdrantApiKey
    ? await decrypt(collection.encryptedQdrantApiKey, aadFor.ragQdrantApiKey(collection.id))
    : undefined

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["api-key"] = apiKey

  const baseUrl = collection.qdrantUrl.replace(/\/$/, "")

  // Batch upsert in groups of 100
  const batchSize = 100
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize)
    await fetch(`${baseUrl}/collections/${collection.qdrantCollectionName}/points`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ points: batch }),
    })
  }
}

export async function deleteQdrantPoints(
  collection: typeof ragCollections.$inferSelect,
  documentId: string
): Promise<void> {
  if (!collection.qdrantUrl || !collection.qdrantCollectionName) return

  const apiKey = collection.encryptedQdrantApiKey
    ? await decrypt(collection.encryptedQdrantApiKey, aadFor.ragQdrantApiKey(collection.id))
    : undefined

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["api-key"] = apiKey

  const baseUrl = collection.qdrantUrl.replace(/\/$/, "")
  await fetch(`${baseUrl}/collections/${collection.qdrantCollectionName}/points/delete`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: {
        must: [{ key: "documentId", match: { value: documentId } }],
      },
    }),
  })
}

// ── Unified Search ──────────────────────────────────────────────────

export async function searchVectors(
  collection: typeof ragCollections.$inferSelect,
  queryEmbedding: number[],
  topK: number = 5
): Promise<SearchResult[]> {
  if (collection.vectorStoreType === "qdrant") {
    return searchQdrantVectors(collection, queryEmbedding, topK)
  }

  try {
    const { searchZvec } = await import("./vector-store.service")
    const hits = await searchZvec(
      collection.id,
      collection.embeddingDimensions,
      queryEmbedding,
      topK
    )
    return hits.map((hit) => ({ ...hit, metadata: null }))
  } catch (error) {
    // zvec unavailable (unsupported platform / corrupt index) — degrade to
    // the linear scan over SQLite so retrieval keeps working.
    console.warn(
      `[rag] zvec search failed for collection ${collection.id}, falling back to linear scan:`,
      error instanceof Error ? error.message : error
    )
    return searchLocalVectors(collection.id, queryEmbedding, topK)
  }
}

// ── Unified Retrieval ────────────────────────────────────────────────
// One entry point for "text in → relevant chunks out", honoring the
// collection's stored retrieval settings. Used by the RAG test chat and the
// agents' knowledge_search tool.

export interface RetrieveOptions {
  topK?: number
  scoreThreshold?: number
}

export async function retrieveFromCollection(
  collection: typeof ragCollections.$inferSelect,
  query: string,
  options: RetrieveOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK ?? collection.topK
  const threshold = options.scoreThreshold ?? collection.scoreThreshold

  const config = await getEmbeddingConfig(collection)
  const [queryEmbedding] = await generateEmbeddings([query], config, "query")
  const results = await searchVectors(collection, queryEmbedding, topK)

  return results.filter((r) => r.score >= threshold)
}

// ── Document Ingestion (fire-and-forget background processing) ──────

export async function ingestDocument(
  documentId: string,
  content: string,
  collectionId: string
): Promise<void> {
  const collection = await db.query.ragCollections.findFirst({
    where: eq(ragCollections.id, collectionId),
  })
  if (!collection) throw new Error("Collection not found")

  try {
    // 1. Chunk the document
    const chunks = chunkText(content, {
      maxSize: collection.chunkSize,
      overlap: collection.chunkOverlap,
      strategy: collection.chunkStrategy,
    })

    // 2. Generate embeddings
    const embeddingConfig = await getEmbeddingConfig(collection)
    const embeddings = await generateEmbeddings(
      chunks,
      embeddingConfig,
      "passage"
    )

    // 3. Store chunks + embeddings
    const now = new Date()
    const chunkRecords = chunks.map((text, i) => ({
      id: `${documentId}_chunk_${i}`,
      documentId,
      collectionId,
      content: text,
      embedding: JSON.stringify(embeddings[i]),
      metadata: JSON.stringify({ chunkIndex: i, documentId }),
      chunkIndex: i,
      createdAt: now,
    }))

    // Store in local SQLite
    if (chunkRecords.length > 0) {
      // Batch insert in groups of 50
      for (let i = 0; i < chunkRecords.length; i += 50) {
        const batch = chunkRecords.slice(i, i + 50)
        await db.insert(ragChunks).values(batch)
      }
    }

    // Index into the local zvec store (SQLite stays the source of truth; a
    // failed upsert self-heals via the lazy backfill on next search).
    if (collection.vectorStoreType === "local") {
      try {
        const { upsertZvecChunks } = await import("./vector-store.service")
        await upsertZvecChunks(
          collection.id,
          collection.embeddingDimensions,
          chunks.map((text, i) => ({
            id: `${documentId}_chunk_${i}`,
            embedding: embeddings[i],
            content: text,
            documentId,
            chunkIndex: i,
          }))
        )
      } catch (error) {
        console.warn(
          `[rag] zvec indexing failed for document ${documentId}:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    // Also store in Qdrant if configured
    if (collection.vectorStoreType === "qdrant") {
      await createQdrantCollection(collection)
      await upsertQdrantPoints(
        collection,
        chunks.map((text, i) => ({
          id: `${documentId}_chunk_${i}`,
          vector: embeddings[i],
          payload: {
            content: text,
            documentId,
            collectionId,
            chunkIndex: i,
          },
        }))
      )
    }

    // 4. Update document status
    await db
      .update(ragDocuments)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(ragDocuments.id, documentId))

    // Update collection counters
    await db
      .update(ragCollections)
      .set({
        documentCount: collection.documentCount + 1,
        totalChunks: collection.totalChunks + chunks.length,
        updatedAt: now,
      })
      .where(eq(ragCollections.id, collectionId))
  } catch (error) {
    await db
      .update(ragDocuments)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(ragDocuments.id, documentId))
  }
}

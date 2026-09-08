// apps/api/src/controllers/rag.controller.ts
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { db } from "@llmpanel/db"
import {
  ragCollections, ragDocuments, ragChunks, deployments, agentCollections,
} from "@llmpanel/db/schema"
import { eq, and, desc, inArray } from "drizzle-orm"
import { encrypt, decrypt, aadFor } from "../services/encryption.service"
import {
  ingestDocument,
  retrieveFromCollection,
  deleteQdrantPoints,
  findBuiltinModel,
  BUILTIN_EMBEDDING_MODELS,
} from "../services/rag.service"
import {
  extractDocumentText,
  UnsupportedFileError,
} from "../services/document-extract.service"
import {
  deleteZvecDocument,
  destroyZvecCollection,
} from "../services/vector-store.service"
import { getWorkspaceId } from "../lib/workspace-context"

// ── Collections CRUD ────────────────────────────────────────────────

/** Active agents attached to each of the given collections. */
async function loadConnectedAgents(
  collectionIds: string[]
): Promise<Map<string, Array<{ id: string; name: string; emoji: string | null }>>> {
  const map = new Map<string, Array<{ id: string; name: string; emoji: string | null }>>()
  if (collectionIds.length === 0) return map

  const links = await db.query.agentCollections.findMany({
    where: inArray(agentCollections.collectionId, collectionIds),
    with: { agent: true },
  })

  for (const link of links) {
    if (!link.agent.isActive) continue
    const entry = { id: link.agent.id, name: link.agent.name, emoji: link.agent.emoji }
    const existing = map.get(link.collectionId)
    if (existing) existing.push(entry)
    else map.set(link.collectionId, [entry])
  }
  return map
}

export const listCollections = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")

  const collections = await db.query.ragCollections.findMany({
    where: and(
      eq(ragCollections.deploymentId, deploymentId),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
    orderBy: [desc(ragCollections.createdAt)],
  })

  const connected = await loadConnectedAgents(collections.map((col) => col.id))

  return c.json({
    collections: collections.map((col) => {
      const { encryptedQdrantApiKey, encryptedExternalEmbeddingKey, ...safe } = col
      return {
        ...safe,
        hasQdrantApiKey: !!encryptedQdrantApiKey,
        hasExternalEmbeddingKey: !!encryptedExternalEmbeddingKey,
        connectedAgents: connected.get(col.id) ?? [],
      }
    }),
  })
}

export const getCollection = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")

  const collection = await db.query.ragCollections.findFirst({
    where: and(
      eq(ragCollections.id, collectionId),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
    with: { documents: true },
  })

  if (!collection) return c.json({ error: "Collection not found" }, 404)

  const connected = await loadConnectedAgents([collection.id])

  // Strip encrypted fields
  const { encryptedQdrantApiKey, encryptedExternalEmbeddingKey, ...safe } = collection
  return c.json({
    collection: {
      ...safe,
      hasQdrantApiKey: !!encryptedQdrantApiKey,
      hasExternalEmbeddingKey: !!encryptedExternalEmbeddingKey,
      connectedAgents: connected.get(collection.id) ?? [],
    },
  })
}

export const createCollection = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const body = await c.req.json()

  const now = new Date()
  const id = crypto.randomUUID()

  const encryptedQdrantKey = body.qdrantApiKey
    ? await encrypt(body.qdrantApiKey, aadFor.ragQdrantApiKey(id))
    : null
  const encryptedEmbeddingKey = body.externalEmbeddingApiKey
    ? await encrypt(body.externalEmbeddingApiKey, aadFor.ragExternalEmbeddingKey(id))
    : null

  // Built-in models have fixed output sizes — enforce them server-side so the
  // stored vector size always matches what the model actually produces.
  const embeddingSource = body.embeddingSource ?? "builtin"
  let embeddingModel: string | null = body.embeddingModel ?? null
  let embeddingDimensions: number = body.embeddingDimensions ?? 1536
  if (embeddingSource === "builtin") {
    const builtin = findBuiltinModel(embeddingModel) ?? BUILTIN_EMBEDDING_MODELS[0]
    embeddingModel = builtin.id
    embeddingDimensions = builtin.dimensions
  }

  await db.insert(ragCollections).values({
    id,
    deploymentId,
    userId: user.id,
    workspaceId,
    name: body.name,
    description: body.description ?? null,
    vectorStoreType: body.vectorStoreType ?? "local",
    embeddingSource,
    embeddingModel,
    embeddingDimensions,
    externalEmbeddingUrl: body.externalEmbeddingUrl ?? null,
    encryptedExternalEmbeddingKey: encryptedEmbeddingKey,
    chunkSize: body.chunkSize ?? 512,
    chunkOverlap: body.chunkOverlap ?? 50,
    chunkStrategy: body.chunkStrategy ?? "recursive",
    topK: body.topK ?? 5,
    scoreThreshold: body.scoreThreshold ?? 0.3,
    qdrantUrl: body.qdrantUrl ?? null,
    encryptedQdrantApiKey: encryptedQdrantKey,
    qdrantCollectionName: body.qdrantCollectionName ?? null,
    createdAt: now,
    updatedAt: now,
  })

  const collection = await db.query.ragCollections.findFirst({
    where: eq(ragCollections.id, id),
  })

  return c.json({ collection }, 201)
}

export const updateCollection = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")
  const body = await c.req.json()

  const existing = await db.query.ragCollections.findFirst({
    where: and(
      eq(ragCollections.id, collectionId),
      eq(ragCollections.workspaceId, workspaceId)
    ),
  })
  if (!existing) return c.json({ error: "Collection not found" }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.chunkSize !== undefined) updates.chunkSize = body.chunkSize
  if (body.chunkOverlap !== undefined) updates.chunkOverlap = body.chunkOverlap
  if (body.topK !== undefined) {
    updates.topK = Math.min(Math.max(Math.round(Number(body.topK)) || 5, 1), 20)
  }
  if (body.scoreThreshold !== undefined) {
    updates.scoreThreshold = Math.min(Math.max(Number(body.scoreThreshold) || 0, 0), 1)
  }
  if (body.embeddingModel !== undefined) updates.embeddingModel = body.embeddingModel
  if (body.embeddingDimensions !== undefined) updates.embeddingDimensions = body.embeddingDimensions

  if (body.qdrantApiKey) {
    updates.encryptedQdrantApiKey = await encrypt(body.qdrantApiKey, aadFor.ragQdrantApiKey(collectionId))
  }
  if (body.qdrantUrl !== undefined) updates.qdrantUrl = body.qdrantUrl
  if (body.qdrantCollectionName !== undefined) updates.qdrantCollectionName = body.qdrantCollectionName

  if (body.externalEmbeddingApiKey) {
    updates.encryptedExternalEmbeddingKey = await encrypt(body.externalEmbeddingApiKey, aadFor.ragExternalEmbeddingKey(collectionId))
  }
  if (body.externalEmbeddingUrl !== undefined) updates.externalEmbeddingUrl = body.externalEmbeddingUrl

  await db
    .update(ragCollections)
    .set(updates)
    .where(eq(ragCollections.id, collectionId))

  return c.json({ success: true })
}

export const deleteCollection = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")

  await db
    .update(ragCollections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(ragCollections.id, collectionId),
        eq(ragCollections.workspaceId, workspaceId)
      )
    )

  // Detach from agents and drop the local search index. The SQLite chunks
  // remain (soft delete), so the index could always be rebuilt.
  await db.delete(agentCollections).where(eq(agentCollections.collectionId, collectionId))
  await destroyZvecCollection(collectionId)

  return c.json({ success: true })
}

// ── Documents ───────────────────────────────────────────────────────

export const listDocuments = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")

  const docs = await db.query.ragDocuments.findMany({
    where: and(
      eq(ragDocuments.collectionId, collectionId),
      eq(ragDocuments.workspaceId, workspaceId)
    ),
    orderBy: [desc(ragDocuments.createdAt)],
  })

  return c.json({ documents: docs })
}

export const uploadDocument = async (c: Context) => {
  const user = c.get("user")
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")

  const collection = await db.query.ragCollections.findFirst({
    where: and(
      eq(ragCollections.id, collectionId),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
  })
  if (!collection) return c.json({ error: "Collection not found" }, 404)

  const formData = await c.req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return c.json({ error: "No file provided" }, 400)
  }

  let content: string
  try {
    content = await extractDocumentText(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file"
    return c.json({ error: message }, error instanceof UnsupportedFileError ? 415 : 400)
  }

  const now = new Date()
  const docId = crypto.randomUUID()

  await db.insert(ragDocuments).values({
    id: docId,
    collectionId,
    userId: user.id,
    workspaceId,
    fileName: file.name,
    fileType: file.type || "text/plain",
    fileSize: file.size,
    status: "processing",
    createdAt: now,
  })

  // Fire-and-forget: process in background
  void ingestDocument(docId, content, collectionId)

  return c.json({
    document: {
      id: docId,
      fileName: file.name,
      fileType: file.type || "text/plain",
      fileSize: file.size,
      status: "processing",
    },
  }, 201)
}

export const deleteDocument = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")
  const documentId = c.req.param("did")

  const doc = await db.query.ragDocuments.findFirst({
    where: and(
      eq(ragDocuments.id, documentId),
      eq(ragDocuments.workspaceId, workspaceId)
    ),
  })
  if (!doc) return c.json({ error: "Document not found" }, 404)

  // Delete chunks from SQLite
  await db.delete(ragChunks).where(eq(ragChunks.documentId, documentId))

  // Delete from the vector store
  const collection = await db.query.ragCollections.findFirst({
    where: eq(ragCollections.id, collectionId),
  })
  if (collection?.vectorStoreType === "qdrant") {
    await deleteQdrantPoints(collection, documentId)
  } else if (collection) {
    try {
      await deleteZvecDocument(collection.id, collection.embeddingDimensions, documentId)
    } catch (error) {
      console.warn(
        `[rag] zvec delete failed for document ${documentId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  // Delete document record
  await db.delete(ragDocuments).where(eq(ragDocuments.id, documentId))

  // Update collection counters
  if (collection) {
    await db
      .update(ragCollections)
      .set({
        documentCount: Math.max(0, collection.documentCount - 1),
        totalChunks: Math.max(0, collection.totalChunks - (doc.chunkCount ?? 0)),
        updatedAt: new Date(),
      })
      .where(eq(ragCollections.id, collectionId))
  }

  return c.json({ success: true })
}

// ── Retrieval test (no LLM) ─────────────────────────────────────────
// Returns the raw chunks retrieval would feed the model — lets users tune
// topK / threshold and verify their documents without a running deployment.

export const searchCollection = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const collectionId = c.req.param("cid")
  const body = await c.req.json().catch(() => ({})) as {
    query?: string
    topK?: number
    scoreThreshold?: number
  }

  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) return c.json({ error: "query is required" }, 400)

  const collection = await db.query.ragCollections.findFirst({
    where: and(
      eq(ragCollections.id, collectionId),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
  })
  if (!collection) return c.json({ error: "Collection not found" }, 404)

  try {
    const results = await retrieveFromCollection(collection, query, {
      topK: body.topK,
      scoreThreshold: body.scoreThreshold,
    })
    return c.json({
      results: results.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        chunkIndex: r.chunkIndex,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed"
    return c.json({ error: message }, 500)
  }
}

// ── RAG Chat (Streaming SSE) ────────────────────────────────────────

export const ragChat = async (c: Context) => {
  const workspaceId = getWorkspaceId(c)
  const deploymentId = c.req.param("id")
  const body = await c.req.json()

  const { message, collectionId, history } = body as {
    message: string
    collectionId: string
    history?: Array<{ role: "user" | "assistant"; content: string }>
  }

  if (!message || !collectionId) {
    return c.json({ error: "message and collectionId required" }, 400)
  }

  const collection = await db.query.ragCollections.findFirst({
    where: and(
      eq(ragCollections.id, collectionId),
      eq(ragCollections.workspaceId, workspaceId),
      eq(ragCollections.isActive, true)
    ),
  })
  if (!collection) return c.json({ error: "Collection not found" }, 404)

  const deployment = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.id, deploymentId),
      eq(deployments.workspaceId, workspaceId)
    ),
  })
  if (!deployment?.endpoint) {
    return c.json({ error: "Deployment is not running" }, 400)
  }

  // 1.–2. Embed the query and retrieve relevant chunks, honoring the
  // collection's stored topK / score threshold.
  const results = await retrieveFromCollection(collection, message)

  // 3. Build context
  const context = results
    .map((r, i) => `[Source ${i + 1}] (score: ${r.score.toFixed(3)})\n${r.content}`)
    .join("\n\n---\n\n")

  // 4. Build messages for LLM
  const systemPrompt = `You are a helpful assistant with access to a knowledge base. Answer the user's question based on the provided context. If the context doesn't contain relevant information, say so and answer based on your general knowledge.

## Retrieved Context
${context || "No relevant documents found."}

## Instructions
- Reference specific parts of the context when answering
- Be accurate and concise
- If the context is insufficient, acknowledge it`

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(history ?? []),
    { role: "user" as const, content: message },
  ]

  // 5. Stream response from deployment
  return streamSSE(c, async (stream) => {
    try {
      // Send sources first
      await stream.writeSSE({
        event: "sources",
        data: JSON.stringify(
          results.map((r) => ({
            content: r.content.slice(0, 200),
            score: r.score,
            chunkIndex: r.chunkIndex,
            documentId: r.documentId,
          }))
        ),
      })

      const res = await fetch(`${deployment.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: deployment.huggingfaceId,
          messages,
          stream: true,
          max_tokens: 2048,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: errText }),
        })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") {
            await stream.writeSSE({ event: "done", data: "" })
            return
          }

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string } }>
            }
            const content = parsed.choices[0]?.delta?.content
            if (content) {
              await stream.writeSSE({
                event: "content",
                data: JSON.stringify({ content }),
              })
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      await stream.writeSSE({ event: "done", data: "" })
    } catch (error) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: error instanceof Error ? error.message : "Chat failed",
        }),
      })
    }
  })
}

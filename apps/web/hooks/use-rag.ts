"use client"

import { useState, useEffect, useCallback } from "react"

// ── Types ───────────────────────────────────────────────────────────

export interface ConnectedAgent {
  id: string
  name: string
  emoji: string | null
}

export interface RagCollection {
  id: string
  deploymentId: string
  name: string
  description: string | null
  vectorStoreType: "local" | "qdrant"
  embeddingSource: "builtin" | "deployment" | "external"
  embeddingModel: string | null
  embeddingDimensions: number
  externalEmbeddingUrl: string | null
  chunkSize: number
  chunkOverlap: number
  chunkStrategy: string
  topK: number
  scoreThreshold: number
  qdrantUrl: string | null
  qdrantCollectionName: string | null
  hasQdrantApiKey?: boolean
  hasExternalEmbeddingKey?: boolean
  documentCount: number
  totalChunks: number
  connectedAgents?: ConnectedAgent[]
  createdAt: string
  updatedAt: string
  documents?: RagDocument[]
}

export interface RetrievalResult {
  chunkId: string
  documentId: string
  content: string
  score: number
  chunkIndex: number
}

export interface RagDocument {
  id: string
  collectionId: string
  fileName: string
  fileType: string
  fileSize: number
  status: "processing" | "ready" | "failed"
  chunkCount: number
  errorMessage: string | null
  createdAt: string
}

export interface ChatSource {
  content: string
  score: number
  chunkIndex: number
  documentId: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
  isStreaming?: boolean
}

// ── Collections Hook ────────────────────────────────────────────────

export function useRagCollections(deploymentId: string) {
  const [collections, setCollections] = useState<RagCollection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/v1/deployments/${deploymentId}/rag/collections`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to fetch collections")
      const data = (await res.json()) as { collections: RagCollection[] }
      setCollections(data.collections)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId])

  useEffect(() => {
    void load()
  }, [load])

  return { collections, isLoading, error, refetch: load }
}

// ── Single Collection Hook ──────────────────────────────────────────

export function useRagCollection(deploymentId: string, collectionId: string | null) {
  const [collection, setCollection] = useState<RagCollection | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!collectionId) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to fetch collection")
      const data = (await res.json()) as { collection: RagCollection }
      setCollection(data.collection)
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, collectionId])

  useEffect(() => {
    void load()
  }, [load])

  return { collection, isLoading, refetch: load }
}

// ── Documents Hook ──────────────────────────────────────────────────

export function useRagDocuments(deploymentId: string, collectionId: string | null) {
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!collectionId) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}/documents`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to fetch documents")
      const data = (await res.json()) as { documents: RagDocument[] }
      setDocuments(data.documents)
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [deploymentId, collectionId])

  useEffect(() => {
    void load()
  }, [load])

  return { documents, isLoading, refetch: load }
}

// ── Mutation helpers ────────────────────────────────────────────────

export async function createRagCollection(
  deploymentId: string,
  body: Record<string, unknown>
): Promise<RagCollection> {
  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to create collection")
  }
  const data = (await res.json()) as { collection: RagCollection }
  return data.collection
}

export async function updateRagCollection(
  deploymentId: string,
  collectionId: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error("Failed to update collection")
}

export async function deleteRagCollection(
  deploymentId: string,
  collectionId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}`,
    { method: "DELETE", credentials: "include" }
  )
  if (!res.ok) throw new Error("Failed to delete collection")
}

export async function uploadRagDocument(
  deploymentId: string,
  collectionId: string,
  file: File
): Promise<RagDocument> {
  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}/documents`,
    { method: "POST", credentials: "include", body: formData }
  )
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "Failed to upload document")
  }
  const data = (await res.json()) as { document: RagDocument }
  return data.document
}

export async function searchRagCollection(
  deploymentId: string,
  collectionId: string,
  body: { query: string; topK?: number; scoreThreshold?: number }
): Promise<RetrievalResult[]> {
  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}/search`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  const data = (await res.json()) as { results?: RetrievalResult[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? "Search failed")
  return data.results ?? []
}

export async function deleteRagDocument(
  deploymentId: string,
  collectionId: string,
  documentId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/deployments/${deploymentId}/rag/collections/${collectionId}/documents/${documentId}`,
    { method: "DELETE", credentials: "include" }
  )
  if (!res.ok) throw new Error("Failed to delete document")
}

// apps/api/src/routes/rag.route.ts
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  listDocuments,
  uploadDocument,
  deleteDocument,
  ragChat,
  searchCollection,
} from "../controllers/rag.controller"

const CreateCollectionSchema = z
  .object({
    name: z.string().trim().min(1, "Collection name is required").max(100),
    description: z.string().trim().max(500).optional(),
    vectorStoreType: z.enum(["local", "qdrant"]).default("local"),
    embeddingSource: z
      .enum(["builtin", "deployment", "external"])
      .default("builtin"),
    embeddingModel: z.string().trim().max(200).optional(),
    embeddingDimensions: z.number().int().min(1).max(8192),
    chunkSize: z.number().int().min(64).max(8192),
    chunkOverlap: z.number().int().min(0).max(4096),
    chunkStrategy: z.string().optional(),
    topK: z.number().int().min(1).max(20).optional(),
    scoreThreshold: z.number().min(0).max(1).optional(),
    externalEmbeddingUrl: z.string().url("Must be a valid URL").optional(),
    externalEmbeddingApiKey: z.string().optional(),
    qdrantUrl: z.string().url("Must be a valid URL").optional(),
    qdrantApiKey: z.string().optional(),
    qdrantCollectionName: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.chunkOverlap < d.chunkSize, {
    message: "Chunk overlap must be smaller than chunk size",
    path: ["chunkOverlap"],
  })
  .refine((d) => d.embeddingSource !== "external" || !!d.externalEmbeddingUrl, {
    message: "External embedding URL is required for an external embedding source",
    path: ["externalEmbeddingUrl"],
  })
  .refine((d) => d.vectorStoreType !== "qdrant" || !!d.qdrantUrl, {
    message: "Qdrant URL is required when using Qdrant",
    path: ["qdrantUrl"],
  })

export const ragRoute = new Hono()
  .use(sessionAuth)

  // Collections
  .get("/collections", listCollections)
  .post(
    "/collections",
    requireRole("member"),
    // Surface Zod issues as a single readable string under `error`, matching the
    // shape the web client reads (`data.error`).
    zValidator("json", CreateCollectionSchema, (result, c) => {
      if (!result.success) {
        const message = result.error.issues
          .map((i) =>
            i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
          )
          .join(", ")
        return c.json({ error: message }, 400)
      }
    }),
    createCollection
  )
  .get("/collections/:cid", getCollection)
  .put("/collections/:cid", requireRole("member"), updateCollection)
  .delete("/collections/:cid", requireRole("member"), deleteCollection)

  // Documents within a collection
  .get("/collections/:cid/documents", listDocuments)
  .post("/collections/:cid/documents", requireRole("member"), uploadDocument)
  .delete("/collections/:cid/documents/:did", requireRole("member"), deleteDocument)

  // Retrieval test (no LLM — returns raw matched chunks)
  .post("/collections/:cid/search", searchCollection)

  // RAG Chat
  .post("/chat", ragChat)

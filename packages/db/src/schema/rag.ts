import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"

// ── RAG Collections ─────────────────────────────────────────────────

export const ragCollections = sqliteTable("rag_collections", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  description: text("description"),

  // "local" = SQLite vector store, "qdrant" = Qdrant cloud
  vectorStoreType: text("vector_store_type").notNull().default("local"),

  // Embedding config
  // "deployment" = use the deployment's /v1/embeddings endpoint
  // "external" = use an external OpenAI-compatible embedding endpoint
  embeddingSource: text("embedding_source").notNull().default("deployment"),
  embeddingModel: text("embedding_model"), // e.g. "text-embedding-3-small"
  embeddingDimensions: integer("embedding_dimensions").notNull().default(1536),
  externalEmbeddingUrl: text("external_embedding_url"),
  encryptedExternalEmbeddingKey: text("encrypted_external_embedding_key"),

  // Chunking config
  chunkSize: integer("chunk_size").notNull().default(512),
  chunkOverlap: integer("chunk_overlap").notNull().default(50),
  chunkStrategy: text("chunk_strategy").notNull().default("recursive"),

  // Retrieval config — used by the RAG test chat and agent knowledge_search
  topK: integer("top_k").notNull().default(5),
  scoreThreshold: real("score_threshold").notNull().default(0.3),

  // Qdrant cloud settings
  qdrantUrl: text("qdrant_url"),
  encryptedQdrantApiKey: text("encrypted_qdrant_api_key"),
  qdrantCollectionName: text("qdrant_collection_name"),

  // Counters
  documentCount: integer("document_count").notNull().default(0),
  totalChunks: integer("total_chunks").notNull().default(0),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const ragCollectionsRelations = relations(ragCollections, ({ one, many }) => ({
  deployment: one(deployments, {
    fields: [ragCollections.deploymentId],
    references: [deployments.id],
  }),
  user: one(user, {
    fields: [ragCollections.userId],
    references: [user.id],
  }),
  documents: many(ragDocuments),
}))

// ── RAG Documents ───────────────────────────────────────────────────

export const ragDocuments = sqliteTable("rag_documents", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => ragCollections.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // "text/plain", "text/markdown", "application/pdf"
  fileSize: integer("file_size").notNull(), // bytes

  // "processing" | "ready" | "failed"
  status: text("status").notNull().default("processing"),
  chunkCount: integer("chunk_count").notNull().default(0),
  errorMessage: text("error_message"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const ragDocumentsRelations = relations(ragDocuments, ({ one, many }) => ({
  collection: one(ragCollections, {
    fields: [ragDocuments.collectionId],
    references: [ragCollections.id],
  }),
  user: one(user, {
    fields: [ragDocuments.userId],
    references: [user.id],
  }),
  chunks: many(ragChunks),
}))

// ── RAG Chunks (local SQLite vector store) ──────────────────────────

export const ragChunks = sqliteTable("rag_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => ragDocuments.id, { onDelete: "cascade" }),
  collectionId: text("collection_id")
    .notNull()
    .references(() => ragCollections.id, { onDelete: "cascade" }),

  content: text("content").notNull(),
  // Embedding stored as JSON string array of floats
  embedding: text("embedding").notNull(),
  // Additional metadata (JSON)
  metadata: text("metadata"),
  chunkIndex: integer("chunk_index").notNull(),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const ragChunksRelations = relations(ragChunks, ({ one }) => ({
  document: one(ragDocuments, {
    fields: [ragChunks.documentId],
    references: [ragDocuments.id],
  }),
  collection: one(ragCollections, {
    fields: [ragChunks.collectionId],
    references: [ragCollections.id],
  }),
}))

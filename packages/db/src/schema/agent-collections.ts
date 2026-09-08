import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { agents } from "./agents"
import { ragCollections } from "./rag"

// ── Agent ↔ RAG collection attachments (many-to-many) ────────────────
// An agent's knowledge_search tool queries every attached collection.

export const agentCollections = sqliteTable("agent_collections", {
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  collectionId: text("collection_id")
    .notNull()
    .references(() => ragCollections.id, { onDelete: "cascade" }),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.agentId, table.collectionId] }),
  index("agent_collections_agent_idx").on(table.agentId),
  index("agent_collections_collection_idx").on(table.collectionId),
])

export const agentCollectionsRelations = relations(agentCollections, ({ one }) => ({
  agent: one(agents, {
    fields: [agentCollections.agentId],
    references: [agents.id],
  }),
  collection: one(ragCollections, {
    fields: [agentCollections.collectionId],
    references: [ragCollections.id],
  }),
}))

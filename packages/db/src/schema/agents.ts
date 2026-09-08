import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"
import { ragCollections } from "./rag"

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt"),

  // "deployment" | "openai-compatible"
  sourceType: text("source_type").notNull().default("deployment"),
  targetDeploymentId: text("target_deployment_id").references(() => deployments.id, { onDelete: "set null" }),

  // For sourceType === "openai-compatible"
  externalBaseUrl: text("external_base_url"),
  externalModel: text("external_model"),
  encryptedExternalApiKey: text("encrypted_external_api_key"),

  // Display
  emoji: text("emoji"), // e.g. "🤖" — avatar shown in the UI

  // Agentic runtime config
  toolsEnabled: text("tools_enabled").notNull().default("[]"), // JSON: ["knowledge_search"]
  ragCollectionId: text("rag_collection_id").references(() => ragCollections.id, { onDelete: "set null" }),
  maxSteps: integer("max_steps").notNull().default(6), // tool-loop iteration cap
  temperature: real("temperature"),   // null = provider default
  maxTokens: integer("max_tokens"),   // null = provider default

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("agents_workspaceId_idx").on(table.workspaceId),
])

export const agentsRelations = relations(agents, ({ one }) => ({
  deployment: one(deployments, {
    fields: [agents.deploymentId],
    references: [deployments.id],
  }),
  targetDeployment: one(deployments, {
    fields: [agents.targetDeploymentId],
    references: [deployments.id],
  }),
  user: one(user, {
    fields: [agents.userId],
    references: [user.id],
  }),
  ragCollection: one(ragCollections, {
    fields: [agents.ragCollectionId],
    references: [ragCollections.id],
  }),
}))

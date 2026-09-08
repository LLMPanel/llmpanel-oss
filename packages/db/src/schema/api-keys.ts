import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"
import { agents } from "./agents"

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id").references(() => deployments.id),
  // null deploymentId = access to all user's deployments
  agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  // non-null agentId = key is locked to that single agent's endpoint

  name: text("name").notNull(),                  // "Production Key"
  keyHash: text("key_hash").notNull().unique(),  // SHA-256 hash — never store raw
  prefix: text("prefix").notNull(),              // "gpup_sk_abc123" shown in UI

  // Permissions
  scopes: text("scopes").notNull().default('["chat"]'), // JSON: ["chat","embeddings"]

  // Rate limiting
  rpmLimit: integer("rpm_limit"),               // requests per minute (null = unlimited)
  tpmLimit: integer("tpm_limit"),               // tokens per minute
  dailyLimit: integer("daily_limit"),           // max requests per day

  // Validity
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("api_keys_workspaceId_idx").on(table.workspaceId),
])

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  deployment: one(deployments, {
    fields: [apiKeys.deploymentId],
    references: [deployments.id],
  }),
  agent: one(agents, {
    fields: [apiKeys.agentId],
    references: [agents.id],
  }),
}))
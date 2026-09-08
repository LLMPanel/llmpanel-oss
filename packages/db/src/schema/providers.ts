import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { user, organization } from "./auth"

export const providerConnections = sqliteTable("provider_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  providerType: text("provider_type").notNull(),  // "local" | "runpod" | "vastai"
  name: text("name").notNull(),                   // user-given name: "My RunPod"
  encryptedApiKey: text("encrypted_api_key"),     // null for local provider
  // Vast.ai only: encrypted TOTP secret, used to mint a 2FA session key when
  // the account requires Two-Factor Authentication for write actions.
  encryptedTotpSecret: text("encrypted_totp_secret"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("provider_connections_workspaceId_idx").on(table.workspaceId),
])
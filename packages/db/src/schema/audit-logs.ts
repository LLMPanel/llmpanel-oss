import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),             // "deployment.created" | "api_key.revoked"
  resourceType: text("resource_type"),          // "deployment" | "api_key"
  resourceId: text("resource_id"),
  metadata: text("metadata"),                   // JSON string with extra context
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
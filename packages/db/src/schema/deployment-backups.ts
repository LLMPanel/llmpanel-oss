import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"

// ── Deployment snapshots ─────────────────────────────────────────────
// One row per point-in-time backup of a single deployment (agents, chat
// threads, RAG data, API keys, channels, alerts + optional logs/metrics/
// images). The snapshot itself is a versioned JSON file on the API host
// (BACKUP_DATA_DIR); this table is the browsable history.

export const deploymentBackups = sqliteTable("deployment_backups", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  name: text("name").notNull(),          // user-given label, e.g. "Before prompt rework"
  fileName: text("file_name").notNull(), // snapshot file under BACKUP_DATA_DIR
  sizeBytes: integer("size_bytes").notNull(),

  // Envelope format version of the snapshot file
  version: integer("version").notNull().default(1),
  // "manual" = created from this deployment, "import" = uploaded file
  source: text("source").notNull().default("manual"),

  // JSON summary of row counts, e.g. {"agents":2,"threads":14,"chunks":900}
  counts: text("counts").notNull().default("{}"),
  // JSON of the optional-data toggles used, e.g. {"requestLogs":true}
  includes: text("includes").notNull().default("{}"),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("deployment_backups_deployment_idx").on(table.deploymentId),
])

export const deploymentBackupsRelations = relations(deploymentBackups, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentBackups.deploymentId],
    references: [deployments.id],
  }),
  user: one(user, {
    fields: [deploymentBackups.userId],
    references: [user.id],
  }),
}))

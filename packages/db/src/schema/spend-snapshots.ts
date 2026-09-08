import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { user, organization } from "./auth"
import { providerConnections } from "./providers"

// Periodic burn-rate snapshots recorded by the API's spend collector
// (~30min cadence per active cloud provider connection). Powers the
// spend-over-time chart on /dashboard/spendings. 90-day retention —
// old rows are pruned by the collector, no soft delete.
// `balance` is null when the provider API doesn't expose one.
export const spendSnapshots = sqliteTable(
  "spend_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Owning workspace. Nullable at the SQL level for legacy rows.
    workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
    providerConnectionId: text("provider_connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    providerType: text("provider_type").notNull(), // "runpod" | "vastai" | "hotaisle"
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),

    costPerHour: real("cost_per_hour").notNull(),
    balance: real("balance"),
    runningInstances: integer("running_instances").notNull(),
    totalInstances: integer("total_instances").notNull(),
  },
  (t) => [index("spend_snapshots_user_ts_idx").on(t.userId, t.timestamp)],
)

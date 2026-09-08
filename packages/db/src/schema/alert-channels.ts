import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { alertRules } from "./alert-rules"

// Platform types supported for deployment alerts
export type AlertPlatform = "telegram" | "discord" | "slack"

// Per-platform encrypted config shapes (stored as JSON):
//   telegram: { botToken: string, chatId: string }
//   discord:  { webhookUrl: string }
//   slack:    { webhookUrl: string }

export const alertChannels = sqliteTable("alert_channels", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  platform: text("platform").notNull(),   // AlertPlatform
  name: text("name").notNull(),           // user-given label, e.g. "Ops Telegram"

  // AES-256-GCM encrypted JSON string with platform credentials
  encryptedConfig: text("encrypted_config").notNull(),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const alertChannelsRelations = relations(alertChannels, ({ one, many }) => ({
  user: one(user, {
    fields: [alertChannels.userId],
    references: [user.id],
  }),
  rules: many(alertRules),
}))

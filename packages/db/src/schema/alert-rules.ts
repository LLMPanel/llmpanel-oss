import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { deployments } from "./deployments"
import { alertChannels } from "./alert-channels"

// Events that can trigger an alert notification
// "deployment.started"  — status transitions to "provisioning"
// "deployment.running"  — status transitions to "running"
// "deployment.failed"   — status transitions to "failed"
// "deployment.stopped"  — status transitions to "stopped"
export type AlertEvent =
  | "deployment.started"
  | "deployment.running"
  | "deployment.failed"
  | "deployment.stopped"

export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),
  channelId: text("channel_id")
    .notNull()
    .references(() => alertChannels.id, { onDelete: "cascade" }),

  // JSON array of AlertEvent strings, e.g. ["deployment.failed","deployment.running"]
  events: text("events").notNull().default('["deployment.failed","deployment.running"]'),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const alertRulesRelations = relations(alertRules, ({ one }) => ({
  deployment: one(deployments, {
    fields: [alertRules.deploymentId],
    references: [deployments.id],
  }),
  channel: one(alertChannels, {
    fields: [alertRules.channelId],
    references: [alertChannels.id],
  }),
}))

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { organization } from "./auth"

/**
 * Billing state mirrored from the hosted service's payment provider.
 *
 * This table lives in the shared schema package rather than alongside the
 * billing code so that both builds share one migration history — a self-hosted
 * install simply never writes to it. The provider remains the source of truth;
 * every row here is a projection built from webhooks, safe to rebuild by
 * replaying them.
 *
 * Subscriptions are workspace-scoped, not user-scoped: deployments belong to a
 * workspace, so the thing being paid for is the workspace.
 */
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),

  // Provider identifiers. polarSubscriptionId is unique so replayed webhooks
  // upsert the same row instead of duplicating it.
  polarSubscriptionId: text("polar_subscription_id").notNull().unique(),
  polarCustomerId: text("polar_customer_id").notNull(),
  polarProductId: text("polar_product_id").notNull(),

  /** Our plan id resolved from polarProductId — "solo" | "team". */
  planId: text("plan_id").notNull(),

  /**
   * Provider subscription status, stored verbatim:
   * "incomplete" | "incomplete_expired" | "trialing" | "active" |
   * "past_due" | "canceled" | "unpaid"
   * "active", "trialing" and "past_due" grant entitlements — see isEntitled().
   */
  status: text("status").notNull(),

  /** Set when the customer cancels but keeps access until the period ends. */
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),

  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("subscriptions_workspaceId_idx").on(table.workspaceId),
])

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(organization, {
    fields: [subscriptions.workspaceId],
    references: [organization.id],
  }),
}))

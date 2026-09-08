import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { channelConnections } from "./channel-connections"

export const channelMessages = sqliteTable("channel_messages", {
  id: text("id").primaryKey(),
  channelConnectionId: text("channel_connection_id")
    .notNull()
    .references(() => channelConnections.id, { onDelete: "cascade" }),
  platformUserId: text("platform_user_id").notNull(),
  platformUsername: text("platform_username"),
  // "inbound" | "outbound" | "system" ("system" = context-reset marker)
  direction: text("direction").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("channel_messages_conn_user_created_idx")
    .on(t.channelConnectionId, t.platformUserId, t.createdAt),
])

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
  channelConnection: one(channelConnections, {
    fields: [channelMessages.channelConnectionId],
    references: [channelConnections.id],
  }),
}))

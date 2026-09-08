import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { agents } from "./agents"

// ── Agent conversation threads (playground + persisted memory) ──────

export const agentThreads = sqliteTable("agent_threads", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  title: text("title"), // derived from the first user message when null

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("agent_threads_agent_idx").on(table.agentId),
])

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => agentThreads.id, { onDelete: "cascade" }),

  // "system" | "user" | "assistant" | "tool"
  role: text("role").notNull(),
  content: text("content"),

  // OpenAI-shaped tool metadata
  toolCalls: text("tool_calls"),    // JSON array on assistant messages that invoked tools
  toolCallId: text("tool_call_id"), // set on role === "tool" result messages
  toolName: text("tool_name"),      // tool that produced a role === "tool" message

  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("agent_messages_thread_idx").on(table.threadId),
])

export const agentThreadsRelations = relations(agentThreads, ({ one, many }) => ({
  agent: one(agents, {
    fields: [agentThreads.agentId],
    references: [agents.id],
  }),
  user: one(user, {
    fields: [agentThreads.userId],
    references: [user.id],
  }),
  messages: many(agentMessages),
}))

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  thread: one(agentThreads, {
    fields: [agentMessages.threadId],
    references: [agentThreads.id],
  }),
}))

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"
import { agents } from "./agents"

// Supported messaging platform types
// "whatsapp"  — uses Baileys (QR / pairing-code auth)
// "telegram"  — bot token from BotFather
// "discord"   — bot token + application ID
// "slack"     — bot token + signing secret
// "feishu"    — app ID + app secret (phase 2)
// "twitch"    — OAuth token + client ID (phase 2)
// "zalo"      — app ID + secret key + OA access token (phase 2)
export type ChannelPlatform = "whatsapp" | "telegram" | "discord" | "slack" | "feishu" | "twitch" | "zalo"

export const channelConnections = sqliteTable("channel_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),

  platform: text("platform").notNull(),   // ChannelPlatform
  name: text("name").notNull(),           // user-given label, e.g. "Support Bot"

  // Encrypted JSON string. Contents vary per platform:
  //   whatsapp:  { phoneNumber, sessionId }
  //   telegram:  { botToken, webhookSecret? }
  //   discord:   { botToken, applicationId, publicKey, guildId? }
  //   slack:     { botToken, signingSecret, appId, defaultChannel? }
  encryptedConfig: text("encrypted_config").notNull(),

  systemPrompt: text("system_prompt"),
  memoryEnabled: integer("memory_enabled", { mode: "boolean" }).default(true),

  // Agent binding: when set, messages run through the agent runtime
  // (agent system prompt + RAG tool loop). Null = direct deployment mode.
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),

  // Per-user multi-turn context from channel_messages
  historyEnabled: integer("history_enabled", { mode: "boolean" }).notNull().default(true),
  historyLimit: integer("history_limit").notNull().default(20), // messages, ≈10 exchanges

  // Access control (both off by default)
  allowlist: text("allowlist"),                              // JSON string[]; null = everyone
  rateLimitPerMinute: integer("rate_limit_per_minute"),      // null = unlimited

  // "pending" | "active" | "error"
  status: text("status").notNull().default("pending"),
  statusMessage: text("status_message"),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  connectedAt: integer("connected_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("channel_connections_workspaceId_idx").on(table.workspaceId),
])

export const channelConnectionsRelations = relations(channelConnections, ({ one }) => ({
  deployment: one(deployments, {
    fields: [channelConnections.deploymentId],
    references: [deployments.id],
  }),
  agent: one(agents, {
    fields: [channelConnections.agentId],
    references: [agents.id],
  }),
  user: one(user, {
    fields: [channelConnections.userId],
    references: [user.id],
  }),
}))

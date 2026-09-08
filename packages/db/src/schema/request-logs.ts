import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { organization } from "./auth"

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id"),
  deploymentId: text("deployment_id"),
  userId: text("user_id"),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),

  // Request info
  method: text("method").notNull(),
  path: text("path").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  // Caller-supplied X-Client-Request-Id, echoed back on the response. The row
  // id doubles as the x-request-id header, so both sides of the correlation
  // live on this table.
  clientRequestId: text("client_request_id"),

  // LLM specific
  model: text("model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),

  // Response info
  statusCode: integer("status_code").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  isStreaming: integer("is_streaming", { mode: "boolean" }),

  // Full request/response payloads (JSON strings, truncated at 100KB each).
  // Streaming responses are reassembled into a chat.completion-shaped object.
  requestBody: text("request_body"),
  responseBody: text("response_body"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("request_logs_workspaceId_idx").on(table.workspaceId),
])
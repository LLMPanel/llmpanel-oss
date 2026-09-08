import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { deployments } from "./deployments"

// One row per generated image. Mirrors requestLogs but for text-to-image
// deployments — tracks the prompt, sampling params and where the file landed
// on disk so the dashboard can show a history/gallery.
export const imageGenerations = sqliteTable("image_generations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id").references(() => deployments.id, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id"), // null when generated from the dashboard (session auth)

  model: text("model"),                       // huggingface id served
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),

  // Sampling params (stored individually so they're queryable)
  width: integer("width"),
  height: integer("height"),
  steps: integer("steps"),
  guidanceScale: real("guidance_scale"),
  seed: integer("seed"),

  // Storage
  filePath: text("file_path").notNull(),      // absolute path on the API host
  url: text("url").notNull(),                  // publicly fetchable URL

  latencyMs: integer("latency_ms"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const imageGenerationsRelations = relations(imageGenerations, ({ one }) => ({
  deployment: one(deployments, {
    fields: [imageGenerations.deploymentId],
    references: [deployments.id],
  }),
}))

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),                   // "Llama 3.1 8B"
  slug: text("slug").notNull().unique(),           // "llama-3.1-8b"
  family: text("family").notNull(),               // "llama" | "mistral" | "deepseek"
  huggingfaceId: text("huggingface_id").notNull(), // "meta-llama/Llama-3.1-8B-Instruct"
  description: text("description"),
  minVram: real("min_vram").notNull(),             // minimum VRAM in GB
  tags: text("tags").notNull().default("[]"),     // JSON array as text: ["chat","reasoning"]
  supportedQuantizations: text("supported_quantizations").notNull().default("[]"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
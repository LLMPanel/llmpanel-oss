import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { user, organization } from "./auth"
import { models } from "./models"
import { providerConnections } from "./providers"

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // Owning workspace. Nullable at the SQL level for legacy rows; backfilled
  // from the creator's personal workspace.
  workspaceId: text("workspace_id").references(() => organization.id, { onDelete: "cascade" }),
  name: text("name"),                              // human-friendly project name, e.g. "funky-narwhal-42"
  description: text("description"),                 // optional free-text note, e.g. "staging chatbot"
  modelId: text("model_id").references(() => models.id),
  huggingfaceId: text("huggingface_id").notNull(), // e.g. "Qwen/Qwen3.5-0.8B"
  providerConnectionId: text("provider_connection_id")
    .references(() => providerConnections.id),

  // Provider specific
  externalId: text("external_id"),               // Docker container ID or RunPod pod ID
  providerType: text("provider_type").notNull(), // "local" | "runpod" | "vastai"
  gpuType: text("gpu_type").notNull(),           // "H100 SXM" | "RTX 4090" etc
  providerOfferId: text("provider_offer_id"),    // provider-specific selected offer/type ID
  cloudType: text("cloud_type"),                 // RunPod: "secure" | "community" (null = secure default / N/A)
  gpuCount: integer("gpu_count").notNull().default(1), // number of GPUs for tensor parallelism
  quantization: text("quantization").notNull(),  // "fp16" | "int8" | "int4"
  inferenceEngine: text("inference_engine").notNull().default("vllm"), // "vllm" | "sglang"
  kvCacheEnabled: integer("kv_cache_enabled", { mode: "boolean" }).notNull().default(true),
  // DFlash speculative decoding. Draft model is resolved from the drafter
  // catalog at create time; null = no drafter known for this model.
  dflashEnabled: integer("dflash_enabled", { mode: "boolean" }).notNull().default(true),
  dflashDraftModel: text("dflash_draft_model"),

  // Model class + serving overrides (resolved from the registry at create time).
  // null modelType = standard text LLM served on the default engine image.
  modelType: text("model_type"),       // "llm" | "vlm" | "ocr"
  dockerImage: text("docker_image"),   // override engine image, e.g. "vllm/vllm-openai:unlimited-ocr"
  extraArgs: text("extra_args"),       // extra engine CLI args, space-separated

  // Secret for the in-pod metrics agent (RunPod). Null = no agent (local/legacy deployments).
  metricsToken: text("metrics_token"),

  // Status
  status: text("status").notNull().default("provisioning"),
  // "provisioning" | "downloading" | "loading" | "health_check" | "running" | "stopped" | "failed"
  progress: integer("progress").default(0),      // 0-100 for download progress
  statusMessage: text("status_message"),
  endpoint: text("endpoint"),                    // http://ip:port when running
  domain: text("domain"),                        // auto-generated routable hostname, e.g. "qwen3-ab12cd34.llmpanel.local"
  errorMessage: text("error_message"),

  // Cost tracking (null for local)
  costPerHour: real("cost_per_hour"),
  totalCost: real("total_cost"),

  startedAt: integer("started_at", { mode: "timestamp" }),
  stoppedAt: integer("stopped_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("deployments_workspaceId_idx").on(table.workspaceId),
])

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  model: one(models, {
    fields: [deployments.modelId],
    references: [models.id],
  }),
  providerConnection: one(providerConnections, {
    fields: [deployments.providerConnectionId],
    references: [providerConnections.id],
  }),
}))

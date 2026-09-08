# 02 — Database Schema

## Connection Setup

```typescript
// packages/db/src/connection.ts
import { drizzle } from "drizzle-orm/libsql"
import { createClient } from "@libsql/client"
import * as schema from "./schema"

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN, // only for Turso
})

export const db = drizzle(client, { schema })
export type DB = typeof db
```

```typescript
// packages/db/src/index.ts
export * from "./schema"
export * from "./connection"
```

```typescript
// packages/db/package.json
{
  "name": "@llmpanel/db",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  }
}
```

## Schema Files

### users.ts
> NOTE: Better Auth CLI generates auth tables (users, sessions, accounts, verifications, two_factors).
> Run: `pnpx @better-auth/cli generate` — do NOT manually create these.
> Only add custom columns if needed by extending via Better Auth config.

### models.ts
```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),                    // "Llama 3.1 8B"
  slug: text("slug").notNull().unique(),            // "llama-3.1-8b"
  family: text("family").notNull(),                // "llama" | "mistral" | "deepseek"
  huggingfaceId: text("huggingface_id").notNull(), // "meta-llama/Llama-3.1-8B-Instruct"
  description: text("description"),
  minVram: real("min_vram").notNull(),              // minimum VRAM in GB
  tags: text("tags").notNull().default("[]"),      // JSON: ["chat","reasoning"]
  supportedQuantizations: text("supported_quantizations").notNull().default("[]"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### providers.ts
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const providerConnections = sqliteTable("provider_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),               // references Better Auth users.id
  providerType: text("provider_type").notNull(),   // "local" | "runpod" | "vastai"
  name: text("name").notNull(),                    // user label: "My RunPod"
  encryptedApiKey: text("encrypted_api_key"),      // null for local
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### deployments.ts
```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  modelId: text("model_id").notNull().references(() => models.id),
  providerConnectionId: text("provider_connection_id")
    .references(() => providerConnections.id),

  // Provider
  externalId: text("external_id"),               // Docker container ID or RunPod pod ID
  providerType: text("provider_type").notNull(),  // "local" | "runpod" | "vastai"
  gpuType: text("gpu_type").notNull(),
  quantization: text("quantization").notNull(),  // "fp16" | "int8" | "int4" | "gguf"
  inferenceEngine: text("inference_engine").notNull().default("vllm"),

  // Status — one of:
  // "provisioning" | "downloading" | "loading" | "health_check" | "running" | "stopped" | "failed"
  status: text("status").notNull().default("provisioning"),
  progress: integer("progress").default(0),      // 0-100 during download
  statusMessage: text("status_message"),
  endpoint: text("endpoint"),                    // http://ip:port when running
  errorMessage: text("error_message"),

  // Cost (null for local/self-hosted)
  costPerHour: real("cost_per_hour"),
  totalCost: real("total_cost"),

  startedAt: integer("started_at", { mode: "timestamp" }),
  stoppedAt: integer("stopped_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### gateway-api-keys.ts
> Named `gatewayApiKeys` (not `apiKeys`) to avoid conflict with Better Auth's generated `apiKey` table.

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const gatewayApiKeys = sqliteTable("gateway_api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  deploymentId: text("deployment_id")
    .references(() => deployments.id),            // null = access all user deployments

  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),   // SHA-256 — never store raw key
  prefix: text("prefix").notNull(),              // "gpup_sk_abc123..." shown in UI

  scopes: text("scopes").notNull().default('["chat"]'), // JSON array
  rpmLimit: integer("rpm_limit"),                // requests/min (null = unlimited)
  tpmLimit: integer("tpm_limit"),                // tokens/min
  dailyLimit: integer("daily_limit"),

  expiresAt: integer("expires_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### request-logs.ts
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id"),
  deploymentId: text("deployment_id"),
  userId: text("user_id"),

  method: text("method").notNull(),
  path: text("path").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  // LLM token tracking
  model: text("model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),

  statusCode: integer("status_code").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  isStreaming: integer("is_streaming", { mode: "boolean" }),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### audit-logs.ts
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),              // "deployment.created" | "api_key.revoked"
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: text("metadata"),                   // JSON string
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

### schema/index.ts
```typescript
// Better Auth generated tables — do NOT manually create
// Run: pnpx @better-auth/cli generate --config apps/api/src/lib/auth.ts

// Your custom tables
export * from "./models"
export * from "./providers"
export * from "./deployments"
export * from "./gateway-api-keys"
export * from "./request-logs"
export * from "./audit-logs"
```

## Drizzle Config

```typescript
// packages/db/drizzle.config.ts
import type { Config } from "drizzle-kit"

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
  },
} satisfies Config
```

## Setup Commands

```bash
# Generate Better Auth tables first
cd apps/api
pnpx @better-auth/cli generate --config src/lib/auth.ts

# Turn schema changes into a migration file
pnpm --filter @llmpanel/db db:generate

# Apply pending migrations to the database
pnpm --filter @llmpanel/db db:migrate
```

The API applies the same migrations on startup, so `db:migrate` is only needed
when you want to migrate without booting it.

> Do not use `drizzle-kit push` here. It writes schema changes straight to the
> database without recording them in the `__drizzle_migrations` ledger, leaving
> the database ahead of the ledger. The API's next startup then replays
> already-applied migrations and fails with `table ... already exists`.

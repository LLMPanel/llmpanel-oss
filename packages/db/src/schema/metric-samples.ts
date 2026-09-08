import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { deployments } from "./deployments"

// Time-series GPU/container telemetry sampled by the API's background
// collector (~20s cadence for running deployments). Hard 24h retention —
// old rows are pruned, no soft delete. Nullable columns mean "provider
// cannot report this", never zero.
export const metricSamples = sqliteTable(
  "metric_samples",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),

    gpuCount: integer("gpu_count").notNull().default(1),
    gpuUtilization: real("gpu_utilization").notNull(),
    vramUsedGb: real("vram_used_gb").notNull(),
    vramTotalGb: real("vram_total_gb").notNull(),

    temperatureCelsius: real("temperature_celsius"),
    powerDrawWatts: real("power_draw_watts"),
    containerCpuPercent: real("container_cpu_percent"),
    containerMemoryPercent: real("container_memory_percent"),
    uptimeSeconds: integer("uptime_seconds"),

    // Per-GPU snapshot (SingleGPUMetrics[]) for detail views
    gpusJson: text("gpus_json"),
  },
  (t) => [index("metric_samples_deployment_ts_idx").on(t.deploymentId, t.timestamp)],
)

CREATE TABLE `metric_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`gpu_count` integer DEFAULT 1 NOT NULL,
	`gpu_utilization` real NOT NULL,
	`vram_used_gb` real NOT NULL,
	`vram_total_gb` real NOT NULL,
	`temperature_celsius` real,
	`power_draw_watts` real,
	`container_cpu_percent` real,
	`container_memory_percent` real,
	`uptime_seconds` integer,
	`gpus_json` text,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `metric_samples_deployment_ts_idx` ON `metric_samples` (`deployment_id`,`timestamp`);
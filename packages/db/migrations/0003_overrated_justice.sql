PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model_id` text,
	`huggingface_id` text NOT NULL,
	`provider_connection_id` text,
	`external_id` text,
	`provider_type` text NOT NULL,
	`gpu_type` text NOT NULL,
	`provider_offer_id` text,
	`gpu_count` integer DEFAULT 1 NOT NULL,
	`quantization` text NOT NULL,
	`inference_engine` text DEFAULT 'vllm' NOT NULL,
	`kv_cache_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`progress` integer DEFAULT 0,
	`status_message` text,
	`endpoint` text,
	`error_message` text,
	`cost_per_hour` real,
	`total_cost` real,
	`started_at` integer,
	`stopped_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_deployments`("id", "user_id", "model_id", "huggingface_id", "provider_connection_id", "external_id", "provider_type", "gpu_type", "provider_offer_id", "gpu_count", "quantization", "inference_engine", "kv_cache_enabled", "status", "progress", "status_message", "endpoint", "error_message", "cost_per_hour", "total_cost", "started_at", "stopped_at", "created_at") SELECT d."id", d."user_id", d."model_id", COALESCE(m."huggingface_id", 'unknown'), d."provider_connection_id", d."external_id", d."provider_type", d."gpu_type", d."provider_offer_id", d."gpu_count", d."quantization", d."inference_engine", d."kv_cache_enabled", d."status", d."progress", d."status_message", d."endpoint", d."error_message", d."cost_per_hour", d."total_cost", d."started_at", d."stopped_at", d."created_at" FROM `deployments` d LEFT JOIN `models` m ON d."model_id" = m."id";--> statement-breakpoint
DROP TABLE `deployments`;--> statement-breakpoint
ALTER TABLE `__new_deployments` RENAME TO `deployments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
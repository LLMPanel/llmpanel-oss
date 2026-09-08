CREATE TABLE `channel_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`encrypted_config` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_message` text,
	`is_active` integer DEFAULT true NOT NULL,
	`connected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `deployments` ADD `gpu_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `deployments` ADD `kv_cache_enabled` integer DEFAULT true NOT NULL;
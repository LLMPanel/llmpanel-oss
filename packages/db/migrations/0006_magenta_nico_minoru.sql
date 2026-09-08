CREATE TABLE `image_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deployment_id` text,
	`api_key_id` text,
	`model` text,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`width` integer,
	`height` integer,
	`steps` integer,
	`guidance_scale` real,
	`seed` integer,
	`file_path` text NOT NULL,
	`url` text NOT NULL,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `deployments` ADD `domain` text;
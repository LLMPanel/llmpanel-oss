CREATE TABLE `channel_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_connection_id` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`platform_username` text,
	`direction` text NOT NULL,
	`content` text NOT NULL,
	`token_count` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_connection_id`) REFERENCES `channel_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `system_prompt` text;--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `memory_enabled` integer DEFAULT true;
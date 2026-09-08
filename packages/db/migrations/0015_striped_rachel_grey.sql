CREATE TABLE `agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text,
	`tool_calls` text,
	`tool_call_id` text,
	`tool_name` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `agent_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_messages_thread_idx` ON `agent_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_threads_agent_idx` ON `agent_threads` (`agent_id`);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `agent_id` text REFERENCES agents(id);--> statement-breakpoint
ALTER TABLE `agents` ADD `emoji` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `tools_enabled` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `rag_collection_id` text REFERENCES rag_collections(id);--> statement-breakpoint
ALTER TABLE `agents` ADD `max_steps` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `temperature` real;--> statement-breakpoint
ALTER TABLE `agents` ADD `max_tokens` integer;
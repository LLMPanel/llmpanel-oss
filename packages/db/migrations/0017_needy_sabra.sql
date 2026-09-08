ALTER TABLE `channel_connections` ADD `agent_id` text REFERENCES agents(id);--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `history_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `history_limit` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `allowlist` text;--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `rate_limit_per_minute` integer;--> statement-breakpoint
CREATE INDEX `channel_messages_conn_user_created_idx` ON `channel_messages` (`channel_connection_id`,`platform_user_id`,`created_at`);
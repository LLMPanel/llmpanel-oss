CREATE TABLE `spend_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_connection_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`cost_per_hour` real NOT NULL,
	`balance` real,
	`running_instances` integer NOT NULL,
	`total_instances` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spend_snapshots_user_ts_idx` ON `spend_snapshots` (`user_id`,`timestamp`);
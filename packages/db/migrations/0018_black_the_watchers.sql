CREATE TABLE `deployment_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`file_name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`counts` text DEFAULT '{}' NOT NULL,
	`includes` text DEFAULT '{}' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployment_backups_deployment_idx` ON `deployment_backups` (`deployment_id`);
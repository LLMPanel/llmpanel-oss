CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`polar_subscription_id` text NOT NULL,
	`polar_customer_id` text NOT NULL,
	`polar_product_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_polar_subscription_id_unique` ON `subscriptions` (`polar_subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_workspaceId_idx` ON `subscriptions` (`workspace_id`);
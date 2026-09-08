CREATE TABLE `waitlist_signups` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_signups_email_unique` ON `waitlist_signups` (`email`);
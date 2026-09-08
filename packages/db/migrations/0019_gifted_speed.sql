ALTER TABLE `user` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `suspended_at` integer;
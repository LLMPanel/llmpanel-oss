CREATE TABLE `agent_collections` (
	`agent_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `collection_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `rag_collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_collections_agent_idx` ON `agent_collections` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_collections_collection_idx` ON `agent_collections` (`collection_id`);--> statement-breakpoint
ALTER TABLE `rag_collections` ADD `top_k` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `rag_collections` ADD `score_threshold` real DEFAULT 0.3 NOT NULL;--> statement-breakpoint
INSERT INTO `agent_collections` (`agent_id`, `collection_id`, `created_at`)
SELECT `id`, `rag_collection_id`, `updated_at` FROM `agents`
WHERE `rag_collection_id` IS NOT NULL;

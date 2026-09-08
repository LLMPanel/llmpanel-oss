CREATE TABLE IF NOT EXISTS `alert_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`encrypted_config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`events` text DEFAULT '["deployment.failed","deployment.running"]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `alert_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deployment_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text,
	`source_type` text DEFAULT 'deployment' NOT NULL,
	`target_deployment_id` text,
	`external_base_url` text,
	`external_model` text,
	`encrypted_external_api_key` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rag_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`vector_store_type` text DEFAULT 'local' NOT NULL,
	`embedding_source` text DEFAULT 'deployment' NOT NULL,
	`embedding_model` text,
	`embedding_dimensions` integer DEFAULT 1536 NOT NULL,
	`external_embedding_url` text,
	`encrypted_external_embedding_key` text,
	`chunk_size` integer DEFAULT 512 NOT NULL,
	`chunk_overlap` integer DEFAULT 50 NOT NULL,
	`chunk_strategy` text DEFAULT 'recursive' NOT NULL,
	`qdrant_url` text,
	`encrypted_qdrant_api_key` text,
	`qdrant_collection_name` text,
	`document_count` integer DEFAULT 0 NOT NULL,
	`total_chunks` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rag_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `rag_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`content` text NOT NULL,
	`embedding` text NOT NULL,
	`metadata` text,
	`chunk_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `rag_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `rag_collections`(`id`) ON UPDATE no action ON DELETE cascade
);

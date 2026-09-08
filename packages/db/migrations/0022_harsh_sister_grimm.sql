ALTER TABLE `provider_connections` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `provider_connections_workspaceId_idx` ON `provider_connections` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `deployments` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `deployments_workspaceId_idx` ON `deployments` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `api_keys_workspaceId_idx` ON `api_keys` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `request_logs` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `request_logs_workspaceId_idx` ON `request_logs` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `spend_snapshots` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `image_generations` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `channel_connections` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `channel_connections_workspaceId_idx` ON `channel_connections` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `agents` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `agents_workspaceId_idx` ON `agents` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `agent_threads` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `rag_collections` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `rag_documents` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `alert_channels` ADD `workspace_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `deployment_backups` ADD `workspace_id` text REFERENCES organization(id);
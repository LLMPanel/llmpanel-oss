-- Custom SQL migration file, put your code below! --
--
-- Workspace backfill (data-only, idempotent / re-runnable).
--
-- Phase 1 gave every NEW user a personal workspace via the better-auth signup
-- hook. This migration does the same for users that already existed, then
-- stamps every workspace-scoped resource with its creator's personal workspace.
--
-- Idempotency: organization/member ids are derived deterministically from the
-- user id ('ws-' / 'wsm-' prefix) and every insert is guarded by NOT EXISTS,
-- so re-running is a no-op. Timestamps are epoch MILLISECONDS (timestamp_ms).

-- 1a. Personal workspace for every user that has no membership at all.
INSERT INTO `organization` (`id`, `name`, `slug`, `logo`, `metadata`, `created_at`, `updated_at`)
SELECT
  'ws-' || u.`id`,
  COALESCE(
    NULLIF(TRIM(u.`name`), ''),
    NULLIF(SUBSTR(u.`email`, 1, INSTR(u.`email`, '@') - 1), ''),
    'Personal'
  ) || '''s Workspace',
  'ws-' || u.`id`,
  NULL,
  NULL,
  CAST(UNIXEPOCH('subsecond') * 1000 AS INTEGER),
  CAST(UNIXEPOCH('subsecond') * 1000 AS INTEGER)
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = u.`id`)
  AND NOT EXISTS (SELECT 1 FROM `organization` o WHERE o.`id` = 'ws-' || u.`id`);
--> statement-breakpoint

-- 1b. Owner membership linking the user to that workspace.
INSERT INTO `member` (`id`, `organization_id`, `user_id`, `role`, `created_at`)
SELECT
  'wsm-' || u.`id`,
  'ws-' || u.`id`,
  u.`id`,
  'owner',
  CAST(UNIXEPOCH('subsecond') * 1000 AS INTEGER)
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = u.`id`)
  AND EXISTS (SELECT 1 FROM `organization` o WHERE o.`id` = 'ws-' || u.`id`);
--> statement-breakpoint

-- 2. Stamp every workspace-scoped resource with the creator's owning workspace.
UPDATE `provider_connections` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `provider_connections`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `provider_connections`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `deployments` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `deployments`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `deployments`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `api_keys` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `api_keys`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `api_keys`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `request_logs` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `request_logs`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `request_logs`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `spend_snapshots` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `spend_snapshots`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `spend_snapshots`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `image_generations` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `image_generations`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `image_generations`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `channel_connections` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `channel_connections`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `channel_connections`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `agents` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `agents`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `agents`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `agent_threads` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `agent_threads`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `agent_threads`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `rag_collections` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `rag_collections`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `rag_collections`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `rag_documents` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `rag_documents`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `rag_documents`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `alert_channels` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `alert_channels`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `alert_channels`.`user_id` AND m.`role` = 'owner');
--> statement-breakpoint

UPDATE `deployment_backups` SET `workspace_id` = (
  SELECT m.`organization_id` FROM `member` m
  WHERE m.`user_id` = `deployment_backups`.`user_id` AND m.`role` = 'owner'
  ORDER BY m.`created_at` ASC LIMIT 1
)
WHERE `workspace_id` IS NULL AND `user_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `member` m WHERE m.`user_id` = `deployment_backups`.`user_id` AND m.`role` = 'owner');

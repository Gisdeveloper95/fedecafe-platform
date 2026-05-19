CREATE TABLE `entity_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text,
	`size_bytes` integer,
	`caption` text,
	`uploaded_by` text,
	`uploaded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`source_capture_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_photos_target` ON `entity_photos` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_photos_uploaded` ON `entity_photos` (`uploaded_at`);
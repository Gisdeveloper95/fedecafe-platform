CREATE TABLE `data_assets` (
	`key` text PRIMARY KEY NOT NULL,
	`layer_type` text NOT NULL,
	`scope` text,
	`version` integer NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer,
	`sha256` text,
	`content_type` text,
	`published_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`published_by` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `idx_assets_layer` ON `data_assets` (`layer_type`,`scope`);--> statement-breakpoint
CREATE INDEX `idx_assets_published` ON `data_assets` (`published_at`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_expires` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `pending_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`op_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`payload_json` text NOT NULL,
	`attachments_json` text,
	`operario_id` text NOT NULL,
	`ruta_id` text,
	`device_fingerprint` text,
	`captured_at` text NOT NULL,
	`uploaded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`gps_lat` real,
	`gps_lon` real,
	`gps_accuracy` real,
	`state` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_notes` text,
	`applied_to_table` text,
	`applied_to_id` text,
	`applied_at` text,
	`apply_error` text,
	FOREIGN KEY (`operario_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pending_state` ON `pending_captures` (`state`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_operario` ON `pending_captures` (`operario_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_target` ON `pending_captures` (`target_type`,`target_id`);
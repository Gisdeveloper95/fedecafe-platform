CREATE TABLE `device_push_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`device_fingerprint` text,
	`device_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_seen_at` text,
	`disabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_push_tokens_token_unique` ON `device_push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_push_user` ON `device_push_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_push_token` ON `device_push_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `estructura_anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`reported_by` text NOT NULL,
	`reported_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`gps_lat` real,
	`gps_lon` real,
	`attachments_json` text,
	`state` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`resolution_notes` text,
	`source_capture_id` text,
	FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_anomalies_state` ON `estructura_anomalies` (`state`,`reported_at`);--> statement-breakpoint
CREATE INDEX `idx_anomalies_target` ON `estructura_anomalies` (`target_type`,`target_id`);--> statement-breakpoint
ALTER TABLE `rutas` ADD `fecha_objetivo` text;--> statement-breakpoint
CREATE INDEX `idx_rutas_fecha` ON `rutas` (`fecha_objetivo`);
CREATE TABLE `tuberias` (
	`codigo` text PRIMARY KEY NOT NULL,
	`layer_name` text NOT NULL,
	`material` text,
	`diametro` text,
	`ramal` text,
	`municipio` text,
	`acueducto` text,
	`longitud_m` real,
	`centroid_lat` real,
	`centroid_lon` real,
	`geometry_json` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tuberias_layer` ON `tuberias` (`layer_name`);--> statement-breakpoint
CREATE INDEX `idx_tuberias_municipio` ON `tuberias` (`municipio`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pending_captures` (
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
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pending_captures`("id", "op_type", "target_type", "target_id", "payload_json", "attachments_json", "operario_id", "ruta_id", "device_fingerprint", "captured_at", "uploaded_at", "gps_lat", "gps_lon", "gps_accuracy", "state", "reviewed_by", "reviewed_at", "review_notes", "applied_to_table", "applied_to_id", "applied_at", "apply_error") SELECT "id", "op_type", "target_type", "target_id", "payload_json", "attachments_json", "operario_id", "ruta_id", "device_fingerprint", "captured_at", "uploaded_at", "gps_lat", "gps_lon", "gps_accuracy", "state", "reviewed_by", "reviewed_at", "review_notes", "applied_to_table", "applied_to_id", "applied_at", "apply_error" FROM `pending_captures`;--> statement-breakpoint
DROP TABLE `pending_captures`;--> statement-breakpoint
ALTER TABLE `__new_pending_captures` RENAME TO `pending_captures`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_pending_state` ON `pending_captures` (`state`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_operario` ON `pending_captures` (`operario_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_target` ON `pending_captures` (`target_type`,`target_id`);
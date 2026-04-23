CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`target_id` text,
	`details` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_user_time` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `estructuras` (
	`codigo` text PRIMARY KEY NOT NULL,
	`layer_name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`ramal` text,
	`nombre` text,
	`tipo` text,
	`estado` text,
	`municipio` text,
	`acueducto` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_estructuras_layer` ON `estructuras` (`layer_name`);--> statement-breakpoint
CREATE INDEX `idx_estructuras_municipio` ON `estructuras` (`municipio`);--> statement-breakpoint
CREATE TABLE `medidores` (
	`contrato` text PRIMARY KEY NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`usuario` text,
	`nombre` text,
	`direccion` text,
	`municipio` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_medidores_municipio` ON `medidores` (`municipio`);--> statement-breakpoint
CREATE TABLE `recorrido_puntos` (
	`recorrido_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`velocidad_ms` real,
	`precision_m` real,
	`bateria_pct` integer,
	PRIMARY KEY(`recorrido_id`, `timestamp`),
	FOREIGN KEY (`recorrido_id`) REFERENCES `recorridos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recorridos` (
	`id` text PRIMARY KEY NOT NULL,
	`operario_id` text NOT NULL,
	`ruta_id` text,
	`iniciado_at` text NOT NULL,
	`finalizado_at` text NOT NULL,
	`distancia_total_m` real,
	`duracion_segundos` integer,
	`subido_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`operario_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recorridos_operario` ON `recorridos` (`operario_id`,`iniciado_at`);--> statement-breakpoint
CREATE TABLE `ruta_items` (
	`ruta_id` text NOT NULL,
	`codigo` text NOT NULL,
	`orden` integer,
	`visitado` integer DEFAULT false NOT NULL,
	`visitado_at` text,
	PRIMARY KEY(`ruta_id`, `codigo`),
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rutas` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`operario_id` text NOT NULL,
	`creada_por` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`notas` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`operario_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creada_por`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rutas_operario` ON `rutas` (`operario_id`,`estado`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_fingerprint` text NOT NULL,
	`device_name` text,
	`refresh_token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_refresh` ON `sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_by` text,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_username` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `web_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_sessions_token_unique` ON `web_sessions` (`token`);
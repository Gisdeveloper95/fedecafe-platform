CREATE TABLE `demo_tokens` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text,
	`expires_at` text NOT NULL,
	`max_activations` integer DEFAULT 1 NOT NULL,
	`activations_used` integer DEFAULT 0 NOT NULL,
	`is_revoked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_by` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `idx_demo_tokens_expires` ON `demo_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `global_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_password_resets_user` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_password_resets_token` ON `password_resets` (`token_hash`);--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `account_type` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `access_expires_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `demo_token_code` text;--> statement-breakpoint
CREATE INDEX `idx_users_status` ON `users` (`status`);
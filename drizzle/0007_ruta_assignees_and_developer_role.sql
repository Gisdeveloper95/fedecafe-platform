CREATE TABLE `ruta_assignees` (
	`ruta_id` text NOT NULL,
	`operario_id` text NOT NULL,
	`asignado_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (`ruta_id`, `operario_id`),
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`operario_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ruta_assignees_operario` ON `ruta_assignees` (`operario_id`);
--> statement-breakpoint
INSERT INTO `ruta_assignees` (`ruta_id`, `operario_id`)
SELECT `id`, `operario_id` FROM `rutas`
WHERE NOT EXISTS (
  SELECT 1 FROM `ruta_assignees` ra
  WHERE ra.`ruta_id` = `rutas`.`id` AND ra.`operario_id` = `rutas`.`operario_id`
);

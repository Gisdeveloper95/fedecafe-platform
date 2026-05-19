ALTER TABLE `ruta_items` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `ruta_items` ADD `wp_lat` real;--> statement-breakpoint
ALTER TABLE `ruta_items` ADD `wp_lon` real;--> statement-breakpoint
ALTER TABLE `ruta_items` ADD `wp_label` text;--> statement-breakpoint
ALTER TABLE `rutas` ADD `start_point_json` text;
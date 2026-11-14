CREATE TABLE `change_log` (
	`version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`device_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_version_idx` ON `change_log` (`version`);--> statement-breakpoint
CREATE TABLE `client_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`default_price` real,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`name`);--> statement-breakpoint
CREATE TABLE `farm_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`farm_name` text DEFAULT 'My Farm' NOT NULL,
	`eggs_per_tray` integer DEFAULT 30 NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`device_id` text DEFAULT 'D1' NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_counters` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`order_id` text NOT NULL,
	`size_id` text NOT NULL,
	`eggs` integer NOT NULL,
	`price_per_tray` real NOT NULL,
	`line_total` real NOT NULL,
	`dropped_eggs` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`order_id`, `size_id`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_lines_size_idx` ON `order_lines` (`size_id`);--> statement-breakpoint
CREATE TABLE `order_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`client_id` text NOT NULL,
	`order_date` text NOT NULL,
	`wanted_by` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`cancelled_at` text,
	`closed_short_at` text,
	`converted_from_sale_number` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_key` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_date_idx` ON `orders` (`order_date`,`order_number`);--> statement-breakpoint
CREATE INDEX `orders_client_idx` ON `orders` (`client_id`);--> statement-breakpoint
CREATE TABLE `outbox_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`mutation_type` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox_mutations` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `production` (
	`id` text PRIMARY KEY NOT NULL,
	`produced_on` text NOT NULL,
	`size_id` text,
	`quality` text NOT NULL,
	`eggs` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `production_date_idx` ON `production` (`produced_on`);--> statement-breakpoint
CREATE INDEX `production_size_idx` ON `production` (`size_id`);--> statement-breakpoint
CREATE TABLE `production_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`produced_on` text NOT NULL,
	`had_before` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_counters` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`sale_id` text NOT NULL,
	`size_id` text NOT NULL,
	`eggs` integer NOT NULL,
	`price_per_tray` real NOT NULL,
	`line_total` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`sale_id`, `size_id`),
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sale_lines_size_idx` ON `sale_lines` (`size_id`);--> statement-breakpoint
CREATE TABLE `sale_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_number` text NOT NULL,
	`client_id` text,
	`type` text NOT NULL,
	`sale_date` text NOT NULL,
	`order_id` text,
	`order_number` text,
	`version` integer DEFAULT 1 NOT NULL,
	`voided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_number_key` ON `sales` (`sale_number`);--> statement-breakpoint
CREATE INDEX `sales_date_idx` ON `sales` (`sale_date`,`sale_number`);--> statement-breakpoint
CREATE INDEX `sales_client_idx` ON `sales` (`client_id`);--> statement-breakpoint
CREATE INDEX `sales_order_idx` ON `sales` (`order_id`);--> statement-breakpoint
CREATE TABLE `size_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`size_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`size_id`) REFERENCES `sizes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sizes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`color_slot` integer NOT NULL,
	`archived_at` text,
	`default_price` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sizes_color_slot_key` ON `sizes` (`color_slot`);--> statement-breakpoint
CREATE TABLE `sync_rejections` (
	`id` text PRIMARY KEY NOT NULL,
	`mutation_id` text NOT NULL,
	`device_id` text NOT NULL,
	`mutation_type` text NOT NULL,
	`entity_ref` text NOT NULL,
	`error_code` text NOT NULL,
	`reason` text,
	`error_message` text NOT NULL,
	`occurred_at` text NOT NULL,
	`rejected_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `sync_rejections_unresolved_idx` ON `sync_rejections` (`resolved_at`,`rejected_at`);--> statement-breakpoint
CREATE INDEX `sync_rejections_mutation_idx` ON `sync_rejections` (`mutation_id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`tenant_id` text,
	`cloud_url` text,
	`cloud_token` text,
	`last_pulled_version` integer DEFAULT 0 NOT NULL,
	`last_pulled_at` text,
	`last_pushed_at` text,
	`status` text DEFAULT 'local_only' NOT NULL,
	`last_error` text,
	`needs_reconcile` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);

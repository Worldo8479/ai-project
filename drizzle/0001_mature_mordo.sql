ALTER TABLE `reviews` ADD `revision` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `deleted_at` text;
CREATE TABLE `account_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`currency` text NOT NULL,
	`target` integer NOT NULL,
	`revision` text NOT NULL,
	`updated_at` text NOT NULL
);

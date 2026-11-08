CREATE TABLE `reviews` (
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`currency` text NOT NULL,
	`target` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `month`, `currency`)
);

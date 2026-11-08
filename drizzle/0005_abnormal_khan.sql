CREATE TABLE `billing_events` (
	`scope` text NOT NULL,
	`event_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	PRIMARY KEY(`scope`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `billing_subscription_state` (
	`account_reference` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`subscription_id` text,
	`valid_until` integer,
	`cancels_at_period_end` integer NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`account_reference`) REFERENCES `billing_accounts`(`reference`) ON UPDATE no action ON DELETE no action
);

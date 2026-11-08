CREATE TABLE `billing_accounts` (
	`scope` text NOT NULL,
	`user_id` text NOT NULL,
	`reference` text NOT NULL,
	`customer_id` text,
	`customer_key` text NOT NULL,
	`customer_requested_at` integer,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_reference_unique` ON `billing_accounts` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_customer_key_unique` ON `billing_accounts` (`customer_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customer_owner` ON `billing_accounts` (`scope`,`customer_id`);--> statement-breakpoint
CREATE TABLE `billing_checkouts` (
	`request_key` text PRIMARY KEY NOT NULL,
	`account_reference` text NOT NULL,
	`created_at` integer NOT NULL,
	`session_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`account_reference`) REFERENCES `billing_accounts`(`reference`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkouts_session_id_unique` ON `billing_checkouts` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_active_checkout` ON `billing_checkouts` (`account_reference`) WHERE "billing_checkouts"."state" != 'expired';
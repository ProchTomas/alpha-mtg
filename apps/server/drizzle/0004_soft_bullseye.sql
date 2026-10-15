CREATE TABLE `card_terms` (
	`oracle_id` text NOT NULL,
	`term` text NOT NULL,
	PRIMARY KEY(`oracle_id`, `term`)
);
--> statement-breakpoint
CREATE INDEX `card_terms_term` ON `card_terms` (`term`);--> statement-breakpoint
CREATE TABLE `term_df` (
	`term` text PRIMARY KEY NOT NULL,
	`df` integer NOT NULL,
	`docs` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `cards` ADD `color_identity_mask` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `card_tags_tag` ON `card_tags` (`tag`);
ALTER TABLE `cards` ADD `edhrec_rank` integer;--> statement-breakpoint
ALTER TABLE `cards` ADD `promo` integer DEFAULT false NOT NULL;
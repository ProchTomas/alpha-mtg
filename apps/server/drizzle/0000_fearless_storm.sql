CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`oracle_id` text NOT NULL,
	`name` text NOT NULL,
	`set_code` text NOT NULL,
	`collector_number` text NOT NULL,
	`type_line` text,
	`oracle_text` text,
	`mana_cost` text,
	`cmc` real,
	`colors` text DEFAULT '[]' NOT NULL,
	`color_identity` text DEFAULT '[]' NOT NULL,
	`layout` text,
	`power` text,
	`toughness` text,
	`image_uris` text,
	`card_faces` text,
	`released_at` text,
	`set_type` text,
	`digital` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_oracle_id` ON `cards` (`oracle_id`);--> statement-breakpoint
CREATE INDEX `cards_name_nocase` ON `cards` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `cards_set_cn` ON `cards` (`set_code`,`collector_number`);--> statement-breakpoint
CREATE TABLE `deck_cards` (
	`deck_id` text NOT NULL,
	`card_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`board` text DEFAULT 'main' NOT NULL,
	PRIMARY KEY(`deck_id`, `card_id`, `board`),
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'casual' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`cover_card_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `decks_user_id` ON `decks` (`user_id`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`user_a` text NOT NULL,
	`user_b` text NOT NULL,
	`requester_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_a`, `user_b`),
	FOREIGN KEY (`user_a`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_b`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friendships_user_b` ON `friendships` (`user_b`);--> statement-breakpoint
CREATE TABLE `game_log` (
	`game_id` text NOT NULL,
	`seq` integer NOT NULL,
	`at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	PRIMARY KEY(`game_id`, `seq`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `game_players` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seat` integer NOT NULL,
	`deck_id` text,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`game_id`, `user_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`join_code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`state` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_join_code_unique` ON `games` (`join_code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`email` text,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
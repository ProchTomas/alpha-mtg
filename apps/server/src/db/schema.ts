import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// JSON columns are TEXT holding JSON (see guide §10). Drizzle's { mode: "json" } handles (de)serialising.

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(), // scryfall id
    oracleId: text("oracle_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    typeLine: text("type_line"),
    oracleText: text("oracle_text"),
    manaCost: text("mana_cost"),
    cmc: real("cmc"),
    colors: text("colors", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    colorIdentity: text("color_identity", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    layout: text("layout"),
    power: text("power"),
    toughness: text("toughness"),
    imageUris: text("image_uris", { mode: "json" }).$type<Record<string, string>>(),
    cardFaces: text("card_faces", { mode: "json" }).$type<unknown[]>(),
    releasedAt: text("released_at"), // ISO date
    setType: text("set_type"),
    digital: integer("digital", { mode: "boolean" }).notNull().default(false),
    /** Scryfall popularity rank (lower = more played). Used as a search tiebreaker. */
    edhrecRank: integer("edhrec_rank"),
    promo: integer("promo", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("cards_oracle_id").on(t.oracleId),
    index("cards_name_nocase").on(sql`${t.name} COLLATE NOCASE`),
    index("cards_set_cn").on(t.setCode, t.collectorNumber),
  ],
);

/** Functional categories per oracle id, rebuilt from Scryfall Oracle Tags on each ingest. */
export const cardTags = sqliteTable(
  "card_tags",
  {
    oracleId: text("oracle_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.oracleId, t.tag] })],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryHash: text("recovery_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sessions_user_id").on(t.userId)],
);

export const friendships = sqliteTable(
  "friendships",
  {
    // One row per pair; userA < userB lexically so (a,b) and (b,a) can't both exist.
    userA: text("user_a").notNull().references(() => users.id, { onDelete: "cascade" }),
    userB: text("user_b").notNull().references(() => users.id, { onDelete: "cascade" }),
    requesterId: text("requester_id").notNull(),
    status: text("status", { enum: ["pending", "accepted", "blocked"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] }), index("friendships_user_b").on(t.userB)],
);

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    format: text("format").notNull().default("casual"),
    visibility: text("visibility", { enum: ["private", "unlisted", "public"] }).notNull().default("private"),
    coverCardId: text("cover_card_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("decks_user_id").on(t.userId)],
);

export const deckCards = sqliteTable(
  "deck_cards",
  {
    deckId: text("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull(),
    board: text("board", { enum: ["main", "side", "command", "maybe"] }).notNull().default("main"),
  },
  (t) => [primaryKey({ columns: [t.deckId, t.cardId, t.board] })],
);

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  hostId: text("host_id").notNull().references(() => users.id),
  joinCode: text("join_code").notNull().unique(),
  status: text("status", { enum: ["lobby", "playing", "ended"] }).notNull().default("lobby"),
  state: text("state", { mode: "json" }).$type<unknown>(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

export const gamePlayers = sqliteTable(
  "game_players",
  {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    seat: integer("seat").notNull(),
    deckId: text("deck_id").references(() => decks.id, { onDelete: "set null" }),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })],
);

/** Full append-only game log; games.state.log is capped at 500 entries. */
export const gameLog = sqliteTable(
  "game_log",
  {
    gameId: text("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action", { mode: "json" }).$type<unknown>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.seq] })],
);

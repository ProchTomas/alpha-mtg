import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { config, ensureDataDirs } from "../config.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof openDb>["db"];
export type Sqlite = Database.Database;

export function openDb(file: string = config.dbFile) {
  ensureDataDirs();
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** Runs the drizzle-kit migrations, then the bits drizzle can't express (FTS5). */
export function runMigrations(sqlite: Sqlite, db: Db): void {
  migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  ensureFts(sqlite);
}

/**
 * External-content FTS5 table over cards, kept in sync by triggers.
 * `name` is indexed with a prefix index so autocomplete (`name MATCH 'light*'`) is fast.
 */
export function ensureFts(sqlite: Sqlite): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
      name, type_line, oracle_text,
      content='cards', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2',
      prefix='2 3 4'
    );
    CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
      INSERT INTO cards_fts(rowid, name, type_line, oracle_text)
      VALUES (new.rowid, new.name, new.type_line, new.oracle_text);
    END;
    CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, name, type_line, oracle_text)
      VALUES ('delete', old.rowid, old.name, old.type_line, old.oracle_text);
    END;
    CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
      INSERT INTO cards_fts(cards_fts, rowid, name, type_line, oracle_text)
      VALUES ('delete', old.rowid, old.name, old.type_line, old.oracle_text);
      INSERT INTO cards_fts(rowid, name, type_line, oracle_text)
      VALUES (new.rowid, new.name, new.type_line, new.oracle_text);
    END;
  `);
}

export { schema };

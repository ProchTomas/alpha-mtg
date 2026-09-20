import { openDb, runMigrations } from "./index.js";
import { config } from "../config.js";

const { db, sqlite } = openDb();
runMigrations(sqlite, db);
console.log(`migrated ${config.dbFile}`);
sqlite.close();

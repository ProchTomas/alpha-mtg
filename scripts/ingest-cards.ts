// Usage: npm run ingest [-- --force] [--include-digital]
// Downloads Scryfall default_cards bulk data and upserts it into the SQLite cards table.
import { openDb, runMigrations } from "../apps/server/src/db/index.js";
import { ingestScryfall } from "../apps/server/src/ingest/scryfall.js";

const args = new Set(process.argv.slice(2));
const { db, sqlite } = openDb();
runMigrations(sqlite, db);

const t0 = Date.now();
const result = await ingestScryfall(sqlite, {
  force: args.has("--force"),
  includeDigital: args.has("--include-digital"),
  log: (m) => console.log(m),
});
console.log(`done: ${result.upserted} upserted, ${result.skipped} skipped in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
sqlite.close();

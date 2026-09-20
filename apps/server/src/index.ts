import { buildApp } from "./app.js";
import { config } from "./config.js";
import { openDb, runMigrations } from "./db/index.js";

const { db, sqlite } = openDb();
runMigrations(sqlite, db);

const app = await buildApp({ db, sqlite });

const shutdown = async () => {
  app.games.flushAll();
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });

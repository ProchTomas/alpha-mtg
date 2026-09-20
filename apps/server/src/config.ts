import path from "node:path";
import fs from "node:fs";

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

const dataDir = path.resolve(env("DATA_DIR", path.resolve(import.meta.dirname, "../../../data")));

export const config = {
  appName: env("APP_NAME", "Alpha MTG"),
  appUrl: env("APP_URL", "http://localhost:5173"),
  contactEmail: env("CONTACT_EMAIL", "you@example.com"),
  port: Number(env("PORT", "3000")),
  host: env("HOST", "127.0.0.1"),
  dataDir,
  dbFile: env("DATABASE_FILE", path.join(dataDir, "data.db")),
  imgDir: path.join(dataDir, "img"),
  uploadsDir: path.join(dataDir, "uploads"),
  scryfallDir: path.join(dataDir, "scryfall"),
  cookieSecret: env("COOKIE_SECRET", "dev-only-not-secret"),
  isProd: process.env.NODE_ENV === "production",
  /** Sent on every outbound request to Scryfall, as their API guidelines require. */
  get userAgent() {
    return `${this.appName}/0.1 (+${this.appUrl}; ${this.contactEmail})`;
  },
};

export function ensureDataDirs(): void {
  for (const d of [config.dataDir, config.imgDir, config.uploadsDir, config.scryfallDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

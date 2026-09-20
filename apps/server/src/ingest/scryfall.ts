import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import readline from "node:readline";
import zlib from "node:zlib";
import { config, ensureDataDirs } from "../config.js";
import { ensureFts, type Sqlite } from "../db/index.js";

type BulkEntry = { type: string; jsonl_download_uri: string; updated_at: string; compressed_size: number };

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  layout?: string;
  power?: string;
  toughness?: string;
  image_uris?: Record<string, string>;
  card_faces?: unknown[];
  released_at?: string;
  set_type?: string;
  digital?: boolean;
  edhrec_rank?: number;
  promo?: boolean;
};

const EXCLUDED_LAYOUTS = new Set(["art_series"]);
const EXCLUDED_SET_TYPES = new Set(["memorabilia", "minigame"]);

export type IngestOptions = {
  /** Re-download even if the cached bulk file is up to date. */
  force?: boolean;
  /** Keep digital-only (Arena/MTGO) printings. Default: drop them. */
  includeDigital?: boolean;
  log?: (msg: string) => void;
};

async function fetchBulkEntry(): Promise<BulkEntry> {
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bulk-data listing failed: ${res.status}`);
  const body = (await res.json()) as { data: BulkEntry[] };
  const entry = body.data.find((d) => d.type === "default_cards");
  if (!entry) throw new Error("no default_cards entry in bulk-data");
  return entry;
}

async function downloadBulk(entry: BulkEntry, file: string, log: (m: string) => void): Promise<void> {
  log(`downloading ${entry.jsonl_download_uri} (${(entry.compressed_size / 1e6).toFixed(0)} MB gz)`);
  const res = await fetch(entry.jsonl_download_uri, { headers: { "User-Agent": config.userAgent } });
  if (!res.ok || !res.body) throw new Error(`bulk download failed: ${res.status}`);
  const tmp = `${file}.tmp`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
  await fsp.rename(tmp, file);
}

function cardValues(c: ScryfallCard) {
  return {
    id: c.id,
    oracle_id: c.oracle_id ?? (Array.isArray(c.card_faces) ? (c.card_faces[0] as { oracle_id?: string })?.oracle_id : undefined) ?? c.id,
    name: c.name,
    set_code: c.set,
    collector_number: c.collector_number,
    type_line: c.type_line ?? null,
    oracle_text: c.oracle_text ?? null,
    mana_cost: c.mana_cost ?? null,
    cmc: c.cmc ?? null,
    colors: JSON.stringify(c.colors ?? []),
    color_identity: JSON.stringify(c.color_identity ?? []),
    layout: c.layout ?? null,
    power: c.power ?? null,
    toughness: c.toughness ?? null,
    image_uris: c.image_uris ? JSON.stringify(c.image_uris) : null,
    card_faces: c.card_faces ? JSON.stringify(c.card_faces) : null,
    released_at: c.released_at ?? null,
    set_type: c.set_type ?? null,
    digital: c.digital ? 1 : 0,
    edhrec_rank: c.edhrec_rank ?? null,
    promo: c.promo ? 1 : 0,
  };
}

/**
 * Download Scryfall's default_cards bulk file (gzipped JSONL) (if newer than the cached copy) and upsert
 * every printing into `cards`. Never deletes: decks reference card ids.
 */
export async function ingestScryfall(sqlite: Sqlite, opts: IngestOptions = {}): Promise<{ upserted: number; skipped: number }> {
  const log = opts.log ?? (() => {});
  ensureDataDirs();
  const file = path.join(config.scryfallDir, "default_cards.jsonl.gz");
  const metaFile = path.join(config.scryfallDir, "default_cards.meta.json");

  const entry = await fetchBulkEntry();
  let cached: { updated_at?: string } = {};
  try {
    cached = JSON.parse(await fsp.readFile(metaFile, "utf8"));
  } catch {
    /* no cache yet */
  }
  if (opts.force || cached.updated_at !== entry.updated_at || !fs.existsSync(file)) {
    await downloadBulk(entry, file, log);
    await fsp.writeFile(metaFile, JSON.stringify({ updated_at: entry.updated_at, size: entry.compressed_size }));
  } else {
    log(`bulk file up to date (${entry.updated_at}), reusing cached download`);
  }

  // Triggers + INSERT OR REPLACE don't play well with external-content FTS; drop them,
  // load, then rebuild the index once and recreate the triggers.
  sqlite.exec(`DROP TRIGGER IF EXISTS cards_ai; DROP TRIGGER IF EXISTS cards_ad; DROP TRIGGER IF EXISTS cards_au;`);

  const upsert = sqlite.prepare(`
    INSERT INTO cards (id, oracle_id, name, set_code, collector_number, type_line, oracle_text, mana_cost, cmc,
      colors, color_identity, layout, power, toughness, image_uris, card_faces, released_at, set_type, digital, edhrec_rank, promo)
    VALUES (@id, @oracle_id, @name, @set_code, @collector_number, @type_line, @oracle_text, @mana_cost, @cmc,
      @colors, @color_identity, @layout, @power, @toughness, @image_uris, @card_faces, @released_at, @set_type, @digital, @edhrec_rank, @promo)
    ON CONFLICT(id) DO UPDATE SET
      oracle_id=excluded.oracle_id, name=excluded.name, set_code=excluded.set_code,
      collector_number=excluded.collector_number, type_line=excluded.type_line, oracle_text=excluded.oracle_text,
      mana_cost=excluded.mana_cost, cmc=excluded.cmc, colors=excluded.colors, color_identity=excluded.color_identity,
      layout=excluded.layout, power=excluded.power, toughness=excluded.toughness, image_uris=excluded.image_uris,
      card_faces=excluded.card_faces, released_at=excluded.released_at, set_type=excluded.set_type, digital=excluded.digital,
      edhrec_rank=excluded.edhrec_rank, promo=excluded.promo
  `);
  const insertBatch = sqlite.transaction((rows: ReturnType<typeof cardValues>[]) => {
    for (const r of rows) upsert.run(r);
  });

  let upserted = 0;
  let skipped = 0;
  let batch: ReturnType<typeof cardValues>[] = [];
  const flush = () => {
    if (batch.length === 0) return;
    insertBatch(batch);
    upserted += batch.length;
    batch = [];
    if (upserted % 20000 === 0) log(`  ${upserted} rows`);
  };

  const lines = readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const c = JSON.parse(line) as ScryfallCard;
    if (
      EXCLUDED_LAYOUTS.has(c.layout ?? "") ||
      EXCLUDED_SET_TYPES.has(c.set_type ?? "") ||
      (!opts.includeDigital && c.digital)
    ) {
      skipped++;
      continue;
    }
    batch.push(cardValues(c));
    if (batch.length >= 2000) flush();
  }
  flush();

  log("rebuilding full-text index");
  sqlite.exec(`INSERT INTO cards_fts(cards_fts) VALUES('rebuild');`);
  ensureFts(sqlite);
  sqlite.exec(`ANALYZE;`);

  return { upserted, skipped };
}

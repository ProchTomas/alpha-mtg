import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { CATEGORY_IDS } from "@alphamtg/shared";
import { config, ensureDataDirs } from "../config.js";
import type { Sqlite } from "../db/index.js";

type BulkEntry = { type: string; jsonl_download_uri: string; updated_at: string; compressed_size: number };

type TagRecord = {
  id: string;
  slug: string;
  child_ids?: string[];
  taggings?: Array<{ oracle_id: string; weight?: string }>;
};

/**
 * Which Scryfall tag trees feed each of our categories. `include` trees are walked to every
 * descendant; `exclude` trees are then subtracted, which is how land tutors end up as Ramp
 * rather than Tutors, and how sweepers stay out of Removal.
 */
const SOURCES: Record<string, { include: string[]; exclude?: string[] }> = {
  ramp: { include: ["ramp", "tutor-land"] },
  draw: { include: ["draw"] },
  removal: { include: ["removal"], exclude: ["sweeper"] },
  wipe: { include: ["sweeper"] },
  interaction: { include: ["counterspell", "protection"] },
  tutor: { include: ["tutor"], exclude: ["tutor-land"] },
  recursion: { include: ["recursion"] },
};

export type TagIngestOptions = { force?: boolean; log?: (msg: string) => void };

async function fetchBulkEntry(): Promise<BulkEntry> {
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": config.userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bulk-data listing failed: ${res.status}`);
  const body = (await res.json()) as { data: BulkEntry[] };
  const entry = body.data.find((d) => d.type === "oracle_tags");
  if (!entry) throw new Error("no oracle_tags entry in bulk-data");
  return entry;
}

/**
 * Download Scryfall's Oracle Tags and resolve them into card_tags rows, one per
 * (oracle_id, category). Tags are curated over time, so the table is rebuilt each run.
 */
export async function ingestTags(sqlite: Sqlite, opts: TagIngestOptions = {}): Promise<Record<string, number>> {
  const log = opts.log ?? (() => {});
  ensureDataDirs();
  const file = path.join(config.scryfallDir, "oracle_tags.jsonl.gz");
  const metaFile = path.join(config.scryfallDir, "oracle_tags.meta.json");

  const entry = await fetchBulkEntry();
  let cached: { updated_at?: string } = {};
  try {
    cached = JSON.parse(await fsp.readFile(metaFile, "utf8"));
  } catch {
    /* no cache yet */
  }
  if (opts.force || cached.updated_at !== entry.updated_at || !fs.existsSync(file)) {
    log(`downloading oracle tags (${(entry.compressed_size / 1e6).toFixed(0)} MB gz)`);
    const res = await fetch(entry.jsonl_download_uri, { headers: { "User-Agent": config.userAgent } });
    if (!res.ok || !res.body) throw new Error(`oracle tags download failed: ${res.status}`);
    const tmp = `${file}.tmp`;
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
    await fsp.rename(tmp, file);
    await fsp.writeFile(metaFile, JSON.stringify({ updated_at: entry.updated_at }));
  } else {
    log("oracle tags up to date, reusing cached download");
  }

  const byId = new Map<string, TagRecord>();
  const bySlug = new Map<string, TagRecord>();
  const lines = readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as TagRecord;
    byId.set(rec.id, rec);
    bySlug.set(rec.slug, rec);
  }

  /** Every oracle id under a tag, following the child hierarchy. */
  const rollup = (slug: string): Set<string> => {
    const out = new Set<string>();
    const seen = new Set<string>();
    const walk = (rec: TagRecord | undefined): void => {
      if (!rec || seen.has(rec.id)) return;
      seen.add(rec.id);
      for (const t of rec.taggings ?? []) out.add(t.oracle_id);
      for (const child of rec.child_ids ?? []) walk(byId.get(child));
    };
    walk(bySlug.get(slug));
    return out;
  };

  // Ramp means mana from something other than a land, so drop cards whose front face is a land
  // (Fabled Passage, Urza's Tower…). A card that merely turns into a land later, like
  // Growing Rites of Itlimoc, has a nonland front face and still counts.
  const landOracleIds = new Set(
    sqlite
      .prepare<[], { oracle_id: string }>(
        `SELECT DISTINCT oracle_id FROM cards
         WHERE CASE WHEN instr(type_line, ' // ') > 0
                    THEN substr(type_line, 1, instr(type_line, ' // ') - 1)
                    ELSE coalesce(type_line, '') END LIKE '%Land%'`,
      )
      .all()
      .map((r) => r.oracle_id),
  );

  const counts: Record<string, number> = {};
  const rows: Array<{ oracle_id: string; tag: string }> = [];
  for (const category of CATEGORY_IDS) {
    const src = SOURCES[category];
    if (!src) continue;
    const ids = new Set<string>();
    for (const slug of src.include) for (const id of rollup(slug)) ids.add(id);
    for (const slug of src.exclude ?? []) for (const id of rollup(slug)) ids.delete(id);
    if (category === "ramp") for (const id of landOracleIds) ids.delete(id);
    counts[category] = ids.size;
    for (const id of ids) rows.push({ oracle_id: id, tag: category });
  }

  const insert = sqlite.prepare(`INSERT OR REPLACE INTO card_tags (oracle_id, tag) VALUES (@oracle_id, @tag)`);
  const write = sqlite.transaction((batch: typeof rows) => {
    sqlite.prepare(`DELETE FROM card_tags`).run();
    for (const r of batch) insert.run(r);
  });
  write(rows);
  log(`tagged ${rows.length} (oracle, category) pairs`);
  return counts;
}

import type { CardSummary } from "@playster/shared";
import type { Sqlite } from "../db/index.js";

type Row = {
  id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  type_line: string | null;
  oracle_text: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string;
  color_identity: string;
  layout: string | null;
  power: string | null;
  toughness: string | null;
  image_uris: string | null;
  card_faces: string | null;
  released_at: string | null;
};

const COLS = `id, oracle_id, name, set_code, collector_number, type_line, oracle_text, mana_cost, cmc,
  colors, color_identity, layout, power, toughness, image_uris, card_faces, released_at`;
/** Lower is a "nicer" printing to show by default: paper, non-promo, from a real set. Alias the table as c. */
const PRINTING_PENALTY = `(c.digital + c.promo * 2 + (c.layout = 'reversible_card') * 4
  + (c.set_type NOT IN ('expansion', 'core', 'commander', 'masters', 'draft_innovation', 'starter')) * 8
  + (c.set_code IN ('sld', 'plst', 'mb1', 'mb2')) * 16)`;
const QCOLS = COLS.replace(/\b(\w+)\b/g, "cards.$1");

function rowToCard(r: Row): CardSummary {
  return {
    id: r.id,
    oracleId: r.oracle_id,
    name: r.name,
    setCode: r.set_code,
    collectorNumber: r.collector_number,
    typeLine: r.type_line,
    oracleText: r.oracle_text,
    manaCost: r.mana_cost,
    cmc: r.cmc,
    colors: JSON.parse(r.colors),
    colorIdentity: JSON.parse(r.color_identity),
    layout: r.layout,
    power: r.power,
    toughness: r.toughness,
    imageUris: r.image_uris ? JSON.parse(r.image_uris) : null,
    cardFaces: r.card_faces ? JSON.parse(r.card_faces) : null,
    releasedAt: r.released_at,
  };
}

/** Escape a user string for an FTS5 MATCH expression: quote each token, add prefix wildcard. */
function ftsQuery(q: string): string {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"*`).join(" ");
}

export class CardService {
  private readonly byId;
  private readonly byIds;
  private readonly exactName;
  private readonly bySetCn;
  private readonly search;
  private readonly printings;
  private readonly count;

  constructor(private readonly sqlite: Sqlite) {
    this.byId = sqlite.prepare<[string], Row>(`SELECT ${COLS} FROM cards WHERE id = ?`);
    this.byIds = (ids: string[]) =>
      sqlite
        .prepare<string[], Row>(`SELECT ${COLS} FROM cards WHERE id IN (${ids.map(() => "?").join(",")})`)
        .all(...ids);
    // Newest paper printing for an exact name (case-insensitive).
    this.exactName = sqlite.prepare<[string], Row>(
      `SELECT ${COLS} FROM cards c WHERE name = ? COLLATE NOCASE
       ORDER BY ${PRINTING_PENALTY}, released_at DESC LIMIT 1`,
    );
    this.bySetCn = sqlite.prepare<[string, string], Row>(
      `SELECT ${COLS} FROM cards WHERE set_code = ? AND collector_number = ? LIMIT 1`,
    );
    this.printings = sqlite.prepare<[string], Row>(
      `SELECT ${COLS} FROM cards c WHERE oracle_id = ? ORDER BY ${PRINTING_PENALTY}, released_at DESC`,
    );
    this.count = sqlite.prepare<[], { n: number }>(`SELECT count(*) AS n FROM cards`);

    // One row per oracle_id, ranked by:
    //   tier   0 = exact name, 1 = name or a word in the name starts with the query,
    //          2 = matched only via type line / oracle text
    //   then Scryfall popularity (edhrec_rank, nulls last), then bm25.
    // Within an oracle_id the representative printing is a plain non-promo, non-digital,
    // non-reversible one, newest first.
    this.search = sqlite.prepare<[string, string, string, string, number], Row>(`
      WITH hits AS (
        SELECT c.rowid AS rid, c.oracle_id,
               CASE
                 WHEN c.name = ? COLLATE NOCASE THEN 0
                 WHEN c.name LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE THEN 1
                 ELSE 2
               END AS tier,
               bm25(cards_fts, 10.0, 2.0, 1.0) AS score,
               coalesce(c.edhrec_rank, 1000000) AS pop,
               c.released_at,
               ${PRINTING_PENALTY} AS penalty
        FROM cards_fts
        JOIN cards c ON c.rowid = cards_fts.rowid
        WHERE cards_fts MATCH ?
      ),
      best AS (
        SELECT rid, tier, score, pop, released_at,
               ROW_NUMBER() OVER (PARTITION BY oracle_id ORDER BY tier, penalty, released_at DESC) AS rn,
               MIN(tier) OVER (PARTITION BY oracle_id) AS group_tier
        FROM hits
      )
      SELECT ${QCOLS} FROM best JOIN cards ON cards.rowid = best.rid
      WHERE rn = 1
      ORDER BY best.group_tier, best.pop, best.score, best.released_at DESC
      LIMIT ?
    `);
  }

  cardCount(): number {
    return this.count.get()?.n ?? 0;
  }

  get(id: string): CardSummary | null {
    const r = this.byId.get(id);
    return r ? rowToCard(r) : null;
  }

  getMany(ids: string[]): Map<string, CardSummary> {
    const out = new Map<string, CardSummary>();
    for (let i = 0; i < ids.length; i += 500) {
      for (const r of this.byIds(ids.slice(i, i + 500))) out.set(r.id, rowToCard(r));
    }
    return out;
  }

  findByName(name: string): CardSummary | null {
    const r = this.exactName.get(name);
    if (r) return rowToCard(r);
    // Double-faced cards are stored as "Front // Back"; accept just the front.
    const front = this.sqlite
      .prepare<[string], Row>(
        `SELECT ${COLS} FROM cards c WHERE name LIKE ? COLLATE NOCASE ORDER BY ${PRINTING_PENALTY}, released_at DESC LIMIT 1`,
      )
      .get(`${name.replace(/[%_]/g, "")} // %`);
    return front ? rowToCard(front) : null;
  }

  findBySetCn(setCode: string, cn: string): CardSummary | null {
    const r = this.bySetCn.get(setCode.toLowerCase(), cn);
    return r ? rowToCard(r) : null;
  }

  getPrintings(oracleId: string): CardSummary[] {
    return this.printings.all(oracleId).map(rowToCard);
  }

  searchNames(q: string, limit = 20): CardSummary[] {
    const trimmed = q.trim();
    const match = ftsQuery(trimmed);
    if (!match) return [];
    const safe = trimmed.replace(/[%_]/g, "");
    return this.search.all(safe, `${safe}%`, `% ${safe}%`, match, limit).map(rowToCard);
  }
}

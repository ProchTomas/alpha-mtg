import type { Sqlite } from "../db/index.js";

/**
 * Builds the vocabulary the deck recommender reasons over.
 *
 * Instead of a hand-written list of themes ("landfall", "proliferate"…), every meaningful word and
 * two-word phrase in Magic's oracle text becomes a candidate theme. A deck's themes are then the
 * terms that appear far more often in that deck than in the card pool at large, which is how a
 * proliferate deck is recognised as a proliferate deck without anybody writing the word down.
 *
 * Two passes so memory stays flat: the first counts document frequency, the second writes only the
 * terms that survived into card_terms.
 */

/** Words so common in rules text that they say nothing about what a deck is doing. */
const GENERIC = new Set(
  (
    "the a an of to and or you your it its this that if may when whenever each all any is are be with for from at on in " +
    "up do does than then as into other another their them they there one two three time times only such not " +
    "target creature creatures player players card cards turn spell spells permanent permanents battlefield " +
    "control controls controller end beginning step until unless instead where put puts add adds deal deals damage " +
    "get gets onto back would could been being have has had more most less least can cant you've it's"
  ).split(/\s+/),
);

/** Terms rarer than this are flukes; terms commoner than this are boilerplate. */
const MIN_DF = 15;
const MAX_DF = 6000;

const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };

export function colorMask(identity: string[]): number {
  let mask = 0;
  for (const c of identity) mask |= COLOR_BIT[c] ?? 0;
  return mask;
}

function normalise(text: string, name: string): string {
  return text
    .replace(/\([^)]*\)/g, " ") // reminder text explains, it doesn't characterise
    .split(name)
    .join(" ~ ")
    .toLowerCase()
    .replace(/\+1\/\+1/g, " pluscounter ")
    .replace(/-1\/-1/g, " minuscounter ")
    .replace(/[^a-z0-9~ .;\n]+/g, " ");
}

/** Single words plus adjacent pairs, never crossing a sentence boundary, plus creature subtypes. */
function termsOf(text: string, typeLine: string | null): Set<string> {
  const out = new Set<string>();
  for (const sentence of text.split(/[.;\n]/)) {
    const words = sentence
      .split(/\s+/)
      .filter((w) => w.length > 2 && w !== "~" && !GENERIC.has(w));
    for (const w of words) out.add(w);
    for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`);
  }
  const subtypes = (typeLine ?? "").split("—")[1];
  if (subtypes) {
    for (const w of subtypes.toLowerCase().split(/\s+/)) if (w.length > 2) out.add(`type:${w}`);
  }
  return out;
}

type CardRow = {
  oracle_id: string;
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  card_faces: string | null;
  color_identity: string;
};

function textOf(c: CardRow): string {
  if (c.oracle_text) return c.oracle_text;
  if (!c.card_faces) return "";
  try {
    return (JSON.parse(c.card_faces) as Array<{ oracle_text?: string }>)
      .map((f) => f.oracle_text ?? "")
      .join("\n");
  } catch {
    return "";
  }
}

export function ingestTerms(sqlite: Sqlite, log: (m: string) => void = () => {}): { vocabulary: number; pairs: number } {
  const select = sqlite.prepare<[], CardRow>(
    `SELECT oracle_id, name, type_line, oracle_text, card_faces, color_identity
     FROM cards WHERE edhrec_rank IS NOT NULL GROUP BY oracle_id`,
  );

  // Pass 1: document frequency across unique cards.
  const df = new Map<string, number>();
  let docs = 0;
  for (const c of select.iterate()) {
    docs++;
    for (const t of termsOf(normalise(textOf(c), c.name), c.type_line)) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const vocabulary = new Map<string, number>();
  for (const [term, n] of df) if (n >= MIN_DF && n <= MAX_DF) vocabulary.set(term, n);
  df.clear();
  log(`vocabulary: ${vocabulary.size} terms over ${docs} cards`);

  // Pass 2: write the surviving terms per card, plus the colour-identity bitmask.
  // Paginated by oracle_id because better-sqlite3 forbids writing while a query iterates.
  const insertTerm = sqlite.prepare(`INSERT OR IGNORE INTO card_terms (oracle_id, term) VALUES (?, ?)`);
  const insertDf = sqlite.prepare(`INSERT OR REPLACE INTO term_df (term, df, docs) VALUES (?, ?, ?)`);
  const setMask = sqlite.prepare(`UPDATE cards SET color_identity_mask = ? WHERE oracle_id = ?`);
  const page = sqlite.prepare<[string, number], CardRow>(
    `SELECT oracle_id, name, type_line, oracle_text, card_faces, color_identity
     FROM cards WHERE edhrec_rank IS NOT NULL AND oracle_id > ?
     GROUP BY oracle_id ORDER BY oracle_id LIMIT ?`,
  );

  sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM card_terms`).run();
    sqlite.prepare(`DELETE FROM term_df`).run();
    for (const [term, n] of vocabulary) insertDf.run(term, n, docs);
  })();

  let pairs = 0;
  const writeBatch = sqlite.transaction((batch: CardRow[]) => {
    for (const c of batch) {
      setMask.run(colorMask(JSON.parse(c.color_identity) as string[]), c.oracle_id);
      for (const t of termsOf(normalise(textOf(c), c.name), c.type_line)) {
        if (!vocabulary.has(t)) continue;
        insertTerm.run(c.oracle_id, t);
        pairs++;
      }
    }
  });

  let cursor = "";
  for (;;) {
    const batch = page.all(cursor, 2000);
    if (batch.length === 0) break;
    writeBatch(batch);
    cursor = batch[batch.length - 1]!.oracle_id;
  }
  log(`card_terms: ${pairs} pairs`);
  return { vocabulary: vocabulary.size, pairs };
}

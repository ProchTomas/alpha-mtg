import type { CardSummary } from "@alphamtg/shared";
import { categoryLabel, landAdvice, type LandAdvice } from "@alphamtg/shared";
import type { Db, Sqlite } from "../db/index.js";
import type { CardService } from "./cards.js";

export type Recommendation = {
  card: CardSummary;
  kind: "gap" | "synergy";
  reason: string;
};

export type DeckAdvice = {
  land: LandAdvice;
  themes: Array<{ term: string; label: string; lift: number }>;
  recommendations: Recommendation[];
  /** True when a further page of suggestions exists (the reroll button). */
  more: boolean;
};

/** Conventional deck-building targets. Commander is well understood; 60-card varies by archetype, so it asks for less. */
const TARGETS: Record<string, Record<string, number>> = {
  commander: { ramp: 10, draw: 10, removal: 8, interaction: 4, wipe: 3 },
  sixty: { removal: 6, draw: 4, interaction: 2 },
};

/** Cards this popular are in everyone's deck already: they neither reveal a theme nor surprise anyone. */
const STAPLE_RANK = 150;
/** Synergy picks skip the famous cards entirely — the point is to turn up something you didn't know. */
const GEM_RANK = 250;

const MIN_LIFT = 4;
const MAX_THEMES = 12;
const PER_PAGE = 5;
const MAX_GAP_PICKS = 2;

type DeckCard = {
  oracle_id: string;
  quantity: number;
  type_line: string | null;
  cmc: number | null;
  color_identity_mask: number;
  edhrec_rank: number | null;
};

export class RecommendService {
  constructor(
    private readonly db: Db,
    private readonly sqlite: Sqlite,
    private readonly cards: CardService,
  ) {}

  advise(deckId: string, format: string, offset = 0): DeckAdvice {
    const deck = this.sqlite
      .prepare<[string], DeckCard>(
        `SELECT c.oracle_id, dc.quantity, c.type_line, c.cmc, c.color_identity_mask, c.edhrec_rank
         FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND dc.board IN ('main', 'command')`,
      )
      .all(deckId);

    const stats = this.summarise(deck, format);
    const themes = this.themesOf(deck);
    const have = new Set(deck.map((d) => d.oracle_id));

    const gapPicks = this.gapPicks(stats, have, format, offset);
    const synergyPicks = this.synergyPicks(themes, stats, have, offset, PER_PAGE);

    // Gaps are capped at two so most of the page is the interesting half. A tidy deck gets five
    // synergy picks; a deck missing everything still only spends two slots saying so.
    const gaps = gapPicks.slice(0, MAX_GAP_PICKS);
    const recommendations = [...gaps, ...synergyPicks].slice(0, PER_PAGE);

    return {
      land: stats.land,
      themes: themes.slice(0, 6).map((t) => ({ term: t.term, label: prettyTerm(t.term), lift: t.lift })),
      recommendations,
      more: synergyPicks.length >= PER_PAGE - gaps.length,
    };
  }

  // ---------- deck summary ----------

  private summarise(deck: DeckCard[], format: string) {
    const tags = this.tagsFor(deck.map((d) => d.oracle_id));
    let mask = 0;
    let lands = 0;
    let total = 0;
    let nonland = 0;
    let mvSum = 0;
    let cheapRamp = 0;
    const counts: Record<string, number> = {};

    for (const card of deck) {
      total += card.quantity;
      mask |= card.color_identity_mask;
      const isLand = /Land/.test((card.type_line ?? "").split(" // ")[0] ?? "");
      const cardTags = tags.get(card.oracle_id) ?? [];
      for (const t of cardTags) counts[t] = (counts[t] ?? 0) + card.quantity;
      if (isLand) {
        lands += card.quantity;
        continue;
      }
      nonland += card.quantity;
      mvSum += (card.cmc ?? 0) * card.quantity;
      if (cardTags.includes("ramp") && (card.cmc ?? 0) <= 2) cheapRamp += card.quantity;
    }

    const avgManaValue = nonland > 0 ? mvSum / nonland : 0;
    const commandZone = format === "commander" ? 1 : 0;
    return {
      mask,
      lands,
      total,
      counts,
      avgManaValue,
      land: landAdvice({ format, lands, totalCards: total, commandZone, avgManaValue, cheapRamp }),
    };
  }

  private tagsFor(oracleIds: string[]): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const unique = [...new Set(oracleIds)];
    for (let i = 0; i < unique.length; i += 400) {
      const slice = unique.slice(i, i + 400);
      const rows = this.sqlite
        .prepare<string[], { oracle_id: string; tag: string }>(
          `SELECT oracle_id, tag FROM card_tags WHERE oracle_id IN (${slice.map(() => "?").join(",")})`,
        )
        .all(...slice);
      for (const r of rows) {
        const list = out.get(r.oracle_id) ?? [];
        list.push(r.tag);
        out.set(r.oracle_id, list);
      }
    }
    return out;
  }

  // ---------- themes ----------

  /**
   * A deck's themes are the terms it uses far more than the card pool does. Ubiquitous staples are
   * excluded first: Sol Ring is in every deck, so its text says nothing about this one.
   */
  private themesOf(deck: DeckCard[]) {
    const informative = deck.filter((d) => (d.edhrec_rank ?? Number.MAX_SAFE_INTEGER) > STAPLE_RANK);
    if (informative.length < 3) return [];
    const ids = [...new Set(informative.map((d) => d.oracle_id))];
    const rows = this.sqlite
      .prepare<string[], { term: string; tf: number; df: number; docs: number }>(
        `SELECT ct.term, count(*) AS tf, td.df, td.docs
         FROM card_terms ct JOIN term_df td ON td.term = ct.term
         WHERE ct.oracle_id IN (${ids.map(() => "?").join(",")})
         GROUP BY ct.term HAVING tf >= 2`,
      )
      .all(...ids);

    return rows
      .map((r) => ({ term: r.term, tf: r.tf, lift: (r.tf / ids.length) / (r.df / r.docs) }))
      .filter((r) => r.lift >= MIN_LIFT)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, MAX_THEMES);
  }

  // ---------- picks ----------

  private gapPicks(
    stats: ReturnType<RecommendService["summarise"]>,
    have: Set<string>,
    format: string,
    offset: number,
  ): Recommendation[] {
    const targets = TARGETS[format] ?? TARGETS.sixty!;
    const gaps = Object.entries(targets)
      .map(([cat, target]) => ({ cat, target, got: stats.counts[cat] ?? 0 }))
      .filter((g) => g.got < g.target)
      .sort((a, b) => (b.target - b.got) / b.target - (a.target - a.got) / a.target);

    const out: Recommendation[] = [];
    for (const gap of gaps) {
      if (out.length >= MAX_GAP_PICKS) break;
      // A top-heavy deck wants its missing pieces cheap.
      const maxCmc = stats.avgManaValue > 3.4 ? 3 : 0;
      // Rank by popularity, but prefer specialists: a card tagged only "draw" is a better answer
      // to "I need card draw" than a mana rock that happens to sacrifice for a card.
      const rows = this.sqlite
        .prepare<[string, number, number, number, number], { oracle_id: string; rank: number }>(
          `SELECT c.oracle_id, min(c.edhrec_rank) AS rank,
                  (SELECT count(*) FROM card_tags t2 WHERE t2.oracle_id = c.oracle_id) AS tagcount
           FROM cards c JOIN card_tags t ON t.oracle_id = c.oracle_id
           WHERE t.tag = ? AND c.edhrec_rank IS NOT NULL
             AND (c.color_identity_mask & ~?) = 0
             AND c.type_line NOT LIKE '%Land%'
             AND (? = 0 OR c.cmc <= ?)
           GROUP BY c.oracle_id
           ORDER BY rank * (1.0 + 0.8 * (tagcount - 1)) LIMIT ?`,
        )
        .all(gap.cat, stats.mask, maxCmc, maxCmc, 60 + offset * PER_PAGE);
      const pick = rows.filter((r) => !have.has(r.oracle_id))[offset];
      if (!pick) continue;
      const card = this.bestPrinting(pick.oracle_id);
      if (!card) continue;
      have.add(pick.oracle_id);
      out.push({
        card,
        kind: "gap",
        reason: `You run ${gap.got} ${categoryLabel(gap.cat).toLowerCase()}; decks like this usually run about ${gap.target}.`,
      });
    }
    return out;
  }

  private synergyPicks(
    themes: Array<{ term: string; lift: number }>,
    stats: ReturnType<RecommendService["summarise"]>,
    have: Set<string>,
    offset: number,
    limit: number,
  ): Recommendation[] {
    if (themes.length === 0) return [];
    const terms = themes.map((t) => t.term);
    const weight = new Map(themes.map((t) => [t.term, Math.log(t.lift)]));

    const rows = this.sqlite
      .prepare<string[], { oracle_id: string; hits: string; n: number; rank: number; mask: number }>(
        `SELECT ct.oracle_id,
                group_concat(DISTINCT ct.term) AS hits,
                count(DISTINCT ct.term) AS n,
                (SELECT min(edhrec_rank) FROM cards c WHERE c.oracle_id = ct.oracle_id) AS rank,
                (SELECT max(color_identity_mask) FROM cards c WHERE c.oracle_id = ct.oracle_id) AS mask
         FROM card_terms ct
         WHERE ct.term IN (${terms.map(() => "?").join(",")})
         GROUP BY ct.oracle_id HAVING n >= 2`,
      )
      .all(...terms);

    const scored = rows
      .filter((r) => r.rank != null && r.rank >= GEM_RANK && (r.mask & ~stats.mask) === 0 && !have.has(r.oracle_id))
      .map((r) => {
        const hits = r.hits.split(",");
        let score = 0;
        for (const h of hits) score += weight.get(h) ?? 0;
        // Among equally on-theme cards, lean very slightly towards the more played one.
        score += 0.25 * Math.log(20000 / Math.max(r.rank, 1));
        return { ...r, hits, score };
      })
      .sort((a, b) => b.score - a.score);

    const out: Recommendation[] = [];
    for (const row of scored.slice(offset * limit)) {
      if (out.length >= limit) break;
      const card = this.bestPrinting(row.oracle_id);
      if (!card || /Land/.test((card.typeLine ?? "").split(" // ")[0] ?? "")) continue;
      have.add(row.oracle_id);
      // Score on everything, but name the theme with terms a player would recognise: a creature
      // type or a single word like "proliferate" reads far better than a bigram such as
      // "graveyard shuffle", which is an artefact of how the sentence was chopped up.
      const labels = row.hits
        .sort((a, b) => readability(a) - readability(b) || (weight.get(b) ?? 0) - (weight.get(a) ?? 0))
        .slice(0, 2)
        .map(prettyTerm);
      out.push({ card, kind: "synergy", reason: `Fits your ${labels.join(" / ")} theme.` });
    }
    return out;
  }

  private bestPrinting(oracleId: string): CardSummary | null {
    const printings = this.cards.getPrintings(oracleId);
    return printings[0] ?? null;
  }
}

/** Words that score as themes but mean nothing as a label ("your twice theme"). */
const VAGUE = new Set(["twice", "four", "three", "two", "nonland", "among", "onto", "top", "number", "total"]);

/** Creature types read best, then single words; two-word phrases and vague words are a last resort. */
function readability(term: string): number {
  if (term.startsWith("type:")) return 0;
  if (term.split(" ").some((w) => VAGUE.has(w))) return 3;
  return term.includes(" ") ? 2 : 1;
}

/** Turn an internal vocabulary term into something a player would recognise. */
export function prettyTerm(term: string): string {
  if (term.startsWith("type:")) {
    const t = term.slice(5);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return term.replace(/pluscounter/g, "+1/+1 counter").replace(/minuscounter/g, "-1/-1 counter");
}

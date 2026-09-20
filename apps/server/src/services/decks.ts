import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Board, CardSummary, ParsedDeckLine } from "@alphamtg/shared";
import { parseDecklist } from "@alphamtg/shared";
import type { Db } from "../db/index.js";
import { schema } from "../db/index.js";
import { newId } from "../ids.js";
import { AuthError } from "./auth.js";
import type { CardService } from "./cards.js";

export type DeckRow = typeof schema.decks.$inferSelect;
export type Visibility = DeckRow["visibility"];

export type DeckCardEntry = { cardId: string; quantity: number; board: Board };

export type DeckSummary = {
  id: string;
  userId: string;
  ownerHandle: string;
  ownerDisplayName: string;
  name: string;
  description: string;
  format: string;
  visibility: Visibility;
  coverCardId: string | null;
  cardCount: number;
  colorIdentity: string[];
  createdAt: number;
  updatedAt: number;
};

export type DeckDetail = DeckSummary & {
  cards: DeckCardEntry[];
  /** Card data for every id referenced in `cards`. */
  cardData: Record<string, CardSummary>;
};

export type UnresolvedLine = { raw: string; name: string; quantity: number; board: Board };

/** Two formats: Commander (100 cards, a command zone, 40 life) and 60-card constructed. */
const FORMATS = ["commander", "sixty"];
const DEFAULT_FORMAT = "sixty";

export class DeckService {
  constructor(
    private readonly db: Db,
    private readonly cards: CardService,
  ) {}

  private canView(deck: DeckRow, viewerId: string | null): boolean {
    return deck.visibility !== "private" || deck.userId === viewerId;
  }

  private mustOwn(deckId: string, userId: string): DeckRow {
    const deck = this.db.select().from(schema.decks).where(eq(schema.decks.id, deckId)).get();
    if (!deck || deck.userId !== userId) throw new AuthError(404, "No such deck.");
    return deck;
  }

  private summarize(rows: Array<{ deck: DeckRow; handle: string; displayName: string }>): DeckSummary[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.deck.id);
    const entries = this.db
      .select()
      .from(schema.deckCards)
      .where(inArray(schema.deckCards.deckId, ids))
      .all();
    const cardIds = [...new Set(entries.map((e) => e.cardId))];
    const cardData = this.cards.getMany(cardIds);

    const byDeck = new Map<string, { count: number; ci: Set<string> }>();
    for (const e of entries) {
      const agg = byDeck.get(e.deckId) ?? { count: 0, ci: new Set<string>() };
      if (e.board === "main" || e.board === "command") {
        agg.count += e.quantity;
        for (const c of cardData.get(e.cardId)?.colorIdentity ?? []) agg.ci.add(c);
      }
      byDeck.set(e.deckId, agg);
    }
    return rows.map(({ deck, handle, displayName }) => {
      const agg = byDeck.get(deck.id);
      return {
        id: deck.id,
        userId: deck.userId,
        ownerHandle: handle,
        ownerDisplayName: displayName,
        name: deck.name,
        description: deck.description,
        format: deck.format,
        visibility: deck.visibility,
        coverCardId: deck.coverCardId,
        cardCount: agg?.count ?? 0,
        colorIdentity: sortColors([...(agg?.ci ?? [])]),
        createdAt: deck.createdAt.getTime(),
        updatedAt: deck.updatedAt.getTime(),
      };
    });
  }

  listForUser(userId: string, viewerId: string | null): DeckSummary[] {
    const rows = this.db
      .select({ deck: schema.decks, handle: schema.users.handle, displayName: schema.users.displayName })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.users.id, schema.decks.userId))
      .where(eq(schema.decks.userId, userId))
      .orderBy(desc(schema.decks.updatedAt))
      .all();
    const visible = rows.filter((r) => (viewerId === userId ? true : r.deck.visibility === "public"));
    return this.summarize(visible);
  }

  listPublic(limit = 20): DeckSummary[] {
    const rows = this.db
      .select({ deck: schema.decks, handle: schema.users.handle, displayName: schema.users.displayName })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.users.id, schema.decks.userId))
      .where(eq(schema.decks.visibility, "public"))
      .orderBy(desc(schema.decks.updatedAt))
      .limit(limit)
      .all();
    return this.summarize(rows);
  }

  get(deckId: string, viewerId: string | null): DeckDetail | null {
    const row = this.db
      .select({ deck: schema.decks, handle: schema.users.handle, displayName: schema.users.displayName })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.users.id, schema.decks.userId))
      .where(eq(schema.decks.id, deckId))
      .get();
    if (!row || !this.canView(row.deck, viewerId)) return null;
    const [summary] = this.summarize([row]);
    const entries = this.db.select().from(schema.deckCards).where(eq(schema.deckCards.deckId, deckId)).all();
    const cardData = Object.fromEntries(this.cards.getMany([...new Set(entries.map((e) => e.cardId))]));
    return {
      ...summary!,
      cards: entries.map((e) => ({ cardId: e.cardId, quantity: e.quantity, board: e.board })),
      cardData,
    };
  }

  create(userId: string, input: { name: string; format?: string; description?: string }): DeckRow {
    const now = new Date();
    const deck: typeof schema.decks.$inferInsert = {
      id: newId(),
      userId,
      name: input.name.trim().slice(0, 80) || "Untitled deck",
      description: (input.description ?? "").slice(0, 2000),
      format: FORMATS.includes(input.format ?? "") ? input.format! : DEFAULT_FORMAT,
      visibility: "private",
      coverCardId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(schema.decks).values(deck).run();
    return this.db.select().from(schema.decks).where(eq(schema.decks.id, deck.id)).get()!;
  }

  update(
    deckId: string,
    userId: string,
    patch: { name?: string; description?: string; format?: string; visibility?: Visibility; coverCardId?: string | null },
  ): void {
    this.mustOwn(deckId, userId);
    const set: Partial<typeof schema.decks.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 80) || "Untitled deck";
    if (patch.description !== undefined) set.description = patch.description.slice(0, 2000);
    if (patch.format !== undefined && FORMATS.includes(patch.format)) set.format = patch.format;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (patch.coverCardId !== undefined) set.coverCardId = patch.coverCardId;
    this.db.update(schema.decks).set(set).where(eq(schema.decks.id, deckId)).run();
  }

  delete(deckId: string, userId: string): void {
    this.mustOwn(deckId, userId);
    this.db.delete(schema.decks).where(eq(schema.decks.id, deckId)).run();
  }

  /** Upsert one (card, board) row; quantity <= 0 removes it. */
  setCard(deckId: string, userId: string, entry: DeckCardEntry): void {
    this.mustOwn(deckId, userId);
    if (!this.cards.get(entry.cardId)) throw new AuthError(400, "Unknown card.");
    const where = and(
      eq(schema.deckCards.deckId, deckId),
      eq(schema.deckCards.cardId, entry.cardId),
      eq(schema.deckCards.board, entry.board),
    );
    if (entry.quantity <= 0) {
      this.db.delete(schema.deckCards).where(where).run();
    } else {
      this.db
        .insert(schema.deckCards)
        .values({ deckId, cardId: entry.cardId, quantity: entry.quantity, board: entry.board })
        .onConflictDoUpdate({
          target: [schema.deckCards.deckId, schema.deckCards.cardId, schema.deckCards.board],
          set: { quantity: entry.quantity },
        })
        .run();
    }
    this.touch(deckId);
  }

  /** Swap a card for a different printing, keeping quantity and board. */
  swapPrinting(deckId: string, userId: string, fromCardId: string, toCardId: string, board: Board): void {
    this.mustOwn(deckId, userId);
    const to = this.cards.get(toCardId);
    const from = this.cards.get(fromCardId);
    if (!to || !from || to.oracleId !== from.oracleId) throw new AuthError(400, "Not a printing of the same card.");
    const existing = this.db
      .select()
      .from(schema.deckCards)
      .where(and(eq(schema.deckCards.deckId, deckId), eq(schema.deckCards.cardId, fromCardId), eq(schema.deckCards.board, board)))
      .get();
    if (!existing) return;
    this.setCard(deckId, userId, { cardId: fromCardId, quantity: 0, board });
    this.setCard(deckId, userId, { cardId: toCardId, quantity: existing.quantity, board });
  }

  /**
   * Resolve a pasted decklist against the card table and write it into the deck.
   * Lines whose card can't be found are returned so the UI can show them.
   */
  import(deckId: string, userId: string, text: string, mode: "replace" | "append"): { added: number; unresolved: UnresolvedLine[] } {
    this.mustOwn(deckId, userId);
    const lines = parseDecklist(text);
    const merged = new Map<string, DeckCardEntry>();
    const unresolved: UnresolvedLine[] = [];
    for (const line of lines) {
      const card = this.resolve(line);
      if (!card) {
        unresolved.push({ raw: line.raw, name: line.name, quantity: line.quantity, board: line.board });
        continue;
      }
      const key = `${card.id}|${line.board}`;
      const prev = merged.get(key);
      merged.set(key, { cardId: card.id, board: line.board, quantity: (prev?.quantity ?? 0) + line.quantity });
    }

    const entries = [...merged.values()];
    this.db.transaction((tx) => {
      if (mode === "replace") tx.delete(schema.deckCards).where(eq(schema.deckCards.deckId, deckId)).run();
      for (const e of entries) {
        tx.insert(schema.deckCards)
          .values({ deckId, ...e })
          .onConflictDoUpdate({
            target: [schema.deckCards.deckId, schema.deckCards.cardId, schema.deckCards.board],
            set: { quantity: mode === "append" ? sqlAdd(e.quantity) : e.quantity },
          })
          .run();
      }
      // First import sets a cover if there isn't one; a commander line makes it a Commander deck.
      const deck = tx.select().from(schema.decks).where(eq(schema.decks.id, deckId)).get();
      const commander = entries.find((e) => e.board === "command");
      const cover = commander ?? entries[0];
      tx.update(schema.decks)
        .set({
          updatedAt: new Date(),
          coverCardId: deck?.coverCardId ?? cover?.cardId ?? null,
          ...(commander ? { format: "commander" } : {}),
        })
        .where(eq(schema.decks.id, deckId))
        .run();
    });
    return { added: entries.reduce((n, e) => n + e.quantity, 0), unresolved };
  }

  private resolve(line: ParsedDeckLine): CardSummary | null {
    // Set + collector number picks the printing, but only if the name agrees —
    // a typo'd number shouldn't silently swap in a different card.
    if (line.setCode && line.collectorNumber) {
      const exact = this.cards.findBySetCn(line.setCode, line.collectorNumber);
      if (exact && sameName(exact.name, line.name)) return exact;
    }
    return this.cards.findByName(line.name);
  }

  private touch(deckId: string): void {
    this.db.update(schema.decks).set({ updatedAt: new Date() }).where(eq(schema.decks.id, deckId)).run();
  }
}

function sqlAdd(n: number) {
  return sql`${schema.deckCards.quantity} + ${n}`;
}

/** "Delver of Secrets // Insectile Aberration" matches "delver of secrets". */
function sameName(cardName: string, typed: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const full = norm(cardName);
  const t = norm(typed);
  return full === t || full.split(" // ")[0] === t;
}

const COLOR_ORDER = ["W", "U", "B", "R", "G"];
function sortColors(cs: string[]): string[] {
  return cs.filter((c) => COLOR_ORDER.includes(c)).sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
}

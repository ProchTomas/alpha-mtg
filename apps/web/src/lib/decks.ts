import type { Board, CardSummary, TypeBucket } from "@alphamtg/shared";
import { cardTypeBucket, manaPips, primaryTypeLine } from "@alphamtg/shared";
import { api } from "./api";

export type DeckSummary = {
  id: string;
  userId: string;
  ownerHandle: string;
  ownerDisplayName: string;
  name: string;
  description: string;
  format: string;
  visibility: "private" | "unlisted" | "public";
  coverCardId: string | null;
  cardCount: number;
  colorIdentity: string[];
  createdAt: number;
  updatedAt: number;
};

export type DeckCardEntry = { cardId: string; quantity: number; board: Board };
export type DeckDetail = DeckSummary & { cards: DeckCardEntry[]; cardData: Record<string, CardSummary> };
export type UnresolvedLine = { raw: string; name: string; quantity: number; board: Board };

export const FORMATS = [
  { id: "commander", label: "Commander" },
  { id: "sixty", label: "60-card" },
] as const;
export const formatLabel = (id: string): string => FORMATS.find((f) => f.id === id)?.label ?? id;

export const deckApi = {
  list: () => api.get<{ decks: DeckSummary[] }>("/decks").then((r) => r.decks),
  listPublic: () => api.get<{ decks: DeckSummary[] }>("/decks/public").then((r) => r.decks),
  listForUser: (handle: string) => api.get<{ decks: DeckSummary[] }>(`/users/${encodeURIComponent(handle)}/decks`).then((r) => r.decks),
  get: (id: string) => api.get<{ deck: DeckDetail }>(`/decks/${id}`).then((r) => r.deck),
  create: (input: { name: string; format?: string; description?: string; text?: string }) =>
    api.post<{ deck: DeckDetail; unresolved: UnresolvedLine[] }>("/decks", input),
  update: (id: string, patch: Partial<Pick<DeckSummary, "name" | "description" | "format" | "visibility" | "coverCardId">>) =>
    api.patch<{ deck: DeckDetail }>(`/decks/${id}`, patch).then((r) => r.deck),
  remove: (id: string) => api.del(`/decks/${id}`),
  setCard: (id: string, entry: DeckCardEntry) => api.put<{ deck: DeckDetail }>(`/decks/${id}/cards`, entry).then((r) => r.deck),
  swap: (id: string, fromCardId: string, toCardId: string, board: Board) =>
    api.post<{ deck: DeckDetail }>(`/decks/${id}/swap`, { fromCardId, toCardId, board }).then((r) => r.deck),
  import: (id: string, text: string, mode: "replace" | "append") =>
    api.post<{ deck: DeckDetail; added: number; unresolved: UnresolvedLine[] }>(`/decks/${id}/import`, { text, mode }),
};

/** Everything the stats sidebar needs, computed from the main + command boards. */
export type DeckStats = {
  total: number;
  lands: number;
  nonlands: number;
  curve: number[]; // index = mana value, last bucket is 7+
  avgManaValue: number;
  pips: Record<string, number>;
  types: Array<{ type: TypeBucket; count: number }>;
};

export function computeStats(deck: DeckDetail): DeckStats {
  const curve = new Array<number>(8).fill(0);
  const pips: Record<string, number> = {};
  const types = new Map<TypeBucket, number>();
  let total = 0;
  let lands = 0;
  let mvSum = 0;
  let mvCount = 0;

  for (const e of deck.cards) {
    if (e.board !== "main" && e.board !== "command") continue;
    const c = deck.cardData[e.cardId];
    if (!c) continue;
    total += e.quantity;
    const bucket = cardTypeBucket(primaryTypeLine(c));
    types.set(bucket, (types.get(bucket) ?? 0) + e.quantity);
    if (bucket === "Land") {
      lands += e.quantity;
      continue;
    }
    const mv = Math.max(0, Math.round(c.cmc ?? 0));
    curve[Math.min(mv, 7)] = (curve[Math.min(mv, 7)] ?? 0) + e.quantity;
    mvSum += mv * e.quantity;
    mvCount += e.quantity;
    const cost = c.manaCost ?? c.cardFaces?.[0]?.mana_cost ?? null;
    for (const [k, n] of Object.entries(manaPips(cost))) pips[k] = (pips[k] ?? 0) + n * e.quantity;
  }

  const order: TypeBucket[] = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];
  return {
    total,
    lands,
    nonlands: total - lands,
    curve,
    avgManaValue: mvCount ? mvSum / mvCount : 0,
    pips,
    types: order.filter((t) => types.has(t)).map((t) => ({ type: t, count: types.get(t)! })),
  };
}

/** Group a board's entries by type bucket for display, sorted by mana value then name. */
export function groupByType(deck: DeckDetail, board: Board): Array<{ type: TypeBucket; entries: DeckCardEntry[]; count: number }> {
  const groups = new Map<TypeBucket, DeckCardEntry[]>();
  for (const e of deck.cards) {
    if (e.board !== board) continue;
    const c = deck.cardData[e.cardId];
    const t = c ? cardTypeBucket(primaryTypeLine(c)) : "Other";
    const arr = groups.get(t) ?? [];
    arr.push(e);
    groups.set(t, arr);
  }
  const order: TypeBucket[] = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];
  return order
    .filter((t) => groups.has(t))
    .map((t) => {
      const entries = groups.get(t)!.sort((a, b) => {
        const ca = deck.cardData[a.cardId];
        const cb = deck.cardData[b.cardId];
        return (ca?.cmc ?? 0) - (cb?.cmc ?? 0) || (ca?.name ?? "").localeCompare(cb?.name ?? "");
      });
      return { type: t, entries, count: entries.reduce((n, e) => n + e.quantity, 0) };
    });
}

export const BOARD_LABELS: Record<Board, string> = {
  command: "Commander",
  main: "Main deck",
  side: "Sideboard",
  maybe: "Maybeboard",
};

export function exportText(deck: DeckDetail): string {
  const by = (b: Board) =>
    deck.cards
      .filter((e) => e.board === b)
      .map((e) => `${e.quantity} ${deck.cardData[e.cardId]?.name ?? e.cardId}`)
      .sort((a, b) => a.localeCompare(b));
  const parts: string[] = [];
  const cmd = by("command");
  if (cmd.length) parts.push("// Commander", ...cmd, "");
  parts.push(...by("main"));
  const side = by("side");
  if (side.length) parts.push("", "SIDEBOARD:", ...side);
  const maybe = by("maybe");
  if (maybe.length) parts.push("", "// Maybeboard", ...maybe);
  return parts.join("\n").trim() + "\n";
}

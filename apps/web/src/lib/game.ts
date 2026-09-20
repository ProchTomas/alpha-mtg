import { create } from "zustand";
import type { CardSummary, GameAction, GameState, PlayerId, Zone } from "@playtest/shared";
import { createGame, reduce, redactFor } from "@playtest/shared";
import { api } from "./api";
import { deckApi, type DeckDetail } from "./decks";

/**
 * The table's state. In "local" mode the reducer runs here and the only thing the UI sees
 * is the redacted view — exactly what the server would send — so solo and online render the
 * same way. Online mode (step 7) replaces `dispatch` with a socket send + optimistic apply.
 */
type GameStore = {
  state: GameState | null;
  me: PlayerId;
  cardData: Record<string, CardSummary>;
  /** Search / scry results the server (or local runner) sent privately. */
  privateView: { kind: "search" | "scry"; cards: Array<{ iid: string; cardId: string }> } | null;
  mode: "local" | "online";
  dispatch: (action: GameAction) => void;
  ensureCards: (ids: string[]) => Promise<void>;
  startLocal: (deck: DeckDetail, me: PlayerId, displayName: string) => void;
  closePrivate: () => void;
  leave: () => void;
};

let full: GameState | null = null; // the unredacted truth in local mode; never rendered

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  me: "me",
  cardData: {},
  privateView: null,
  mode: "local",

  dispatch: (action) => {
    const st = get();
    if (!full || st.mode !== "local") return;
    const filled = fillEntropy(action, full, st.me);
    if (filled.type === "SEARCH_START") {
      const lib = full.players[st.me]!.zones.library;
      set({ privateView: { kind: "search", cards: lib.map((c) => ({ iid: c.iid, cardId: c.cardId })) } });
    }
    const next = reduce(full, filled, st.me, Date.now());
    if (next === full) return;
    full = next;
    set({ state: redactFor(full, st.me) });
    if (filled.type === "CREATE_TOKEN" && filled.cardId) void get().ensureCards([filled.cardId]);
  },

  ensureCards: async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !get().cardData[id]);
    if (missing.length === 0) return;
    const r = await api.post<{ cards: Record<string, CardSummary> }>("/cards/batch", { ids: missing });
    set({ cardData: { ...get().cardData, ...r.cards } });
  },

  startLocal: (deck, me, displayName) => {
    const library: string[] = [];
    const command: string[] = [];
    for (const e of deck.cards) {
      if (e.board === "main") for (let i = 0; i < e.quantity; i++) library.push(e.cardId);
      if (e.board === "command") for (let i = 0; i < e.quantity; i++) command.push(e.cardId);
    }
    shuffleInPlace(library);
    full = createGame(`local-${Date.now().toString(36)}`, [{ id: me, seat: 0, displayName, library, command, iidPrefix: "m" }]);
    set({ me, mode: "local", cardData: { ...get().cardData, ...deck.cardData }, state: redactFor(full, me), privateView: null });
  },

  closePrivate: () => set({ privateView: null }),
  leave: () => {
    full = null;
    set({ state: null, privateView: null });
  },
}));

/** Peek at the top N of my library (local mode only). Online, the server answers SCRY privately. */
export function peekLibrary(n: number): Array<{ iid: string; cardId: string }> {
  const me = useGame.getState().me;
  if (!full) return [];
  return full.players[me]!.zones.library.slice(0, n).map((c) => ({ iid: c.iid, cardId: c.cardId }));
}

// ---------- entropy ----------

function randomInt(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function randomPermutation(n: number): number[] {
  return shuffleInPlace(Array.from({ length: n }, (_, i) => i));
}

let iidCounter = 0;
function newIid(): string {
  return `t${Date.now().toString(36)}${(iidCounter++).toString(36)}`;
}

/** What the server does before broadcasting: fill in permutations, random picks, ids and dice. */
export function fillEntropy(action: GameAction, state: GameState, actorId: PlayerId): GameAction {
  const me = state.players[actorId];
  switch (action.type) {
    case "SHUFFLE":
      return { ...action, permutation: randomPermutation(me?.zones.library.length ?? 0) };
    case "MULLIGAN":
      return { ...action, permutation: randomPermutation((me?.zones.library.length ?? 0) + (me?.zones.hand.length ?? 0)) };
    case "DRAW_RANDOM": {
      const n = me?.zones.library.length ?? 0;
      const picks = randomPermutation(n).slice(0, action.count).sort((a, b) => b - a);
      return { ...action, indices: picks };
    }
    case "ROLL":
      return { ...action, results: Array.from({ length: action.count }, () => 1 + randomInt(action.sides)) };
    case "CREATE_TOKEN":
      return { ...action, iid: action.iid ?? newIid() };
    case "CLONE":
      return { ...action, newIid: action.newIid ?? newIid() };
    default:
      return action;
  }
}

export const ZONE_LABEL: Record<Zone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
  aside: "Set aside",
};

export async function loadDeckForTable(deckId: string): Promise<DeckDetail> {
  return deckApi.get(deckId);
}

if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;

import { create } from "zustand";
import type { CardSummary, GameAction, GameState, LobbyInfo, PlayerId, PrivatePayload, ServerMessage, Zone } from "@playtest/shared";
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
  privateView: PrivatePayload | null;
  mode: "local" | "online";
  /** Online only. */
  lobby: LobbyInfo | null;
  connection: "idle" | "connecting" | "open" | "closed";
  lastError: string | null;
  dispatch: (action: GameAction) => void;
  /** Ask the server for the top N of my library (private). Local mode answers synchronously via peekLibrary. */
  peek: (n: number) => void;
  ensureCards: (ids: string[]) => Promise<void>;
  startLocal: (deck: DeckDetail, me: PlayerId, displayName: string) => void;
  connect: (code: string, me: PlayerId | null) => void;
  closePrivate: () => void;
  leave: () => void;
};

let full: GameState | null = null; // the unredacted truth in local mode; never rendered
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  me: "me",
  cardData: {},
  privateView: null,
  mode: "local",
  lobby: null,
  connection: "idle",
  lastError: null,

  dispatch: (action) => {
    const st = get();
    if (st.mode === "online") {
      if (!socket || socket.readyState !== WebSocket.OPEN || !st.state) return;
      socket.send(JSON.stringify({ t: "action", v: st.state.version, action }));
      // Optimistic: apply to the redacted view for instant feedback; the server patch replaces it.
      if (action.type !== "UNDO" && action.type !== "SEARCH_START") {
        const next = reduce(st.state, action, st.me, Date.now());
        if (next !== st.state) set({ state: next });
      }
      return;
    }
    if (!full) return;
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

  peek: (n) => {
    if (get().mode === "online") socket?.send(JSON.stringify({ t: "peek", n }));
    else set({ privateView: { kind: "scry", cards: peekLibrary(n) } });
  },

  connect: (code, me) => {
    get().leave();
    set({ mode: "online", me: me ?? "", connection: "connecting", lastError: null, lobby: null, state: null });
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?code=${encodeURIComponent(code)}`);
      socket = ws;
      ws.onopen = () => set({ connection: "open" });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        handleServer(msg, set, get);
      };
      ws.onclose = () => {
        if (socket !== ws) return;
        set({ connection: "closed" });
        // Reconnect while the page is still on the table.
        reconnectTimer = setTimeout(() => {
          if (get().mode === "online" && socket === ws) open();
        }, 1500);
      };
    };
    open();
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
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const ws = socket;
    socket = null;
    ws?.close();
    set({ state: null, privateView: null, lobby: null, connection: "idle", mode: "local" });
  },
}));

type Set = (p: Partial<GameStore>) => void;
type Get = () => GameStore;

function handleServer(msg: ServerMessage, set: Set, get: Get): void {
  switch (msg.t) {
    case "hello":
      set({ lobby: msg.lobby, me: msg.you ?? "" });
      break;
    case "lobby":
      set({ lobby: msg.lobby });
      break;
    case "snapshot":
    case "patch": {
      set({ state: msg.state });
      void get().ensureCards(collectCardIds(msg.state));
      break;
    }
    case "private":
      set({ privateView: msg.payload });
      void get().ensureCards(msg.payload.cards.map((c) => c.cardId));
      break;
    case "reject":
      set({ lastError: msg.reason });
      socket?.send(JSON.stringify({ t: "snapshot" }));
      setTimeout(() => get().lastError === msg.reason && set({ lastError: null }), 4000);
      break;
    case "error":
      set({ lastError: msg.reason });
      break;
    case "pong":
      break;
  }
}

function collectCardIds(state: GameState): string[] {
  const ids = new Set<string>();
  for (const p of Object.values(state.players)) for (const zone of Object.values(p.zones)) for (const c of zone) if (c.cardId) ids.add(c.cardId);
  for (const e of state.log) for (const m of e.text.matchAll(/\[\[card:([^\]]+)\]\]/g)) ids.add(m[1]!);
  return [...ids];
}

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

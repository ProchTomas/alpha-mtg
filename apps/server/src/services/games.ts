import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { WebSocket } from "ws";
import type { GameAction, GameState, LobbyInfo, PrivatePayload, ServerMessage } from "@playster/shared";
import { ClientMessageSchema, createGame, reduce, redactFor } from "@playster/shared";
import type { Db } from "../db/index.js";
import { schema } from "../db/index.js";
import { newId, newJoinCode } from "../ids.js";
import { AuthError } from "./auth.js";
import type { CardService } from "./cards.js";

const MAX_SEATS = 6;
const UNDO_DEPTH = 10;
const PERSIST_DEBOUNCE_MS = 2000;

type Seat = { userId: string; seat: number; deckId: string | null; joinedAt: Date };

/** A game held in memory: the full state, everyone's sockets, undo history. */
type LiveGame = {
  id: string;
  joinCode: string;
  hostId: string;
  status: "lobby" | "playing" | "ended";
  seats: Map<string, Seat>;
  state: GameState | null;
  sockets: Map<WebSocket, string | null>; // socket -> userId (null = anonymous spectator)
  undo: Map<string, Array<{ before: GameState; version: number }>>;
  persistTimer: NodeJS.Timeout | null;
  logSeq: number;
};

export class GameService {
  private live = new Map<string, LiveGame>(); // by id
  private byCode = new Map<string, string>(); // joinCode -> id

  constructor(
    private readonly db: Db,
    private readonly cards: CardService,
  ) {}

  // ---------- lobby ----------

  create(hostId: string): LobbyInfo {
    let joinCode = newJoinCode();
    while (this.byCode.has(joinCode) || this.db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.joinCode, joinCode)).get()) {
      joinCode = newJoinCode();
    }
    const id = newId();
    const now = new Date();
    this.db.insert(schema.games).values({ id, hostId, joinCode, status: "lobby", state: null, version: 0, createdAt: now }).run();
    this.db.insert(schema.gamePlayers).values({ gameId: id, userId: hostId, seat: 0, deckId: null, joinedAt: now }).run();
    const g: LiveGame = {
      id,
      joinCode,
      hostId,
      status: "lobby",
      seats: new Map([[hostId, { userId: hostId, seat: 0, deckId: null, joinedAt: now }]]),
      state: null,
      sockets: new Map(),
      undo: new Map(),
      persistTimer: null,
      logSeq: 0,
    };
    this.live.set(id, g);
    this.byCode.set(joinCode, id);
    return this.lobbyInfo(g);
  }

  /** Find by join code, loading from the database (after a restart) if needed. */
  getByCode(code: string): LiveGame | null {
    const upper = code.trim().toUpperCase();
    const id = this.byCode.get(upper);
    if (id) return this.live.get(id) ?? null;
    const row = this.db.select().from(schema.games).where(eq(schema.games.joinCode, upper)).get();
    if (!row) return null;
    const seats = this.db.select().from(schema.gamePlayers).where(eq(schema.gamePlayers.gameId, row.id)).all();
    const state = (row.state as GameState | null) ?? null;
    if (state) for (const p of Object.values(state.players)) p.connected = false;
    const g: LiveGame = {
      id: row.id,
      joinCode: row.joinCode,
      hostId: row.hostId,
      status: row.status,
      seats: new Map(seats.map((s) => [s.userId, { userId: s.userId, seat: s.seat, deckId: s.deckId, joinedAt: s.joinedAt }])),
      state,
      sockets: new Map(),
      undo: new Map(),
      persistTimer: null,
      logSeq: state?.log[state.log.length - 1]?.seq ?? 0,
    };
    this.live.set(g.id, g);
    this.byCode.set(g.joinCode, g.id);
    return g;
  }

  lobby(code: string): LobbyInfo {
    const g = this.getByCode(code);
    if (!g) throw new AuthError(404, "No table with that code.");
    return this.lobbyInfo(g);
  }

  join(code: string, userId: string): LobbyInfo {
    const g = this.mustGet(code);
    if (g.seats.has(userId)) return this.lobbyInfo(g);
    if (g.status !== "lobby") throw new AuthError(409, "That game has already started — you can spectate.");
    if (g.seats.size >= MAX_SEATS) throw new AuthError(409, "The table is full.");
    const taken = new Set([...g.seats.values()].map((s) => s.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    const s: Seat = { userId, seat, deckId: null, joinedAt: new Date() };
    g.seats.set(userId, s);
    this.db.insert(schema.gamePlayers).values({ gameId: g.id, userId, seat, deckId: null, joinedAt: s.joinedAt }).run();
    this.broadcastLobby(g);
    return this.lobbyInfo(g);
  }

  leave(code: string, userId: string): LobbyInfo {
    const g = this.mustGet(code);
    if (g.status !== "lobby") throw new AuthError(409, "You can't leave a running game; just close the tab.");
    if (!g.seats.has(userId)) return this.lobbyInfo(g);
    g.seats.delete(userId);
    this.syncSeats(g);
    if (g.hostId === userId) {
      const next = [...g.seats.values()].sort((a, b) => a.seat - b.seat)[0];
      if (next) {
        g.hostId = next.userId;
        this.db.update(schema.games).set({ hostId: next.userId }).where(eq(schema.games.id, g.id)).run();
      }
    }
    this.broadcastLobby(g);
    return this.lobbyInfo(g);
  }

  pickDeck(code: string, userId: string, deckId: string | null): LobbyInfo {
    const g = this.mustGet(code);
    const seat = g.seats.get(userId);
    if (!seat) throw new AuthError(403, "You're not seated at this table.");
    if (g.status !== "lobby") throw new AuthError(409, "The game has already started.");
    if (deckId) {
      const deck = this.db.select().from(schema.decks).where(eq(schema.decks.id, deckId)).get();
      if (!deck || deck.userId !== userId) throw new AuthError(404, "No such deck.");
    }
    seat.deckId = deckId;
    this.syncSeats(g);
    this.broadcastLobby(g);
    return this.lobbyInfo(g);
  }

  start(code: string, userId: string): LobbyInfo {
    const g = this.mustGet(code);
    if (g.hostId !== userId) throw new AuthError(403, "Only the host can start the game.");
    if (g.status !== "lobby") throw new AuthError(409, "Already started.");
    const seats = [...g.seats.values()].sort((a, b) => a.seat - b.seat);
    if (seats.some((s) => !s.deckId)) throw new AuthError(409, "Everyone needs to pick a deck first.");

    const setups = seats.map((s) => {
      const user = this.db.select().from(schema.users).where(eq(schema.users.id, s.userId)).get()!;
      const entries = this.db.select().from(schema.deckCards).where(eq(schema.deckCards.deckId, s.deckId!)).all();
      const library: string[] = [];
      const command: string[] = [];
      for (const e of entries) {
        if (e.board === "main") for (let i = 0; i < e.quantity; i++) library.push(e.cardId);
        if (e.board === "command") for (let i = 0; i < e.quantity; i++) command.push(e.cardId);
      }
      shuffle(library);
      return { id: s.userId, seat: s.seat, displayName: user.displayName, library, command, iidPrefix: `p${s.seat}_` };
    });
    g.state = createGame(g.id, setups);
    for (const [, uid] of g.sockets) if (uid && g.state.players[uid]) g.state.players[uid]!.connected = true;
    g.status = "playing";
    this.db.update(schema.games).set({ status: "playing", state: g.state, version: 0 }).where(eq(schema.games.id, g.id)).run();
    this.broadcastLobby(g);
    this.broadcastSnapshot(g);
    return this.lobbyInfo(g);
  }

  // ---------- sockets ----------

  attach(code: string, ws: WebSocket, userId: string | null): void {
    const g = this.getByCode(code);
    if (!g) {
      this.send(ws, { t: "error", reason: "No table with that code." });
      ws.close();
      return;
    }
    g.sockets.set(ws, userId);
    if (g.state && userId && g.state.players[userId]) {
      g.state.players[userId]!.connected = true;
    }
    this.send(ws, { t: "hello", you: userId, lobby: this.lobbyInfo(g) });
    if (g.state) this.send(ws, { t: "snapshot", state: redactFor(g.state, userId) });
    this.broadcastLobby(g);
    if (g.state && userId) this.broadcastSnapshot(g); // others see "connected"

    ws.on("message", (raw) => this.onMessage(g, ws, raw.toString()));
    ws.on("close", () => {
      g.sockets.delete(ws);
      const stillHere = [...g.sockets.values()].includes(userId);
      if (g.state && userId && g.state.players[userId] && !stillHere) {
        g.state.players[userId]!.connected = false;
        this.broadcastSnapshot(g);
      }
      this.broadcastLobby(g);
    });
  }

  private onMessage(g: LiveGame, ws: WebSocket, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = ClientMessageSchema.safeParse(parsed);
    if (!msg.success) {
      this.send(ws, { t: "error", reason: "Bad message." });
      return;
    }
    const userId = g.sockets.get(ws) ?? null;
    const m = msg.data;
    if (m.t === "ping") return this.send(ws, { t: "pong" });
    if (m.t === "snapshot") {
      if (g.state) this.send(ws, { t: "snapshot", state: redactFor(g.state, userId) });
      return;
    }
    if (!g.state || !userId || !g.state.players[userId]) {
      this.send(ws, { t: "reject", v: g.state?.version ?? 0, reason: "Spectators can't act." });
      return;
    }
    if (m.t === "peek") {
      const lib = g.state.players[userId]!.zones.library.slice(0, m.n);
      this.send(ws, { t: "private", payload: { kind: "scry", cards: lib.map((c) => ({ iid: c.iid, cardId: c.cardId })) } });
      return;
    }
    this.applyAction(g, userId, m.action, ws);
  }

  private applyAction(g: LiveGame, actorId: string, action: GameAction, ws: WebSocket): void {
    const state = g.state!;
    if (action.type === "UNDO") {
      const stack = g.undo.get(actorId) ?? [];
      const top = stack[stack.length - 1];
      if (!top || top.version !== state.version) {
        this.send(ws, { t: "reject", v: state.version, reason: top ? "Someone else acted since — can't undo." : "Nothing to undo." });
        return;
      }
      stack.pop();
      const restored = structuredClone(top.before);
      restored.version = state.version + 1; // versions only go forward
      restored.log = [...state.log, { seq: ++g.logSeq, at: Date.now(), actorId, text: "undid their last action" }];
      for (const p of Object.values(restored.players)) p.connected = state.players[p.id]?.connected ?? false;
      g.state = restored;
      this.afterChange(g, actorId, action);
      return;
    }

    const filled = fillEntropy(action, state, actorId);
    if (filled.type === "SEARCH_START") {
      const lib = state.players[actorId]!.zones.library;
      const payload: PrivatePayload = { kind: "search", cards: lib.map((c) => ({ iid: c.iid, cardId: c.cardId })) };
      this.send(ws, { t: "private", payload });
    }
    const next = reduce(state, filled, actorId, Date.now());
    if (next === state) return; // impossible action: no-op, no broadcast
    const stack = g.undo.get(actorId) ?? [];
    stack.push({ before: state, version: next.version });
    if (stack.length > UNDO_DEPTH) stack.shift();
    g.undo.set(actorId, stack);
    // Other players' undo stacks are invalidated by this action (their version no longer matches).
    g.state = next;
    g.logSeq = next.log[next.log.length - 1]?.seq ?? g.logSeq;
    this.afterChange(g, actorId, filled);
  }

  private afterChange(g: LiveGame, actorId: string, action: GameAction): void {
    const state = g.state!;
    for (const [sock, uid] of g.sockets) {
      this.send(sock, { t: "patch", v: state.version, actorId, action, state: redactFor(state, uid) });
    }
    this.db.insert(schema.gameLog).values({ gameId: g.id, seq: g.logSeq, at: new Date(), actorId, action }).onConflictDoNothing().run();
    this.schedulePersist(g);
  }

  private schedulePersist(g: LiveGame): void {
    if (g.persistTimer) return;
    g.persistTimer = setTimeout(() => {
      g.persistTimer = null;
      if (!g.state) return;
      this.db.update(schema.games).set({ state: g.state, version: g.state.version }).where(eq(schema.games.id, g.id)).run();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Flush pending writes (on shutdown). */
  flushAll(): void {
    for (const g of this.live.values()) {
      if (g.persistTimer) {
        clearTimeout(g.persistTimer);
        g.persistTimer = null;
      }
      if (g.state) this.db.update(schema.games).set({ state: g.state, version: g.state.version }).where(eq(schema.games.id, g.id)).run();
    }
  }

  // ---------- helpers ----------

  private mustGet(code: string): LiveGame {
    const g = this.getByCode(code);
    if (!g) throw new AuthError(404, "No table with that code.");
    return g;
  }

  private syncSeats(g: LiveGame): void {
    this.db.transaction((tx) => {
      tx.delete(schema.gamePlayers).where(eq(schema.gamePlayers.gameId, g.id)).run();
      for (const s of g.seats.values()) {
        tx.insert(schema.gamePlayers).values({ gameId: g.id, userId: s.userId, seat: s.seat, deckId: s.deckId, joinedAt: s.joinedAt }).run();
      }
    });
  }

  private lobbyInfo(g: LiveGame): LobbyInfo {
    const connected = new Set([...g.sockets.values()].filter((u): u is string => Boolean(u)));
    const players = [...g.seats.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => {
        const user = this.db.select().from(schema.users).where(eq(schema.users.id, s.userId)).get();
        const deck = s.deckId ? this.db.select({ name: schema.decks.name }).from(schema.decks).where(eq(schema.decks.id, s.deckId)).get() : null;
        return {
          userId: s.userId,
          handle: user?.handle ?? "?",
          displayName: user?.displayName ?? "?",
          seat: s.seat,
          deckId: s.deckId,
          deckName: deck?.name ?? null,
          connected: connected.has(s.userId),
        };
      });
    const spectators = [...g.sockets.values()].filter((u) => !u || !g.seats.has(u)).length;
    return { id: g.id, joinCode: g.joinCode, hostId: g.hostId, status: g.status, players, spectators };
  }

  private broadcastLobby(g: LiveGame): void {
    const info = this.lobbyInfo(g);
    for (const sock of g.sockets.keys()) this.send(sock, { t: "lobby", lobby: info });
  }

  private broadcastSnapshot(g: LiveGame): void {
    if (!g.state) return;
    for (const [sock, uid] of g.sockets) this.send(sock, { t: "snapshot", state: redactFor(g.state, uid) });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}

// ---------- entropy (crypto-backed) ----------

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function permutation(n: number): number[] {
  return shuffle(Array.from({ length: n }, (_, i) => i));
}

let iidCounter = 0;
function serverIid(): string {
  return `s${Date.now().toString(36)}${(iidCounter++).toString(36)}`;
}

/** Fill server-only fields: permutations, random picks, dice, new instance ids. Client values are ignored. */
export function fillEntropy(action: GameAction, state: GameState, actorId: string): GameAction {
  const me = state.players[actorId];
  switch (action.type) {
    case "SHUFFLE":
      return { ...action, permutation: permutation(me?.zones.library.length ?? 0) };
    case "MULLIGAN":
      return { ...action, permutation: permutation((me?.zones.library.length ?? 0) + (me?.zones.hand.length ?? 0)) };
    case "DRAW_RANDOM": {
      const n = me?.zones.library.length ?? 0;
      return { ...action, indices: permutation(n).slice(0, action.count).sort((a, b) => b - a) };
    }
    case "ROLL":
      return { ...action, results: Array.from({ length: action.count }, () => 1 + randomInt(action.sides)) };
    case "CREATE_TOKEN":
      return { ...action, iid: serverIid() };
    case "CLONE":
      return { ...action, newIid: serverIid() };
    default:
      return action;
  }
}

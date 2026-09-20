import type { GameAction } from "./actions.js";
import { emptyZones, ZONES, type CardInstance, type GameState, type LogEntry, type PlayerId, type PlayerState, type Zone } from "./types.js";

/**
 * The whole game, as a pure function. No randomness: SHUFFLE / DRAW_RANDOM / ROLL / MULLIGAN /
 * CREATE_TOKEN / CLONE take their entropy and ids from the action (server-filled), so every client
 * replays to the same state. Nothing is ever "illegal" — the reducer only refuses actions that
 * are impossible (card not found, zone empty), and even then it just returns the state unchanged.
 *
 * Log text uses tokens the client resolves: [[card:<cardId>]], [[player:<playerId>]], [[n:<number>]].
 */
export function reduce(state: GameState, action: GameAction, actorId: PlayerId, at: number): GameState {
  const s = structuredClone(state);
  const actor = s.players[actorId];
  if (!actor) return state;
  const log = makeLogger(s, actorId, at);

  switch (action.type) {
    case "MOVE_CARD": {
      const found = findCard(s, action.iid);
      if (!found) return state;
      moveCard(s, found, action.to, action.position, actorId, { faceDown: action.faceDown });
      logMove(log, found, action.to, actorId, action.faceDown);
      break;
    }
    case "MOVE_MANY": {
      let n = 0;
      let last: Found | null = null;
      for (const iid of action.iids) {
        const found = findCard(s, iid);
        if (!found) continue;
        moveCard(s, found, action.to, action.position, actorId, {});
        last = found;
        n++;
      }
      if (n === 0) return state;
      const owner = last!.player.id;
      log(`moved [[n:${n}]] cards from ${zoneLabel(action.from, owner, actorId)} to ${zoneLabel(action.to, owner, actorId)}`);
      break;
    }
    case "DRAW": {
      const drawn = actor.zones.library.splice(0, action.count);
      if (drawn.length === 0) return state;
      for (const c of drawn) actor.zones.hand.push(resetForHidden(c));
      log(`drew [[n:${drawn.length}]] card${drawn.length === 1 ? "" : "s"}`, `drew ${cardList(drawn)}`);
      break;
    }
    case "DRAW_RANDOM": {
      const indices = [...(action.indices ?? [])].filter((i) => i < actor.zones.library.length).sort((a, b) => b - a);
      if (indices.length === 0) return state;
      const drawn: CardInstance[] = [];
      for (const i of indices) drawn.push(...actor.zones.library.splice(i, 1));
      for (const c of drawn) actor.zones.hand.push(resetForHidden(c));
      log(`drew [[n:${drawn.length}]] random card${drawn.length === 1 ? "" : "s"}`, `drew ${cardList(drawn)} at random`);
      break;
    }
    case "MILL": {
      const milled = actor.zones.library.splice(0, action.count);
      if (milled.length === 0) return state;
      for (const c of milled) actor.zones.graveyard.unshift(resetForPublic(c));
      log(`milled ${cardList(milled)}`);
      break;
    }
    case "SHUFFLE": {
      applyPermutation(actor.zones.library, action.permutation);
      log("shuffled their library");
      break;
    }
    case "SEARCH_START": {
      log("is searching their library");
      break;
    }
    case "SEARCH_END": {
      log("finished searching");
      break;
    }
    case "SCRY": {
      const lib = actor.zones.library;
      const pick = (iids: string[]) =>
        iids.map((iid) => lib.find((c) => c.iid === iid)).filter((c): c is CardInstance => Boolean(c));
      const top = pick(action.toTop);
      const bottom = pick(action.toBottom);
      const moved = new Set([...top, ...bottom].map((c) => c.iid));
      const rest = lib.filter((c) => !moved.has(c.iid));
      actor.zones.library = [...top, ...rest, ...bottom];
      log(`looked at the top of their library: [[n:${top.length}]] on top, [[n:${bottom.length}]] on the bottom`);
      break;
    }
    case "TAP": {
      const cards = action.iids.map((iid) => findCard(s, iid)).filter((f): f is Found => Boolean(f));
      if (cards.length === 0) return state;
      for (const f of cards) f.card.tapped = action.tapped;
      log(`${action.tapped ? "tapped" : "untapped"} ${cardList(cards.map((f) => f.card))}`);
      break;
    }
    case "UNTAP_ALL": {
      let n = 0;
      for (const p of Object.values(s.players)) {
        for (const c of p.zones.battlefield) {
          if (c.controllerId === actorId && c.tapped) {
            c.tapped = false;
            n++;
          }
        }
      }
      log(`untapped [[n:${n}]] permanent${n === 1 ? "" : "s"}`);
      break;
    }
    case "FLIP": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      f.card.faceDown = action.faceDown;
      log(action.faceDown ? `turned a card face down` : `turned ${cardTok(f.card)} face up`);
      break;
    }
    case "TRANSFORM": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      f.card.flipped = !f.card.flipped;
      log(`transformed ${cardTok(f.card)}`);
      break;
    }
    case "SET_COUNTER": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      setCounter(f.card, action.name, action.value);
      log(`set ${action.name} counters on ${cardTok(f.card)} to [[n:${action.value}]]`);
      break;
    }
    case "ADJUST_COUNTER": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      setCounter(f.card, action.name, (f.card.counters[action.name] ?? 0) + action.delta);
      log(`${action.delta >= 0 ? "added" : "removed"} [[n:${Math.abs(action.delta)}]] ${action.name} counter${Math.abs(action.delta) === 1 ? "" : "s"} ${action.delta >= 0 ? "to" : "from"} ${cardTok(f.card)}`);
      break;
    }
    case "CREATE_TOKEN": {
      if (!action.iid) return state;
      const token: CardInstance = {
        iid: action.iid,
        cardId: action.cardId ?? "",
        ownerId: actorId,
        controllerId: actorId,
        tapped: false,
        faceDown: false,
        flipped: false,
        counters: {},
        x: 0.5,
        y: 0.5,
        ...(action.spec ? { token: action.spec } : {}),
      };
      actor.zones.battlefield.push(token);
      log(`created a ${action.spec ? action.spec.name : cardTok(token)} token`);
      break;
    }
    case "CLONE": {
      const f = findCard(s, action.iid);
      if (!f || !action.newIid) return state;
      const copy: CardInstance = {
        ...structuredClone(f.card),
        iid: action.newIid,
        ownerId: actorId,
        controllerId: actorId,
        tapped: false,
        counters: {},
        attachedTo: undefined,
        x: Math.min(1, (f.card.x ?? 0.5) + 0.04),
        y: Math.min(1, (f.card.y ?? 0.5) + 0.04),
      };
      actor.zones.battlefield.push(copy);
      log(`created a copy of ${cardTok(f.card)}`);
      break;
    }
    case "SET_LIFE": {
      const p = s.players[action.playerId];
      if (!p) return state;
      p.life = action.value;
      log(`set [[player:${p.id}]]'s life to [[n:${p.life}]]`);
      break;
    }
    case "ADJUST_LIFE": {
      const p = s.players[action.playerId];
      if (!p) return state;
      p.life += action.delta;
      log(`${action.delta >= 0 ? "+" : "−"}${Math.abs(action.delta)} life for [[player:${p.id}]] → [[n:${p.life}]]`);
      break;
    }
    case "SET_PLAYER_COUNTER": {
      const p = s.players[action.playerId];
      if (!p) return state;
      if (action.value === 0) delete p.counters[action.name];
      else p.counters[action.name] = action.value;
      log(`set [[player:${p.id}]]'s ${action.name} to [[n:${action.value}]]`);
      break;
    }
    case "MOVE_ON_BATTLEFIELD": {
      const f = findCard(s, action.iid);
      if (!f || f.zone !== "battlefield") return state;
      f.card.x = action.x;
      f.card.y = action.y;
      // Positional nudges aren't logged: they'd drown everything else.
      return s;
    }
    case "ATTACH": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      if (action.targetIid === null) {
        f.card.attachedTo = undefined;
        log(`unattached ${cardTok(f.card)}`);
      } else {
        const t = findCard(s, action.targetIid);
        if (!t || t.zone !== "battlefield" || t.card.iid === f.card.iid) return state;
        f.card.attachedTo = t.card.iid;
        log(`attached ${cardTok(f.card)} to ${cardTok(t.card)}`);
      }
      break;
    }
    case "PASS_TURN": {
      const order = s.seatOrder;
      const idx = s.turnPlayer ? order.indexOf(s.turnPlayer) : -1;
      s.turnPlayer = order[(idx + 1) % order.length] ?? null;
      s.turnNumber += 1;
      log(`passed the turn to [[player:${s.turnPlayer}]]`);
      break;
    }
    case "ROLL": {
      const results = action.results ?? [];
      if (results.length === 0) return state;
      const label = action.sides === 2 ? "flipped a coin" : `rolled ${action.count}d${action.sides}`;
      const text = action.sides === 2 ? results.map((r) => (r === 1 ? "heads" : "tails")).join(", ") : results.join(", ");
      log(`${label}: ${text}`);
      break;
    }
    case "MULLIGAN": {
      const hand = actor.zones.hand.splice(0);
      actor.zones.library.push(...hand.map(resetForHidden));
      applyPermutation(actor.zones.library, action.permutation);
      const drawn = actor.zones.library.splice(0, 7);
      actor.zones.hand.push(...drawn);
      log(`took a mulligan and drew [[n:${drawn.length}]]`, `took a mulligan and drew ${cardList(drawn)}`);
      break;
    }
    case "NOTE": {
      const f = findCard(s, action.iid);
      if (!f) return state;
      f.card.note = action.text || undefined;
      log(action.text ? `noted "${action.text}" on ${cardTok(f.card)}` : `cleared the note on ${cardTok(f.card)}`);
      break;
    }
    case "UNDO":
      // Undo is handled by the server from its per-player history; the reducer never sees it.
      return state;
  }

  s.version = state.version + 1;
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  return s;
}

export const MAX_LOG = 500;

// ---------- helpers ----------

type Found = { card: CardInstance; player: PlayerState; zone: Zone; index: number };

export function findCard(s: GameState, iid: string): Found | null {
  for (const player of Object.values(s.players)) {
    for (const zone of ZONES) {
      const index = player.zones[zone].findIndex((c) => c.iid === iid);
      if (index >= 0) return { card: player.zones[zone][index]!, player, zone, index };
    }
  }
  return null;
}

/**
 * Battlefield goes to the actor's side under their control ("I take your creature");
 * every other zone belongs to the card's owner, and control snaps back.
 */
function moveCard(
  s: GameState,
  f: Found,
  to: Zone,
  position: "top" | "bottom" | number,
  actorId: PlayerId,
  opts: { faceDown?: boolean },
): void {
  f.player.zones[f.zone].splice(f.index, 1);
  const card = f.card;
  const dest = to === "battlefield" ? s.players[actorId]! : (s.players[card.ownerId] ?? f.player);
  card.controllerId = to === "battlefield" ? actorId : card.ownerId;
  card.attachedTo = undefined;
  // Anything attached to a permanent that leaves the battlefield comes loose.
  if (f.zone === "battlefield" && to !== "battlefield") {
    for (const p of Object.values(s.players)) for (const c of p.zones.battlefield) if (c.attachedTo === card.iid) c.attachedTo = undefined;
  }
  if (to === "library" || to === "hand") {
    Object.assign(card, resetForHidden(card));
  } else if (to !== "battlefield") {
    Object.assign(card, resetForPublic(card));
    if (to === "exile" || to === "aside") card.faceDown = opts.faceDown ?? false;
  } else {
    if (f.zone !== "battlefield") {
      card.tapped = false;
      card.faceDown = opts.faceDown ?? false;
      card.x ??= 0.5;
      card.y ??= 0.5;
    } else if (opts.faceDown !== undefined) {
      card.faceDown = opts.faceDown;
    }
  }
  const arr = dest.zones[to];
  if (position === "top") arr.unshift(card);
  else if (position === "bottom") arr.push(card);
  else arr.splice(Math.max(0, Math.min(position, arr.length)), 0, card);
}

function resetForHidden(c: CardInstance): CardInstance {
  return { ...c, tapped: false, faceDown: false, flipped: false, counters: {}, x: undefined, y: undefined, attachedTo: undefined, note: undefined };
}
function resetForPublic(c: CardInstance): CardInstance {
  return { ...c, tapped: false, counters: {}, x: undefined, y: undefined, attachedTo: undefined, note: undefined };
}

function setCounter(card: CardInstance, name: string, value: number): void {
  if (value <= 0) delete card.counters[name];
  else card.counters[name] = value;
}

/** In-place Fisher-Yates-free reorder: arr[i] = old[perm[i]]. Invalid permutations are ignored. */
export function applyPermutation<T>(arr: T[], perm: number[] | undefined): void {
  if (!perm || perm.length !== arr.length) return;
  const seen = new Set(perm);
  if (seen.size !== arr.length || perm.some((i) => i < 0 || i >= arr.length)) return;
  const old = arr.slice();
  for (let i = 0; i < perm.length; i++) arr[i] = old[perm[i]!]!;
}

export const PUBLIC_ZONES: ReadonlySet<Zone> = new Set(["battlefield", "graveyard", "exile", "command", "aside"]);

/** Is this card's identity public knowledge? Face-down cards in public zones are not. */
export function isCardPublic(card: CardInstance, zone: Zone): boolean {
  return PUBLIC_ZONES.has(zone) && !card.faceDown;
}

function cardTok(c: CardInstance): string {
  return c.token ? `[[token:${c.token.name}]]` : `[[card:${c.cardId}]]`;
}
function cardList(cards: CardInstance[]): string {
  return cards.map(cardTok).join(", ");
}

function zoneLabel(zone: Zone, ownerId: PlayerId, actorId: PlayerId): string {
  const who = ownerId === actorId ? "their" : `[[player:${ownerId}]]'s`;
  return `${who} ${zone === "aside" ? "set-aside pile" : zone === "command" ? "command zone" : zone}`;
}

function logMove(log: Logger, f: Found, to: Zone, actorId: PlayerId, faceDown: boolean | undefined): void {
  const fromPublic = isCardPublic(f.card, f.zone) && f.zone !== "battlefield" ? true : f.zone === "battlefield" && !f.card.faceDown;
  const toPublic = PUBLIC_ZONES.has(to) && !faceDown;
  const from = zoneLabel(f.zone, f.player.id, actorId);
  const dest = zoneLabel(to, to === "battlefield" ? actorId : f.card.ownerId, actorId);
  if (fromPublic || toPublic) {
    log(`moved ${cardTok(f.card)} from ${from} to ${dest}`);
  } else {
    // hidden → hidden (hand to library, library to hand…): name only for the owner.
    log(`moved a card from ${from} to ${dest}`, `moved ${cardTok(f.card)} from ${from} to ${dest}`, f.card.ownerId);
  }
}

type Logger = (text: string, privateText?: string, privateTo?: PlayerId) => void;

function makeLogger(s: GameState, actorId: PlayerId, at: number): Logger {
  return (text, privateText, privateTo = actorId) => {
    const last = s.log[s.log.length - 1];
    const entry: LogEntry = { seq: (last?.seq ?? 0) + 1, at, actorId, text };
    if (privateText) {
      entry.privateText = privateText;
      entry.privateTo = privateTo;
    }
    s.log.push(entry);
  };
}

// ---------- construction ----------

export type SeatSetup = {
  id: PlayerId;
  seat: number;
  displayName: string;
  /** Scryfall ids for the library, already in the order the server wants (shuffle it first). */
  library: string[];
  command: string[];
  startingLife?: number;
  /** Prefix for instance ids; must be unique per player. */
  iidPrefix: string;
};

export function createGame(id: string, seats: SeatSetup[]): GameState {
  const players: Record<PlayerId, PlayerState> = {};
  const seatOrder = [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.id);
  for (const seat of seats) {
    let n = 0;
    const mk = (cardId: string): CardInstance => ({
      iid: `${seat.iidPrefix}${(n++).toString(36)}`,
      cardId,
      ownerId: seat.id,
      controllerId: seat.id,
      tapped: false,
      faceDown: false,
      flipped: false,
      counters: {},
    });
    const zones = emptyZones();
    zones.library = seat.library.map(mk);
    zones.command = seat.command.map(mk);
    players[seat.id] = {
      id: seat.id,
      seat: seat.seat,
      displayName: seat.displayName,
      life: seat.startingLife ?? (seat.command.length > 0 ? 40 : 20),
      counters: {},
      zones,
      connected: false,
    };
  }
  return { id, version: 0, players, seatOrder, turnPlayer: seatOrder[0] ?? null, turnNumber: 1, log: [] };
}

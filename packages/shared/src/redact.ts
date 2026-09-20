import type { CardInstance, GameState, LogEntry, PlayerId, PlayerState } from "./types.js";

/**
 * What a client is allowed to see. Same shape as GameState so the client renders one type;
 * hidden cards keep their iid (for animation and counts) and lose everything else.
 * `cardId === ""` means "unknown to you". Libraries are sent as sorted iids: order is never
 * revealed to anyone, including the owner (they use SEARCH/SCRY for that).
 */
export type RedactedGameState = GameState;

export function redactFor(state: GameState, viewerId: PlayerId | null): RedactedGameState {
  const players: Record<PlayerId, PlayerState> = {};
  for (const p of Object.values(state.players)) {
    const mine = p.id === viewerId;
    players[p.id] = {
      ...p,
      zones: {
        library: p.zones.library.map(hide).sort((a, b) => (a.iid < b.iid ? -1 : 1)),
        hand: mine ? p.zones.hand : p.zones.hand.map(hide),
        battlefield: p.zones.battlefield.map((c) => (c.faceDown && c.controllerId !== viewerId ? hide(c) : c)),
        graveyard: p.zones.graveyard,
        exile: p.zones.exile.map((c) => (c.faceDown && c.ownerId !== viewerId ? hide(c) : c)),
        command: p.zones.command,
        aside: p.zones.aside.map((c) => (c.faceDown && c.ownerId !== viewerId ? hide(c) : c)),
      },
    };
  }
  return {
    ...state,
    players,
    log: state.log.map((e) => redactLog(e, viewerId)),
  };
}

function hide(c: CardInstance): CardInstance {
  return {
    iid: c.iid,
    cardId: "",
    ownerId: c.ownerId,
    controllerId: c.controllerId,
    tapped: c.tapped,
    faceDown: true,
    flipped: false,
    counters: c.counters,
    x: c.x,
    y: c.y,
    attachedTo: c.attachedTo,
  };
}

export function redactLog(e: LogEntry, viewerId: PlayerId | null): LogEntry {
  if (e.privateText && e.privateTo === viewerId) return { seq: e.seq, at: e.at, actorId: e.actorId, text: e.privateText };
  return { seq: e.seq, at: e.at, actorId: e.actorId, text: e.text };
}

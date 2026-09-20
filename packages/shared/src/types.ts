export type PlayerId = string;

export const ZONES = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "aside",
] as const;
export type Zone = (typeof ZONES)[number];

export type TokenSpec = {
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  colors: string[];
};

export type CardInstance = {
  iid: string;
  cardId: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  tapped: boolean;
  faceDown: boolean;
  flipped: boolean;
  counters: Record<string, number>;
  x?: number;
  y?: number;
  attachedTo?: string;
  note?: string;
  /** Present for tokens that have no Scryfall printing behind them. */
  token?: TokenSpec;
};

export type PlayerState = {
  id: PlayerId;
  seat: number;
  displayName: string;
  life: number;
  counters: Record<string, number>;
  zones: Record<Zone, CardInstance[]>;
  connected: boolean;
};

export type LogEntry = {
  seq: number;
  at: number;
  actorId: PlayerId;
  text: string;
  /** Shown only to `privateTo`; everyone else sees `text`. */
  privateText?: string;
  privateTo?: PlayerId;
};

export type GameState = {
  id: string;
  version: number;
  players: Record<PlayerId, PlayerState>;
  seatOrder: PlayerId[];
  turnPlayer: PlayerId | null;
  turnNumber: number;
  log: LogEntry[];
};

export function emptyZones(): Record<Zone, CardInstance[]> {
  return {
    library: [],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    command: [],
    aside: [],
  };
}

import { z } from "zod";
import { GameActionSchema, type GameAction } from "./actions.js";
import type { RedactedGameState } from "./redact.js";

export const ClientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("action"), v: z.number().int().min(0), action: GameActionSchema }),
  z.object({ t: z.literal("snapshot") }),
  /** Look at the top N of your own library; answered privately, no state change. */
  z.object({ t: z.literal("peek"), n: z.number().int().min(1).max(100) }),
  z.object({ t: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type LobbyPlayer = {
  userId: string;
  handle: string;
  displayName: string;
  seat: number;
  deckId: string | null;
  deckName: string | null;
  connected: boolean;
};

export type LobbyInfo = {
  id: string;
  joinCode: string;
  hostId: string;
  status: "lobby" | "playing" | "ended";
  players: LobbyPlayer[];
  spectators: number;
};

export type PrivatePayload = { kind: "search" | "scry"; cards: Array<{ iid: string; cardId: string }> };

/** Server → client. Typed in TS only; the client trusts the server. */
export type ServerMessage =
  | { t: "hello"; you: string | null; lobby: LobbyInfo }
  | { t: "lobby"; lobby: LobbyInfo }
  | { t: "snapshot"; state: RedactedGameState }
  | { t: "patch"; v: number; actorId: string; action: GameAction; state: RedactedGameState }
  | { t: "private"; payload: PrivatePayload }
  | { t: "reject"; v: number; reason: string }
  | { t: "error"; reason: string }
  | { t: "pong" };

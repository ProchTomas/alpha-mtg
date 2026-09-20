import { z } from "zod";
import { GameActionSchema } from "./actions.js";

export const ClientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("action"), v: z.number().int().min(0), action: GameActionSchema }),
  z.object({ t: z.literal("snapshot") }),
  z.object({ t: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Server → client. Typed in TS only; the client trusts the server. */
export type ServerMessage =
  | { t: "snapshot"; state: unknown }
  | { t: "patch"; v: number; actorId: string; action: unknown; state: unknown }
  | { t: "private"; payload: unknown }
  | { t: "reject"; v: number; reason: string }
  | { t: "pong" };

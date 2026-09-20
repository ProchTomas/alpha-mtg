import { z } from "zod";
import { ZONES } from "./types.js";

const zone = z.enum(ZONES);
const iid = z.string().min(1);
const position = z.union([z.literal("top"), z.literal("bottom"), z.number().int().min(0)]);
const counterName = z.string().min(1).max(40);

export const TokenSpecSchema = z.object({
  name: z.string().min(1).max(80),
  typeLine: z.string().max(120),
  power: z.string().max(4).optional(),
  toughness: z.string().max(4).optional(),
  colors: z.array(z.enum(["W", "U", "B", "R", "G"])).max(5),
});

/**
 * The whole game. Fields marked "server-filled" are entropy or ids the server
 * injects before broadcasting so every client replays to an identical state.
 */
export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MOVE_CARD"),
    iid,
    from: zone,
    to: zone,
    position,
    faceDown: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("MOVE_MANY"),
    iids: z.array(iid).min(1),
    from: zone,
    to: zone,
    position,
  }),
  z.object({ type: z.literal("DRAW"), count: z.number().int().min(1).max(100) }),
  z.object({
    type: z.literal("DRAW_RANDOM"),
    count: z.number().int().min(1).max(100),
    /** server-filled: library indices to pull, sorted descending */
    indices: z.array(z.number().int().min(0)).optional(),
  }),
  z.object({ type: z.literal("MILL"), count: z.number().int().min(1).max(100) }),
  z.object({
    type: z.literal("SHUFFLE"),
    /** server-filled: permutation of library indices */
    permutation: z.array(z.number().int().min(0)).optional(),
  }),
  z.object({ type: z.literal("SEARCH_START") }),
  z.object({ type: z.literal("SEARCH_END") }),
  z.object({ type: z.literal("SCRY"), toTop: z.array(iid), toBottom: z.array(iid) }),
  z.object({ type: z.literal("TAP"), iids: z.array(iid).min(1), tapped: z.boolean() }),
  z.object({ type: z.literal("UNTAP_ALL") }),
  z.object({ type: z.literal("FLIP"), iid, faceDown: z.boolean() }),
  z.object({ type: z.literal("TRANSFORM"), iid }),
  z.object({ type: z.literal("SET_COUNTER"), iid, name: counterName, value: z.number().int() }),
  z.object({ type: z.literal("ADJUST_COUNTER"), iid, name: counterName, delta: z.number().int() }),
  z.object({
    type: z.literal("CREATE_TOKEN"),
    cardId: z.string().optional(),
    spec: TokenSpecSchema.optional(),
    /** server-filled */
    iid: iid.optional(),
  }),
  z.object({ type: z.literal("CLONE"), iid, /** server-filled */ newIid: iid.optional() }),
  z.object({ type: z.literal("SET_LIFE"), playerId: z.string(), value: z.number().int() }),
  z.object({ type: z.literal("ADJUST_LIFE"), playerId: z.string(), delta: z.number().int() }),
  z.object({
    type: z.literal("SET_PLAYER_COUNTER"),
    playerId: z.string(),
    name: counterName,
    value: z.number().int(),
  }),
  z.object({
    type: z.literal("MOVE_ON_BATTLEFIELD"),
    iid,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal("ATTACH"), iid, targetIid: iid.nullable() }),
  z.object({ type: z.literal("PASS_TURN") }),
  z.object({
    type: z.literal("ROLL"),
    sides: z.number().int().min(2).max(1000),
    count: z.number().int().min(1).max(20),
    /** server-filled */
    results: z.array(z.number().int().min(1)).optional(),
  }),
  z.object({
    type: z.literal("MULLIGAN"),
    /** server-filled: permutation for the reshuffle */
    permutation: z.array(z.number().int().min(0)).optional(),
  }),
  z.object({ type: z.literal("NOTE"), iid, text: z.string().max(200) }),
  z.object({ type: z.literal("UNDO") }),
]);

export type GameAction = z.infer<typeof GameActionSchema>;
export type GameActionType = GameAction["type"];

import { describe, expect, it } from "vitest";
import type { GameAction } from "./actions.js";
import { applyPermutation, createGame, findCard, reduce } from "./reducer.js";
import { redactFor } from "./redact.js";
import type { GameState } from "./types.js";

const A = "anna";
const B = "bob";

function newGame(): GameState {
  return createGame("g1", [
    { id: A, seat: 0, displayName: "Anna", iidPrefix: "a", library: ["bolt", "island", "delver", "bolt", "mountain", "island", "swamp", "goblin", "forest", "plains"], command: [] },
    { id: B, seat: 1, displayName: "Bob", iidPrefix: "b", library: ["sol-ring", "atraxa", "forest", "plains", "island", "swamp", "tower", "signet"], command: ["atraxa-cmd"] },
  ]);
}

/** Apply a list of [actor, action] and return the final state; asserts version increments only on effect. */
function play(state: GameState, steps: Array<[string, GameAction]>): GameState {
  let s = state;
  let t = 1000;
  for (const [actor, action] of steps) s = reduce(s, action, actor, (t += 1000));
  return s;
}

const zone = (s: GameState, p: string, z: keyof GameState["players"][string]["zones"]) => s.players[p]!.zones[z];
const ids = (s: GameState, p: string, z: keyof GameState["players"][string]["zones"]) => zone(s, p, z).map((c) => c.cardId);

describe("createGame", () => {
  it("sets up libraries, command zone and life totals", () => {
    const s = newGame();
    expect(zone(s, A, "library")).toHaveLength(10);
    expect(zone(s, B, "command")).toHaveLength(1);
    expect(s.players[A]!.life).toBe(20);
    expect(s.players[B]!.life).toBe(40); // has a commander
    expect(s.turnPlayer).toBe(A);
    const all = [...zone(s, A, "library"), ...zone(s, B, "library"), ...zone(s, B, "command")].map((c) => c.iid);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("reduce", () => {
  it("is pure: does not mutate the input state", () => {
    const s = newGame();
    const snapshot = JSON.stringify(s);
    reduce(s, { type: "DRAW", count: 3 }, A, 1);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("plays a scripted 20-action game to a known final state", () => {
    const s0 = newGame();
    const a = (t: number) => zone(s0, A, "library")[t]!.iid; // top-of-library iids before any action
    const bCmd = zone(s0, B, "command")[0]!.iid;

    const s = play(s0, [
      [A, { type: "DRAW", count: 7 }], // 1: hand = bolt island delver bolt mountain island swamp
      [B, { type: "DRAW", count: 7 }], // 2
      [A, { type: "MOVE_CARD", iid: a(1), from: "hand", to: "battlefield", position: "bottom" }], // 3: island
      [A, { type: "TAP", iids: [a(1)], tapped: true }], // 4
      [A, { type: "MOVE_CARD", iid: a(2), from: "hand", to: "battlefield", position: "bottom" }], // 5: delver
      [A, { type: "PASS_TURN" }], // 6
      [B, { type: "MOVE_CARD", iid: bCmd, from: "command", to: "battlefield", position: "bottom" }], // 7: commander
      [B, { type: "ADJUST_COUNTER", iid: bCmd, name: "+1/+1", delta: 2 }], // 8
      [B, { type: "ADJUST_LIFE", playerId: A, delta: -4 }], // 9: Anna to 16
      [B, { type: "PASS_TURN" }], // 10
      [A, { type: "UNTAP_ALL" }], // 11
      [A, { type: "TRANSFORM", iid: a(2) }], // 12: delver flips
      [A, { type: "MOVE_CARD", iid: a(0), from: "hand", to: "graveyard", position: "top" }], // 13: bolt cast
      [A, { type: "ADJUST_LIFE", playerId: B, delta: -3 }], // 14: Bob to 37
      [A, { type: "MOVE_CARD", iid: bCmd, from: "battlefield", to: "battlefield", position: "bottom" }], // 15: Anna steals Atraxa
      [B, { type: "SET_LIFE", playerId: B, value: 30 }], // 16
      [A, { type: "CREATE_TOKEN", iid: "tok1", spec: { name: "Soldier", typeLine: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"] } }], // 17
      [A, { type: "CLONE", iid: "tok1", newIid: "tok2" }], // 18
      [B, { type: "MILL", count: 1 }], // 19: Bob mills top (library[7] = signet is 8th... after 7 draws top is "signet")
      [A, { type: "MOVE_CARD", iid: a(3), from: "hand", to: "library", position: "bottom" }], // 20: bolt to bottom
    ]);

    expect(s.version).toBe(20);
    expect(s.turnNumber).toBe(3);
    expect(s.turnPlayer).toBe(A);
    expect(s.players[A]!.life).toBe(16);
    expect(s.players[B]!.life).toBe(30);

    // Anna: library had 10, drew 7 (3 left), put 1 on bottom → 4, bottom is bolt.
    expect(ids(s, A, "library")).toEqual(["goblin", "forest", "plains", "bolt"]);
    // hand: drew 7, played island + delver, cast bolt, bottomed bolt → mountain island swamp
    expect(ids(s, A, "hand")).toEqual(["mountain", "island", "swamp"]);
    expect(ids(s, A, "graveyard")).toEqual(["bolt"]);
    // battlefield: island (untapped after UNTAP_ALL), delver (transformed), stolen Atraxa, two tokens
    const bf = zone(s, A, "battlefield");
    expect(bf.map((c) => c.cardId)).toEqual(["island", "delver", "atraxa-cmd", "", ""]);
    expect(bf[0]!.tapped).toBe(false);
    expect(bf[1]!.flipped).toBe(true);
    expect(bf[2]!.controllerId).toBe(A);
    expect(bf[2]!.ownerId).toBe(B);
    expect(bf[2]!.counters).toEqual({ "+1/+1": 2 }); // counters survive battlefield→battlefield
    expect(bf[3]!.token?.name).toBe("Soldier");
    expect(bf[4]!.token?.name).toBe("Soldier");
    expect(bf[4]!.iid).toBe("tok2");

    // Bob: 8-card library, drew 7, milled 1 → empty; graveyard has the milled card; command zone empty.
    expect(zone(s, B, "library")).toHaveLength(0);
    expect(ids(s, B, "graveyard")).toEqual(["signet"]);
    expect(zone(s, B, "command")).toHaveLength(0);
    expect(zone(s, B, "battlefield")).toHaveLength(0);

    // Log: one entry per effective action, sequential.
    expect(s.log).toHaveLength(20);
    expect(s.log.map((e) => e.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(s.log[0]!.text).toBe("drew [[n:7]] cards");
    expect(s.log[0]!.privateText).toContain("[[card:bolt]]");
    expect(s.log[14]!.text).toContain("[[card:atraxa-cmd]]");
  });

  it("returns the same state object for impossible actions", () => {
    const s = newGame();
    expect(reduce(s, { type: "TAP", iids: ["nope"], tapped: true }, A, 1)).toBe(s);
    expect(reduce(s, { type: "DRAW", count: 1 }, "ghost", 1)).toBe(s);
    const empty = play(s, [[B, { type: "DRAW", count: 8 }]]);
    expect(reduce(empty, { type: "DRAW", count: 1 }, B, 1)).toBe(empty);
  });

  it("stolen permanents go home when they leave the battlefield", () => {
    let s = newGame();
    const bCmd = zone(s, B, "command")[0]!.iid;
    s = play(s, [
      [B, { type: "MOVE_CARD", iid: bCmd, from: "command", to: "battlefield", position: "bottom" }],
      [A, { type: "MOVE_CARD", iid: bCmd, from: "battlefield", to: "battlefield", position: "bottom" }],
      [A, { type: "MOVE_CARD", iid: bCmd, from: "battlefield", to: "graveyard", position: "top" }],
    ]);
    expect(zone(s, A, "graveyard")).toHaveLength(0);
    expect(ids(s, B, "graveyard")).toEqual(["atraxa-cmd"]);
    expect(zone(s, B, "graveyard")[0]!.controllerId).toBe(B);
  });

  it("shuffle applies a permutation and rejects invalid ones", () => {
    const s = newGame();
    const before = ids(s, A, "library");
    const perm = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const shuffled = reduce(s, { type: "SHUFFLE", permutation: perm }, A, 1);
    expect(ids(shuffled, A, "library")).toEqual([...before].reverse());
    const bad = reduce(s, { type: "SHUFFLE", permutation: [0, 0, 0] }, A, 1);
    expect(ids(bad, A, "library")).toEqual(before);
    expect(bad.version).toBe(1); // still logged as a shuffle

    const arr = [1, 2, 3];
    applyPermutation(arr, [2, 0, 1]);
    expect(arr).toEqual([3, 1, 2]);
  });

  it("scry reorders top and bottom", () => {
    const s = newGame();
    const lib = zone(s, A, "library");
    const [c0, c1, c2] = [lib[0]!.iid, lib[1]!.iid, lib[2]!.iid];
    const after = reduce(s, { type: "SCRY", toTop: [c2, c0], toBottom: [c1] }, A, 1);
    const out = ids(after, A, "library");
    expect(out.slice(0, 2)).toEqual(["delver", "bolt"]);
    expect(out[out.length - 1]).toBe("island");
    expect(out).toHaveLength(10);
  });

  it("mulligan shuffles the hand back and draws seven", () => {
    let s = play(newGame(), [[A, { type: "DRAW", count: 7 }]]);
    const perm = Array.from({ length: 10 }, (_, i) => 9 - i);
    s = reduce(s, { type: "MULLIGAN", permutation: perm }, A, 1);
    expect(zone(s, A, "hand")).toHaveLength(7);
    expect(zone(s, A, "library")).toHaveLength(3);
    // library after putting hand back: [goblin forest plains bolt island delver bolt mountain island swamp], reversed
    expect(ids(s, A, "hand")).toEqual(["swamp", "island", "mountain", "bolt", "delver", "island", "bolt"]);
  });

  it("attachments come loose when the host leaves", () => {
    let s = play(newGame(), [[A, { type: "DRAW", count: 3 }]]);
    const [h0, h1] = zone(s, A, "hand").map((c) => c.iid);
    s = play(s, [
      [A, { type: "MOVE_CARD", iid: h0!, from: "hand", to: "battlefield", position: "bottom" }],
      [A, { type: "MOVE_CARD", iid: h1!, from: "hand", to: "battlefield", position: "bottom" }],
      [A, { type: "ATTACH", iid: h1!, targetIid: h0! }],
    ]);
    expect(findCard(s, h1!)!.card.attachedTo).toBe(h0);
    s = play(s, [[A, { type: "MOVE_CARD", iid: h0!, from: "battlefield", to: "graveyard", position: "top" }]]);
    expect(findCard(s, h1!)!.card.attachedTo).toBeUndefined();
  });

  it("caps the log", () => {
    let s = newGame();
    for (let i = 0; i < 520; i++) s = reduce(s, { type: "ADJUST_LIFE", playerId: A, delta: 1 }, A, i);
    expect(s.log).toHaveLength(500);
    expect(s.log[0]!.seq).toBe(21);
  });
});

describe("redactFor", () => {
  it("hides other hands, all libraries, and face-down cards", () => {
    let s = play(newGame(), [
      [A, { type: "DRAW", count: 2 }],
      [B, { type: "DRAW", count: 2 }],
    ]);
    const aHand = zone(s, A, "hand")[0]!.iid;
    s = play(s, [[A, { type: "MOVE_CARD", iid: aHand, from: "hand", to: "battlefield", position: "bottom", faceDown: true }]]);

    const forA = redactFor(s, A);
    const forB = redactFor(s, B);
    const spectator = redactFor(s, null);

    // own hand visible, other hand hidden but same length
    expect(forA.players[A]!.zones.hand.map((c) => c.cardId)).toEqual(["island"]);
    expect(forB.players[A]!.zones.hand).toHaveLength(1);
    expect(forB.players[A]!.zones.hand[0]!.cardId).toBe("");
    expect(spectator.players[B]!.zones.hand.every((c) => c.cardId === "")).toBe(true);

    // libraries: no card ids for anyone, sorted iids, correct count
    for (const view of [forA, forB, spectator]) {
      const lib = view.players[A]!.zones.library;
      expect(lib).toHaveLength(8);
      expect(lib.every((c) => c.cardId === "")).toBe(true);
      expect(lib.map((c) => c.iid)).toEqual([...lib.map((c) => c.iid)].sort());
    }

    // face-down battlefield card: controller sees it, others don't
    expect(forA.players[A]!.zones.battlefield[0]!.cardId).toBe("bolt");
    expect(forB.players[A]!.zones.battlefield[0]!.cardId).toBe("");
    expect(forB.players[A]!.zones.battlefield[0]!.iid).toBe(aHand);

    // private log text only for its owner
    const drawA = (v: GameState) => v.log.find((e) => e.actorId === A && e.text.includes("drew"))!;
    expect(drawA(forA).text).toContain("[[card:bolt]]");
    expect(drawA(forB).text).toBe("drew [[n:2]] cards");
    expect(forA.log.every((e) => e.privateText === undefined)).toBe(true);
  });

  it("never leaks a library order even through a serialised snapshot", () => {
    const s = newGame();
    const before = JSON.stringify(redactFor(s, A).players[A]!.zones.library);
    const after = JSON.stringify(redactFor(reduce(s, { type: "SHUFFLE", permutation: [3, 1, 4, 0, 2, 9, 8, 7, 6, 5] }, A, 1), A).players[A]!.zones.library);
    expect(after).toBe(before);
  });
});

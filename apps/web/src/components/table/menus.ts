import type { CardInstance, CardSummary, GameAction, Zone } from "@alphamtg/shared";
import { hasBackFace } from "@alphamtg/shared";
import type { MenuItem } from "./ContextMenu";
import { ZONE_LABEL } from "@/lib/game";

type Dispatch = (a: GameAction) => void;

function askNumber(label: string, def: number): number | null {
  const v = window.prompt(label, String(def));
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MOVE_TARGETS: Array<{ zone: Zone; position: "top" | "bottom"; label: string; faceDown?: boolean }> = [
  { zone: "hand", position: "bottom", label: "Hand" },
  { zone: "battlefield", position: "bottom", label: "Battlefield" },
  { zone: "battlefield", position: "bottom", label: "Battlefield, face down", faceDown: true },
  { zone: "graveyard", position: "top", label: "Graveyard" },
  { zone: "exile", position: "top", label: "Exile" },
  { zone: "exile", position: "top", label: "Exile, face down", faceDown: true },
  { zone: "library", position: "top", label: "Top of library" },
  { zone: "library", position: "bottom", label: "Bottom of library" },
  { zone: "command", position: "bottom", label: "Command zone" },
  { zone: "aside", position: "bottom", label: "Set aside" },
];

function moveSubmenu(card: CardInstance, from: Zone, dispatch: Dispatch): MenuItem {
  return {
    label: "Move to",
    children: MOVE_TARGETS.filter((t) => !(t.zone === from && !t.faceDown && from !== "library")).map((t) => ({
      label: t.label,
      onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from, to: t.zone, position: t.position, faceDown: t.faceDown }),
    })),
  };
}

function countersSubmenu(card: CardInstance, dispatch: Dispatch): MenuItem {
  const adj = (name: string, delta: number) => () => dispatch({ type: "ADJUST_COUNTER", iid: card.iid, name, delta });
  const existing = Object.keys(card.counters);
  return {
    label: "Counters",
    children: [
      { label: "+1/+1", onSelect: adj("+1/+1", 1), hint: "add" },
      { label: "+1/+1", onSelect: adj("+1/+1", -1), hint: "remove", disabled: !card.counters["+1/+1"] },
      { label: "-1/-1", onSelect: adj("-1/-1", 1), hint: "add" },
      { label: "-1/-1", onSelect: adj("-1/-1", -1), hint: "remove", disabled: !card.counters["-1/-1"] },
      { label: "Loyalty", onSelect: adj("loyalty", 1), hint: "+1" },
      { label: "Loyalty", onSelect: adj("loyalty", -1), hint: "−1", disabled: !card.counters["loyalty"] },
      ...existing
        .filter((n) => !["+1/+1", "-1/-1", "loyalty"].includes(n))
        .flatMap((n) => [
          { label: n, onSelect: adj(n, 1), hint: "+1" },
          { label: n, onSelect: adj(n, -1), hint: "−1" },
        ]),
      { separator: true },
      {
        label: "Other…",
        onSelect: () => {
          const name = window.prompt("Counter name", "charge")?.trim();
          if (!name) return;
          const n = askNumber(`How many ${name} counters?`, 1);
          if (n) dispatch({ type: "SET_COUNTER", iid: card.iid, name, value: (card.counters[name] ?? 0) + n });
        },
      },
      ...(existing.length ? [{ label: "Clear all", onSelect: () => existing.forEach((n) => dispatch({ type: "SET_COUNTER", iid: card.iid, name: n, value: 0 })) }] : []),
    ],
  };
}

export function cardMenu(card: CardInstance, zone: Zone, data: CardSummary | undefined, dispatch: Dispatch): MenuItem[] {
  const items: MenuItem[] = [];
  if (zone === "battlefield") {
    items.push(
      { label: card.tapped ? "Untap" : "Tap", onSelect: () => dispatch({ type: "TAP", iids: [card.iid], tapped: !card.tapped }), hint: "dbl-click" },
      { label: card.faceDown ? "Turn face up" : "Turn face down", onSelect: () => dispatch({ type: "FLIP", iid: card.iid, faceDown: !card.faceDown }) },
    );
    if (data && hasBackFace(data)) items.push({ label: "Transform", onSelect: () => dispatch({ type: "TRANSFORM", iid: card.iid }) });
    items.push(countersSubmenu(card, dispatch));
    items.push({ label: "Clone", onSelect: () => dispatch({ type: "CLONE", iid: card.iid }) });
    if (card.attachedTo) items.push({ label: "Unattach", onSelect: () => dispatch({ type: "ATTACH", iid: card.iid, targetIid: null }) });
    items.push({
      label: card.note ? "Edit note…" : "Add note…",
      onSelect: () => {
        const text = window.prompt("Note", card.note ?? "");
        if (text !== null) dispatch({ type: "NOTE", iid: card.iid, text: text.trim() });
      },
    });
    items.push({ separator: true });
  } else if (zone === "hand") {
    items.push(
      { label: "Play", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: "hand", to: "battlefield", position: "bottom" }), hint: "dbl-click" },
      { label: "Play face down", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: "hand", to: "battlefield", position: "bottom", faceDown: true }) },
      { label: "Discard", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: "hand", to: "graveyard", position: "top" }) },
      { separator: true },
    );
  } else if (zone === "command") {
    items.push({ label: "Cast", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: "command", to: "battlefield", position: "bottom" }), hint: "dbl-click" }, { separator: true });
  } else {
    items.push(
      { label: "To battlefield", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: zone, to: "battlefield", position: "bottom" }), hint: "dbl-click" },
      { label: "To hand", onSelect: () => dispatch({ type: "MOVE_CARD", iid: card.iid, from: zone, to: "hand", position: "bottom" }) },
      { separator: true },
    );
  }
  items.push(moveSubmenu(card, zone, dispatch));
  return items;
}

export function libraryMenu(
  count: number,
  dispatch: Dispatch,
  extras: { onSearch: () => void; onScry: (n: number) => void },
): MenuItem[] {
  return [
    { label: "Draw", onSelect: () => dispatch({ type: "DRAW", count: 1 }), hint: "D", disabled: count === 0 },
    { label: "Draw 7", onSelect: () => dispatch({ type: "DRAW", count: 7 }), disabled: count === 0 },
    {
      label: "Draw N…",
      onSelect: () => {
        const n = askNumber("Draw how many?", 2);
        if (n) dispatch({ type: "DRAW", count: n });
      },
      disabled: count === 0,
    },
    { label: "Draw a random card", onSelect: () => dispatch({ type: "DRAW_RANDOM", count: 1 }), disabled: count === 0 },
    { separator: true },
    { label: "Shuffle", onSelect: () => dispatch({ type: "SHUFFLE" }), hint: "S" },
    { label: "Search…", onSelect: extras.onSearch, disabled: count === 0 },
    {
      label: "Scry / look at top N…",
      onSelect: () => {
        const n = askNumber("Look at how many?", 1);
        if (n) extras.onScry(Math.min(n, count));
      },
      disabled: count === 0,
    },
    {
      label: "Mill N…",
      onSelect: () => {
        const n = askNumber("Mill how many?", 1);
        if (n) dispatch({ type: "MILL", count: n });
      },
      disabled: count === 0,
    },
    { separator: true },
    { label: "Mulligan (shuffle hand in, draw 7)", onSelect: () => dispatch({ type: "MULLIGAN" }) },
  ];
}

export function zoneName(zone: Zone): string {
  return ZONE_LABEL[zone];
}

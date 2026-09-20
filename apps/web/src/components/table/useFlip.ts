import { useLayoutEffect, useRef } from "react";
import type { GameState, Zone } from "@alphamtg/shared";

const DURATION = 180;
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Cards the local player just dropped: they snap instead of sliding (the drag overlay was already there). */
const justDropped = new Map<string, number>();
export function markDropped(iid: string): void {
  justDropped.set(iid, Date.now());
}
export function wasJustDropped(iid: string): boolean {
  const t = justDropped.get(iid);
  if (t === undefined) return false;
  if (Date.now() - t > 1000) {
    justDropped.delete(iid);
    return false;
  }
  return true;
}

/**
 * The one orchestrated moment: a card that changes zone travels in a straight line for 180 ms
 * with a slight scale dip. Only zone changes animate — a card that merely moved on the
 * battlefield, or whose container resized, is left alone, so nothing else ever flickers.
 * Cards arriving from a hidden pile fade in. prefers-reduced-motion cuts to the destination.
 */
export function useFlip(state: GameState, root: React.RefObject<HTMLElement | null>): void {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const prevZones = useRef<Map<string, Zone>>(new Map());

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const zones = zoneOf(state);
    const nodes = el.querySelectorAll<HTMLElement>("[data-iid]");
    const nextRects = new Map<string, DOMRect>();
    const skip = reduced();

    for (const node of nodes) {
      const iid = node.dataset.iid!;
      if (node.closest("[data-no-flip]")) continue;
      const rect = node.getBoundingClientRect();
      nextRects.set(iid, rect);
      if (skip) continue;
      const before = prevZones.current.get(iid);
      const now = zones.get(iid);
      if (before === undefined || before === now) continue; // not a zone change
      if (wasJustDropped(iid)) continue;
      const was = prevRects.current.get(iid);
      if (!was) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: "ease-out" });
        continue;
      }
      const dx = was.left - rect.left;
      const dy = was.top - rect.top;
      const sx = was.width / rect.width || 1;
      const sy = was.height / rect.height || 1;
      const base = node.style.transform;
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) ${base}`.trim() },
          { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(0.96) ${base}`.trim(), offset: 0.5 },
          { transform: base || "none" },
        ],
        { duration: DURATION, easing: "ease-in-out" },
      );
    }
    prevRects.current = nextRects;
    prevZones.current = zones;
  }, [state, root]);
}

function zoneOf(state: GameState): Map<string, Zone> {
  const m = new Map<string, Zone>();
  for (const p of Object.values(state.players)) {
    for (const [zone, cards] of Object.entries(p.zones) as Array<[Zone, { iid: string }[]]>) {
      for (const c of cards) m.set(c.iid, zone);
    }
  }
  return m;
}

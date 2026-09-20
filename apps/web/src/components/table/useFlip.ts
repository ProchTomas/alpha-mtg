import { useLayoutEffect, useRef } from "react";

const DURATION = 180;
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * FLIP animation for cards. Every rendered card carries data-iid; after each state commit we
 * compare each card's rect with where it was at the previous commit and animate the delta:
 * a straight line in 180 ms with a slight scale dip. Cards that weren't rendered before
 * (drawn from a pile) fade in. Respects prefers-reduced-motion by cutting to the destination.
 */
export function useFlip(dep: unknown, root: React.RefObject<HTMLElement | null>): void {
  const prev = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const nodes = el.querySelectorAll<HTMLElement>("[data-iid]");
    const next = new Map<string, DOMRect>();
    const skip = reduced();
    for (const node of nodes) {
      const iid = node.dataset.iid!;
      if (node.closest("[data-no-flip]")) continue;
      const rect = node.getBoundingClientRect();
      next.set(iid, rect);
      if (skip) continue;
      const was = prev.current.get(iid);
      if (!was) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: "ease-out" });
        continue;
      }
      const dx = was.left - rect.left;
      const dy = was.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const sx = was.width / rect.width || 1;
      const sy = was.height / rect.height || 1;
      const base = node.style.transform; // keeps the tapped rotation
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) ${base}`.trim() },
          { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(0.96) ${base}`.trim(), offset: 0.5 },
          { transform: base || "none" },
        ],
        { duration: DURATION, easing: "ease-in-out" },
      );
    }
    prev.current = next;
  }, [dep, root]);
}

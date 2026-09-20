import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

export type MenuItem =
  | { label: string; onSelect: () => void; disabled?: boolean; hint?: string }
  | { separator: true }
  | { label: string; children: MenuItem[] }
  | { custom: ReactNode };

type MenuState = {
  open: { x: number; y: number; items: MenuItem[]; title?: string } | null;
  show: (x: number, y: number, items: MenuItem[], title?: string) => void;
  close: () => void;
};

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items, title) => set({ open: { x, y, items, title } }),
  close: () => set({ open: null }),
}));

/** Mount once. A plain positioned list, no animation, closes on click-away / Escape. */
export function ContextMenuLayer() {
  const { open, close } = useMenu();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-menu]")) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);
  if (!open) return null;
  return <MenuPanel x={open.x} y={open.y} items={open.items} title={open.title} onDone={close} />;
}

function MenuPanel({ x, y, items, title, onDone }: { x: number; y: number; items: MenuItem[]; title?: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<{ idx: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);
  return (
    <div
      ref={ref}
      data-menu
      className="fixed z-[60] min-w-44 rounded border border-felt-700 bg-felt-800 py-1 text-sm shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="truncate px-3 py-1 text-xs text-chalk-dim">{title}</div>}
      {items.map((it, i) => {
        if ("separator" in it) return <div key={i} className="my-1 border-t border-ink/50" />;
        if ("custom" in it)
          return (
            <div key={i} className="px-3 py-1">
              {it.custom}
            </div>
          );
        if ("children" in it)
          return (
            <div
              key={i}
              className="relative flex cursor-default items-center justify-between px-3 py-1 hover:bg-felt-700"
              onMouseEnter={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSub({ idx: i, x: r.right, y: r.top - 4 });
              }}
            >
              <span>{it.label}</span>
              <span className="text-chalk-dim">›</span>
              {sub?.idx === i && <MenuPanel x={sub.x} y={sub.y} items={it.children} onDone={onDone} />}
            </div>
          );
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              it.onSelect();
              onDone();
            }}
            className="flex w-full items-center justify-between px-3 py-1 text-left hover:bg-felt-700 disabled:opacity-40"
          >
            <span>{it.label}</span>
            {it.hint && <span className="ml-4 text-xs text-chalk-dim">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

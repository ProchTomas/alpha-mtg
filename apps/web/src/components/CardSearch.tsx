import { useEffect, useRef, useState } from "react";
import type { CardSummary } from "@playtest/shared";
import { api } from "@/lib/api";

type Props = {
  onPick?: (card: CardSummary) => void;
  onResults?: (cards: CardSummary[]) => void;
  autoFocus?: boolean;
  placeholder?: string;
};

/** Debounced autocomplete against /api/cards/search. Aborts stale requests. */
export function CardSearch({ onPick, onResults, autoFocus, placeholder = "Search cards…" }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CardSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      onResults?.([]);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    const t = setTimeout(() => {
      api
        .searchCards(q, 20, ac.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          onResults?.(r);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pick = (c: CardSummary) => {
    onPick?.(c);
    setOpen(false);
    // In add-mode, clear so the next card can be typed straight away.
    setQ("");
    setResults([]);
  };

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const c = results[active];
            if (c) pick(c);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border border-felt-700 bg-felt-800 px-3 py-2 text-chalk placeholder:text-chalk-dim/70"
      />
      {onPick && open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded border border-felt-700 bg-felt-800 shadow-lg">
          {results.map((c, i) => (
            <li
              key={c.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${
                i === active ? "bg-felt-700" : ""
              }`}
            >
              <span>{c.name}</span>
              <span className="text-xs text-chalk-dim">
                {c.manaCost ?? ""} · {c.setCode.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

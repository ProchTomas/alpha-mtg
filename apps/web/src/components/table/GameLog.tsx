import { Fragment, useEffect, useRef, useState } from "react";
import type { GameState } from "@playtest/shared";
import { useGame } from "@/lib/game";
import { usePreview } from "@/components/CardPreview";

const TOKEN = /\[\[(card|player|token|n):([^\]]*)\]\]/g;

/** Renders one log line, resolving [[card:id]] etc. against the loaded card data. */
export function LogText({ text, state }: { text: string; state: GameState }) {
  const cardData = useGame((s) => s.cardData);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    parts.push(text.slice(last, m.index));
    const [, kind, val] = m as unknown as [string, string, string];
    if (kind === "card") {
      const c = cardData[val];
      parts.push(
        <span
          key={m.index}
          className="text-chalk"
          onMouseEnter={() => c && usePreview.getState().show(c)}
          onMouseLeave={() => usePreview.getState().hide()}
        >
          {c?.name ?? "a card"}
        </span>,
      );
    } else if (kind === "player") {
      parts.push(
        <span key={m.index} className="text-chalk">
          {state.players[val]?.displayName ?? val}
        </span>,
      );
    } else if (kind === "token") {
      parts.push(
        <span key={m.index} className="text-chalk">
          {val}
        </span>,
      );
    } else {
      parts.push(
        <span key={m.index} className="tabular text-chalk">
          {val}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

export function GameLog({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardData = useGame((s) => s.cardData);
  const [filter, setFilter] = useState("");
  const [who, setWho] = useState<string>("");
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length, filter, who]);

  // Filter on the rendered words, so "bolt" finds "[[card:…]]" lines by card name.
  const q = filter.trim().toLowerCase();
  const plain = (text: string) =>
    text.replace(TOKEN, (_, kind: string, val: string) =>
      kind === "card" ? (cardData[val]?.name ?? "") : kind === "player" ? (state.players[val]?.displayName ?? val) : val,
    );
  const entries = state.log.filter((e) => (!who || e.actorId === who) && (!q || plain(e.text).toLowerCase().includes(q)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-ink/40 p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter log…"
          className="min-w-0 flex-1 rounded border border-felt-700 bg-felt-900 px-2 py-1 text-xs"
        />
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded border border-felt-700 bg-felt-900 px-1 text-xs text-chalk-dim">
          <option value="">everyone</option>
          {state.seatOrder.map((id) => (
            <option key={id} value={id}>
              {state.players[id]?.displayName}
            </option>
          ))}
        </select>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-chalk-dim">
        {entries.length === 0 && <p>{state.log.length === 0 ? "Nothing has happened yet." : "Nothing matches."}</p>}
        {entries.map((e) => (
          <p key={e.seq}>
            <span className="text-chalk">{state.players[e.actorId]?.displayName ?? e.actorId}</span> <LogText text={e.text} state={state} />
          </p>
        ))}
      </div>
    </div>
  );
}

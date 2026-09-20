import { Fragment, useEffect, useRef } from "react";
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
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);
  return (
    <div ref={ref} className="h-full overflow-y-auto px-3 py-2 text-xs leading-relaxed text-chalk-dim">
      {state.log.length === 0 && <p>Nothing has happened yet.</p>}
      {state.log.map((e) => (
        <p key={e.seq}>
          <span className="text-chalk">{state.players[e.actorId]?.displayName ?? e.actorId}</span> <LogText text={e.text} state={state} />
        </p>
      ))}
    </div>
  );
}

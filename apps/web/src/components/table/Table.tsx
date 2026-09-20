import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useState } from "react";
import type { GameState, Zone } from "@playtest/shared";
import { peekLibrary, useGame } from "@/lib/game";
import { Battlefield, BF_CARD_WIDTH } from "./Battlefield";
import { ContextMenuLayer, useMenu } from "./ContextMenu";
import { ScryDialog, SearchDialog, TokenDialog } from "./Dialogs";
import type { DragData } from "./DraggableCard";
import { GameLog } from "./GameLog";
import { Hand, OpponentHand } from "./Hand";
import { PlayerPanel } from "./PlayerPanel";
import { TableCard } from "./TableCard";
import { ZonePiles } from "./ZonePiles";
import { CardPreviewLayer } from "@/components/CardPreview";

type Props = { state: GameState; onLeave: () => void; title?: string };

/**
 * The table. Opponents stacked on top (their positions mirrored), a 1px ink line, then your
 * battlefield, your hand and the zone strip. Keyboard: D draw, U untap all, S shuffle,
 * Space pass turn, T token, L log, Esc close.
 */
export function Table({ state, onLeave, title }: Props) {
  const me = useGame((s) => s.me);
  const dispatch = useGame((s) => s.dispatch);
  const privateView = useGame((s) => s.privateView);
  const closePrivate = useGame((s) => s.closePrivate);
  const [showLog, setShowLog] = useState(true);
  const [scry, setScry] = useState<Array<{ iid: string; cardId: string }> | null>(null);
  const [tokenDialog, setTokenDialog] = useState(false);
  const [dragging, setDragging] = useState<DragData | null>(null);

  const mine = state.players[me];
  const others = state.seatOrder.filter((id) => id !== me).map((id) => state.players[id]!);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const data = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as { zone: Zone; ownerId: string } | undefined;
    if (!data || !over) return;
    const rect = e.active.rect.current.translated;
    if (over.zone === "battlefield") {
      const bfEl = document.querySelector<HTMLElement>(`[data-battlefield="${over.ownerId}"]`);
      if (!bfEl || !rect) return;
      const b = bfEl.getBoundingClientRect();
      const h = (BF_CARD_WIDTH * 7) / 5;
      const x = clamp((rect.left - b.left) / Math.max(1, b.width - BF_CARD_WIDTH));
      const yRaw = clamp((rect.top - b.top) / Math.max(1, b.height - h));
      const y = over.ownerId === me ? yRaw : 1 - yRaw;
      if (data.zone === "battlefield") {
        // Dropping onto another card attaches; otherwise just reposition (or take control).
        const target = cardUnderPoint(bfEl, rect.left + BF_CARD_WIDTH / 2, rect.top + h / 2, data.card.iid);
        if (target) {
          dispatch({ type: "ATTACH", iid: data.card.iid, targetIid: target });
          return;
        }
        if (over.ownerId !== data.card.controllerId) {
          dispatch({ type: "MOVE_CARD", iid: data.card.iid, from: "battlefield", to: "battlefield", position: "bottom" });
        }
        dispatch({ type: "MOVE_ON_BATTLEFIELD", iid: data.card.iid, x, y });
      } else {
        dispatch({ type: "MOVE_CARD", iid: data.card.iid, from: data.zone, to: "battlefield", position: "bottom" });
        dispatch({ type: "MOVE_ON_BATTLEFIELD", iid: data.card.iid, x, y });
      }
      return;
    }
    if (over.zone === data.zone && over.ownerId === data.ownerId) return;
    dispatch({ type: "MOVE_CARD", iid: data.card.iid, from: data.zone, to: over.zone, position: over.zone === "library" ? "top" : over.zone === "hand" ? "bottom" : "top" });
  };

  const openSearch = useCallback(() => dispatch({ type: "SEARCH_START" }), [dispatch]);
  const openScry = useCallback((n: number) => setScry(peekLibrary(n)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "d":
        case "D":
          dispatch({ type: "DRAW", count: 1 });
          break;
        case "u":
        case "U":
          dispatch({ type: "UNTAP_ALL" });
          break;
        case "s":
        case "S":
          dispatch({ type: "SHUFFLE" });
          break;
        case " ":
          e.preventDefault();
          dispatch({ type: "PASS_TURN" });
          break;
        case "t":
        case "T":
          setTokenDialog(true);
          break;
        case "l":
        case "L":
          setShowLog((v) => !v);
          break;
        case "Escape":
          useMenu.getState().close();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  if (!mine) return <p className="p-6 text-chalk-dim">You're not seated at this table.</p>;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-dvh flex-col overflow-hidden bg-felt-900 text-chalk">
        {/* top bar */}
        <div className="flex items-center gap-4 border-b border-ink/60 bg-felt-800 px-3 py-1.5 text-sm">
          <span className="font-display">{title ?? "Table"}</span>
          <span className="tabular text-chalk-dim">
            Turn {state.turnNumber} · {state.players[state.turnPlayer ?? ""]?.displayName ?? "—"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ToolButton onClick={() => setTokenDialog(true)} hint="T">
              Token
            </ToolButton>
            <ToolButton onClick={() => dispatch({ type: "ROLL", sides: 6, count: 1 })}>d6</ToolButton>
            <ToolButton onClick={() => dispatch({ type: "ROLL", sides: 20, count: 1 })}>d20</ToolButton>
            <ToolButton onClick={() => dispatch({ type: "ROLL", sides: 2, count: 1 })}>Coin</ToolButton>
            <ToolButton onClick={() => setShowLog((v) => !v)} hint="L">
              Log
            </ToolButton>
            <ToolButton onClick={onLeave}>Leave</ToolButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* play area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* opponents */}
            <div className={`flex min-h-0 ${others.length ? "flex-1" : "h-24"} flex-col overflow-y-auto`}>
              {others.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-sm text-chalk-dim">Solo practice — no one across the table.</div>
              )}
              {others.map((p) => (
                <div key={p.id} className="flex min-h-[240px] flex-1 flex-col border-b border-ink/30">
                  <div className="flex items-center gap-4 px-3 py-1">
                    <PlayerPanel player={p} isTurn={state.turnPlayer === p.id} compact />
                    <OpponentHand player={p} />
                    <div className="ml-auto">
                      <ZonePiles player={p} mine={false} onSearch={() => {}} onScry={() => {}} />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 px-3">
                    <Battlefield player={p} mine={false} mirrored />
                  </div>
                </div>
              ))}
            </div>

            {/* table line */}
            <div className="h-px bg-ink shadow-[0_-6px_12px_rgba(18,16,13,0.5)]" />

            {/* mine */}
            <div className="flex min-h-0 flex-[1.4] flex-col">
              <div className="min-h-0 flex-1 px-3 py-2">
                <Battlefield player={mine} mine mirrored={false} />
              </div>
              <Hand player={mine} />
              <div className="relative z-10 flex items-end gap-4 border-t border-ink/40 bg-felt-800 px-3 py-2">
                <ZonePiles player={mine} mine onSearch={openSearch} onScry={openScry} />
                <div className="ml-auto flex items-end gap-3">
                  <PlayerPanel player={mine} isTurn={state.turnPlayer === me} />
                  <button
                    onClick={() => dispatch({ type: "PASS_TURN" })}
                    className={`rounded px-4 py-2 text-sm font-medium ${state.turnPlayer === me ? "bg-brass text-ink hover:brightness-110" : "bg-felt-700 text-chalk"}`}
                    title="Space"
                  >
                    Pass turn
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* log */}
          {showLog && (
            <div className="w-64 shrink-0 border-l border-ink/60 bg-felt-800/60">
              <GameLog state={state} />
            </div>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <TableCard card={{ ...dragging.card, tapped: false }} data={useGame.getState().cardData[dragging.card.cardId]} width={BF_CARD_WIDTH} dragging />}
      </DragOverlay>

      <ContextMenuLayer />
      <CardPreviewLayer className={showLog ? "top-12 right-[17rem]" : "top-12 right-4"} />
      {privateView?.kind === "search" && <SearchDialog cards={privateView.cards} onClose={closePrivate} />}
      {scry && <ScryDialog cards={scry} onClose={() => setScry(null)} />}
      {tokenDialog && <TokenDialog onClose={() => setTokenDialog(false)} />}
    </DndContext>
  );
}

function ToolButton({ children, onClick, hint }: { children: React.ReactNode; onClick: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="rounded bg-felt-700 px-2.5 py-1 text-xs hover:bg-felt-700/70" title={hint ? `Shortcut: ${hint}` : undefined}>
      {children}
    </button>
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
}

/** Which battlefield card (other than `self`) is under the drop point, if any. */
function cardUnderPoint(bf: HTMLElement, x: number, y: number, self: string): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!bf.contains(el)) continue;
    const card = (el as HTMLElement).closest<HTMLElement>("[data-iid]");
    if (card && card.dataset.iid !== self) return card.dataset.iid ?? null;
  }
  return null;
}

import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import type { CardInstance, PlayerState, Zone } from "@alphamtg/shared";
import { useGame, ZONE_LABEL } from "@/lib/game";
import { useMenu } from "./ContextMenu";
import { DraggableCard } from "./DraggableCard";
import { libraryMenu } from "./menus";
import { CardBack, TableCard } from "./TableCard";

const PILE_W = 56;
const PILE_ZONES: Zone[] = ["library", "graveyard", "exile", "command", "aside"];

type Props = {
  player: PlayerState;
  mine: boolean;
  onSearch: () => void;
  onScry: (n: number) => void;
};

/** Library / graveyard / exile / command / aside as stacked piles with a count. Click opens. */
export function ZonePiles({ player, mine, onSearch, onScry }: Props) {
  const [open, setOpen] = useState<Zone | null>(null);
  return (
    <div className="flex items-end gap-2">
      {PILE_ZONES.map((zone) => (
        <Pile key={zone} player={player} zone={zone} mine={mine} onOpen={() => setOpen(zone)} onSearch={onSearch} onScry={onScry} />
      ))}
      {open && <ZoneOverlay player={player} zone={open} mine={mine} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Pile({ player, zone, mine, onOpen, onSearch, onScry }: { player: PlayerState; zone: Zone; mine: boolean; onOpen: () => void; onSearch: () => void; onScry: (n: number) => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const cardData = useGame((s) => s.cardData);
  const { setNodeRef, isOver } = useDroppable({ id: `${zone}:${player.id}`, data: { zone, ownerId: player.id } });
  const cards = player.zones[zone];
  const n = cards.length;
  const top = zone === "library" ? undefined : cards[0];
  const w = PILE_W;
  const h = (w * 7) / 5;
  const empty = n === 0 && zone !== "library";
  if (empty && (zone === "aside" || zone === "command") && !isOver) return null;

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!mine) return;
    if (zone === "library") useMenu.getState().show(e.clientX, e.clientY, libraryMenu(n, dispatch, { onSearch, onScry }), "Library");
    else onOpen();
  };

  return (
    <button
      ref={setNodeRef}
      onClick={() => (zone === "library" ? mine && dispatch({ type: "DRAW", count: 1 }) : onOpen())}
      onContextMenu={onContext}
      title={zone === "library" ? `${ZONE_LABEL[zone]} — click to draw, right-click for more` : `${ZONE_LABEL[zone]} — click to open`}
      className={`group relative rounded ${isOver ? "ring-2 ring-brass" : ""}`}
      style={{ width: w, height: h + 18 }}
    >
      <div className="relative" style={{ width: w, height: h }}>
        {n === 0 ? (
          <div className="card-img h-full w-full border border-dashed border-felt-700 bg-transparent" />
        ) : zone === "library" || (top && !top.cardId) ? (
          <>
            {n > 2 && <CardBack className="absolute top-1 left-1 h-full w-full opacity-60" />}
            {n > 1 && <CardBack className="absolute top-0.5 left-0.5 h-full w-full opacity-80" />}
            <CardBack className="absolute top-0 left-0 h-full w-full" />
          </>
        ) : (
          <TableCard card={{ ...top!, tapped: false }} data={cardData[top!.cardId]} width={w} className="pointer-events-none" />
        )}
        {n > 0 && (
          <span className="tabular absolute -top-2 -right-2 rounded-full bg-ink px-1.5 text-xs font-medium text-chalk ring-1 ring-felt-700">
            {n}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-chalk-dim">{ZONE_LABEL[zone]}</div>
    </button>
  );
}

/** An opened pile: all its cards in a grid, draggable, double-click to battlefield. */
function ZoneOverlay({ player, zone, mine, onClose }: { player: PlayerState; zone: Zone; mine: boolean; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const cards: CardInstance[] = player.zones[zone];
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto border-t border-ink bg-felt-800/95 p-4 shadow-2xl" data-menu data-no-flip>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-lg">
          {player.displayName}'s {ZONE_LABEL[zone].toLowerCase()} <span className="tabular text-chalk-dim">{cards.length}</span>
        </h3>
        <button onClick={onClose} className="ml-auto rounded bg-felt-700 px-3 py-1 text-sm hover:bg-felt-700/70">
          Close
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-chalk-dim">Empty.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {cards.map((c) => (
            <DraggableCard
              key={c.iid}
              card={c}
              zone={zone}
              ownerId={player.id}
              width={100}
              inert={!mine && !c.cardId}
              onDoubleClick={() => mine && dispatch({ type: "MOVE_CARD", iid: c.iid, from: zone, to: "battlefield", position: "bottom" })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

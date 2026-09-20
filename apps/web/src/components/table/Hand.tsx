import { useDroppable } from "@dnd-kit/core";
import type { PlayerState } from "@alphamtg/shared";
import { useGame } from "@/lib/game";
import { DraggableCard } from "./DraggableCard";
import { CardBack } from "./TableCard";

const HAND_CARD_WIDTH = 110;

/** Your hand: a row that overlaps when wide, lifts a card on hover. */
export function Hand({ player }: { player: PlayerState }) {
  const dispatch = useGame((s) => s.dispatch);
  const { setNodeRef, isOver } = useDroppable({ id: `hand:${player.id}`, data: { zone: "hand", ownerId: player.id } });
  const cards = player.zones.hand;
  const w = HAND_CARD_WIDTH;
  const h = (w * 7) / 5;

  return (
    <div
      ref={setNodeRef}
      className={`relative flex items-end justify-center px-4 ${isOver ? "bg-felt-800/40" : ""}`}
      style={{ height: h * 0.62 }}
    >
      <div className="flex" style={{ height: h * 0.62 }}>
        {cards.map((c, i) => (
          <div
            key={c.iid}
            className="group relative transition-transform duration-100 hover:-translate-y-8 hover:z-50"
            style={{ width: Math.min(w, 700 / Math.max(cards.length, 1)) + 4, zIndex: i }}
          >
            <DraggableCard
              card={c}
              zone="hand"
              ownerId={player.id}
              width={w}
              style={{ position: "absolute", left: 0, top: 0 }}
              onDoubleClick={() => dispatch({ type: "MOVE_CARD", iid: c.iid, from: "hand", to: "battlefield", position: "bottom" })}
            />
          </div>
        ))}
        {cards.length === 0 && <p className="self-center text-sm text-chalk-dim">No cards in hand</p>}
      </div>
    </div>
  );
}

/** Another player's hand: just card backs, same count. */
export function OpponentHand({ player }: { player: PlayerState }) {
  const n = player.zones.hand.length;
  return (
    <div className="flex items-center gap-3 text-xs text-chalk-dim">
      <div className="flex">
        {Array.from({ length: Math.min(n, 12) }, (_, i) => (
          <div key={i} style={{ width: 40, marginLeft: i ? -26 : 0 }}>
            <CardBack />
          </div>
        ))}
      </div>
      <span className="tabular">{n} in hand</span>
    </div>
  );
}

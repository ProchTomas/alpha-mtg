import { useDroppable } from "@dnd-kit/core";
import type { PlayerState } from "@alphamtg/shared";
import { useGame } from "@/lib/game";
import { DraggableCard } from "./DraggableCard";

export const BF_CARD_WIDTH = 96;

/**
 * A player's half of the table. Cards are absolutely positioned from their (x, y) in 0..1.
 * `mirrored` flips the y axis for opponents so "closest to the table line" is consistent.
 */
export function Battlefield({ player, mine, mirrored }: { player: PlayerState; mine: boolean; mirrored: boolean }) {
  const dispatch = useGame((s) => s.dispatch);
  const { setNodeRef, isOver } = useDroppable({ id: `battlefield:${player.id}`, data: { zone: "battlefield", ownerId: player.id } });
  const cards = player.zones.battlefield;
  const w = BF_CARD_WIDTH;
  const h = (w * 7) / 5;

  // Attached cards sit slightly behind and offset from their host so the pair reads as one.
  const byIid = new Map(cards.map((c) => [c.iid, c]));

  return (
    <div
      ref={setNodeRef}
      data-battlefield={player.id}
      className={`relative h-full w-full ${isOver && mine ? "bg-felt-800/40" : ""}`}
      style={{ minHeight: h + 24 }}
    >
      {cards.map((c, i) => {
        const host = c.attachedTo ? byIid.get(c.attachedTo) : undefined;
        const x = host ? (host.x ?? 0.5) : (c.x ?? 0.5);
        const y = host ? (host.y ?? 0.5) : (c.y ?? 0.5);
        const yy = mirrored ? 1 - y : y;
        return (
          <DraggableCard
            key={c.iid}
            card={c}
            zone="battlefield"
            ownerId={player.id}
            width={w}
            inert={!c.cardId && !c.token && c.controllerId !== useGame.getState().me}
            style={{
              position: "absolute",
              left: `calc(${x} * (100% - ${w}px)${host ? ` + ${w * 0.25}px` : ""})`,
              top: `calc(${yy} * (100% - ${h}px)${host ? ` - ${h * 0.12}px` : ""})`,
              zIndex: host ? i : i + 100,
            }}
            onDoubleClick={() => dispatch({ type: "TAP", iids: [c.iid], tapped: !c.tapped })}
          />
        );
      })}
    </div>
  );
}

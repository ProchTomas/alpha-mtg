import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties, MouseEvent } from "react";
import type { CardInstance, Zone } from "@playster/shared";
import { useGame } from "@/lib/game";
import { useMenu } from "./ContextMenu";
import { cardMenu } from "./menus";
import { TableCard } from "./TableCard";

export type DragData = { card: CardInstance; zone: Zone; ownerId: string };

type Props = {
  card: CardInstance;
  zone: Zone;
  ownerId: string;
  width: number;
  style?: CSSProperties;
  className?: string;
  /** Double-click behaviour depends on the zone. */
  onDoubleClick?: (e: MouseEvent) => void;
  /** Cards you can't act on (other players' hidden cards) are not draggable. */
  inert?: boolean;
};

/** A TableCard wired for dragging (dnd-kit), right-click menus and double-click. */
export function DraggableCard({ card, zone, ownerId, width, style, className, onDoubleClick, inert = false }: Props) {
  const data = useGame((s) => s.cardData[card.cardId]);
  const dispatch = useGame((s) => s.dispatch);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.iid,
    data: { card, zone, ownerId } satisfies DragData,
    disabled: inert,
  });

  return (
    <TableCard
      ref={setNodeRef}
      card={card}
      data={data}
      width={width}
      hidden={!card.cardId && !card.token}
      dragging={isDragging}
      style={{ ...style, opacity: isDragging ? 0.3 : 1, cursor: inert ? "default" : "grab", touchAction: "none" }}
      className={className}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (inert) return;
        useMenu.getState().show(e.clientX, e.clientY, cardMenu(card, zone, data, dispatch), data?.name ?? card.token?.name);
      }}
      {...listeners}
      {...attributes}
      {...{ "data-iid": card.iid }}
      tabIndex={-1}
    />
  );
}

import { useState } from "react";
import type { CardSummary } from "@playtest/shared";
import { hasBackFace } from "@playtest/shared";
import { cardImageUrl } from "@/lib/api";

type Props = {
  card: Pick<CardSummary, "id" | "name" | "layout">;
  size?: "small" | "normal" | "large";
  face?: "front" | "back";
  className?: string;
};

/** A card picture at the correct 5:7 ratio. Falls back to the name while loading / on error. */
export function CardImage({ card, size = "normal", face = "front", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const showBack = face === "back" && hasBackFace(card);
  if (failed) {
    return (
      <div className={`card-img flex items-center justify-center p-2 text-center text-xs text-chalk-dim ${className}`}>
        {card.name}
      </div>
    );
  }
  return (
    <img
      src={cardImageUrl(card.id, size, showBack ? "back" : "front")}
      alt={card.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={`card-img ${className}`}
    />
  );
}

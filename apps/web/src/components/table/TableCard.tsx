import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import type { CardInstance, CardSummary } from "@playster/shared";
import { hasBackFace } from "@playster/shared";
import { cardImageUrl } from "@/lib/api";
import { usePreview } from "@/components/CardPreview";

type Props = HTMLAttributes<HTMLDivElement> & {
  card: CardInstance;
  data: CardSummary | undefined;
  width: number;
  /** Show the back (hidden / face-down) regardless of data. */
  hidden?: boolean;
  dragging?: boolean;
  selected?: boolean;
};

/**
 * One card on the table. Tapped = rotated 90°, face-down = card back, tokens without a
 * printing render as a text card. Counters and notes are overlaid. Hover drives the preview.
 */
export const TableCard = forwardRef<HTMLDivElement, Props>(function TableCard(
  { card, data, width, hidden = false, dragging = false, selected = false, style, className = "", ...rest },
  ref,
) {
  const height = (width * 7) / 5;
  const showBack = hidden || card.faceDown || (!card.cardId && !card.token);
  const face = card.flipped && data && hasBackFace(data) ? "back" : "front";
  const counters = Object.entries(card.counters);
  const preview = usePreview;

  const outer: CSSProperties = {
    width,
    height,
    transform: `${card.tapped ? "rotate(90deg)" : ""}${dragging ? " scale(1.04)" : ""}`,
    transition: "transform 120ms ease-out",
    ...style,
  };

  return (
    <div
      ref={ref}
      {...rest}
      className={`relative select-none ${className}`}
      style={outer}
      onMouseEnter={(e) => {
        rest.onMouseEnter?.(e);
        if (!showBack && data) preview.getState().show(data, face);
        else if (card.token) preview.getState().hide();
      }}
      onMouseLeave={(e) => {
        rest.onMouseLeave?.(e);
        preview.getState().hide();
      }}
    >
      {showBack ? (
        <CardBack className="h-full w-full" />
      ) : card.token && !card.cardId ? (
        <TokenFace card={card} />
      ) : (
        <img
          src={cardImageUrl(card.cardId, "normal", face)}
          alt={data?.name ?? ""}
          draggable={false}
          className={`card-img h-full w-full ${dragging ? "shadow-2xl" : ""}`}
        />
      )}
      {selected && <div className="pointer-events-none absolute inset-0 rounded-[4.75%] ring-2 ring-brass" />}
      {counters.length > 0 && (
        <div className="pointer-events-none absolute top-1 left-1 flex flex-wrap gap-0.5">
          {counters.map(([name, n]) => (
            <span key={name} className="tabular rounded bg-ink/90 px-1 text-[11px] font-medium text-chalk">
              {n} {name.length <= 4 ? name : name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {card.note && (
        <div className="pointer-events-none absolute right-1 bottom-1 left-1 truncate rounded bg-ink/90 px-1 text-[10px] text-chalk">
          {card.note}
        </div>
      )}
    </div>
  );
});

export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`card-img flex items-center justify-center bg-[#5a3f2a] ${className}`} style={{ backgroundImage: "radial-gradient(ellipse at center, #7a5638 0%, #4a3220 70%)" }}>
      <div className="h-[70%] w-[70%] rounded-[6%] border border-[#c8a56b]/40" />
    </div>
  );
}

function TokenFace({ card }: { card: CardInstance }) {
  const t = card.token!;
  return (
    <div className="card-img flex h-full w-full flex-col justify-between border border-chalk-dim/40 bg-felt-700 p-1.5 text-chalk">
      <div className="text-[11px] leading-tight font-medium">{t.name}</div>
      <div className="text-[9px] leading-tight text-chalk-dim">{t.typeLine}</div>
      {t.power !== undefined && (
        <div className="tabular self-end rounded bg-ink/70 px-1 text-[11px]">
          {t.power}/{t.toughness}
        </div>
      )}
    </div>
  );
}

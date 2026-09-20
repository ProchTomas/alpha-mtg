import { Link } from "react-router-dom";
import type { DeckSummary } from "@/lib/decks";
import { cardImageUrl } from "@/lib/api";

/** Deck tile for lists: cover art crop, name, format, size and color identity. */
export function DeckTile({ deck, showOwner = false }: { deck: DeckSummary; showOwner?: boolean }) {
  return (
    <Link to={`/decks/${deck.id}`} className="group block overflow-hidden rounded-lg bg-felt-800 hover:bg-felt-700">
      <div className="aspect-[4/3] bg-felt-700">
        {deck.coverCardId && (
          <img
            src={cardImageUrl(deck.coverCardId, "art_crop")}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-display truncate text-lg">{deck.name}</span>
          {deck.visibility !== "public" && (
            <span className="rounded bg-felt-900/60 px-1.5 text-[10px] uppercase tracking-wide text-chalk-dim">{deck.visibility}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-chalk-dim">
          <span className="capitalize">{deck.format}</span>
          <span>·</span>
          <span className="tabular">{deck.cardCount} cards</span>
          <span className="ml-auto flex gap-0.5">
            {deck.colorIdentity.map((c) => (
              <span key={c} className={`pip pip-${c}`} title={c} />
            ))}
          </span>
        </div>
        {showOwner && <div className="mt-0.5 text-xs text-chalk-dim">by {deck.ownerDisplayName}</div>}
      </div>
    </Link>
  );
}

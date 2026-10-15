import { useCallback, useEffect, useState } from "react";
import type { Board } from "@alphamtg/shared";
import { ApiError } from "@/lib/api";
import { deckApi, type DeckAdvice, type DeckDetail } from "@/lib/decks";
import { CardImage } from "@/components/CardImage";
import { previewProps } from "@/components/CardPreview";
import { Button, ErrorText } from "@/components/ui";

/**
 * Suggestions for the deck you're building: a couple of cards for whatever the deck is short of,
 * then cards that match what the deck is actually about. Reroll pages deeper into both lists.
 */
export function Recommender({ deck, onAdd }: { deck: DeckDetail; onAdd: (cardId: string, board: Board) => Promise<void> }) {
  const [advice, setAdvice] = useState<DeckAdvice | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (page: number) => {
      setBusy(true);
      setError(null);
      try {
        setAdvice(await deckApi.advice(deck.id, page));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't work out any suggestions.");
      } finally {
        setBusy(false);
      }
    },
    [deck.id],
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  const cards = advice?.recommendations ?? [];

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl">Suggestions</h2>
        <Button
          variant="ghost"
          className="ml-auto py-1"
          disabled={busy}
          onClick={() => setOffset((o) => o + 1)}
          title="Show a different five"
        >
          {busy ? "Thinking…" : "Reroll"}
        </Button>
      </div>

      {advice && advice.themes.length > 0 && (
        <p className="mt-1 text-xs text-chalk-dim">
          Reading your deck as:{" "}
          {advice.themes.slice(0, 4).map((t, i) => (
            <span key={t.term}>
              {i > 0 && " · "}
              <span className="text-chalk">{t.label}</span>
            </span>
          ))}
        </p>
      )}

      <ErrorText>{error}</ErrorText>

      {!busy && cards.length === 0 && !error && (
        <p className="mt-3 text-sm text-chalk-dim">
          Not enough cards yet to tell what this deck wants. Add a dozen or so and try again.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {cards.map((r) => (
          <li key={r.card.id} className="flex gap-3">
            <div className="w-[72px] shrink-0" {...previewProps(r.card)}>
              <CardImage card={r.card} size="small" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium leading-tight">{r.card.name}</span>
                <span className="tabular ml-auto shrink-0 text-xs text-chalk-dim">{r.card.manaCost ?? ""}</span>
              </div>
              <p className="mt-0.5 text-xs text-chalk-dim">{r.reason}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  className="px-2 py-0.5 text-xs"
                  disabled={added.has(r.card.id)}
                  onClick={async () => {
                    setAdded(new Set([...added, r.card.id]));
                    await onAdd(r.card.id, "main");
                  }}
                >
                  {added.has(r.card.id) ? "Added" : "Add"}
                </Button>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    r.kind === "synergy" ? "bg-brass/20 text-brass" : "bg-felt-700 text-chalk-dim"
                  }`}
                >
                  {r.kind === "synergy" ? "synergy" : "gap"}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

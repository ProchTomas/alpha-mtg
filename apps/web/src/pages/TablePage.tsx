import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { deckApi, type DeckSummary } from "@/lib/decks";
import { loadDeckForTable, useGame } from "@/lib/game";
import { Table } from "@/components/table/Table";
import { PageTitle, Panel } from "@/components/ui";
import { DeckTile } from "@/components/DeckCard";

/** /table/solo — pick a deck to practice with. */
export function SoloPickPage() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  useEffect(() => {
    void deckApi.list().then(setDecks);
  }, []);
  return (
    <div>
      <PageTitle>Solo practice</PageTitle>
      <p className="mt-2 text-sm text-chalk-dim">Goldfish a deck: every zone and action, nobody across the table.</p>
      {decks === null ? (
        <p className="mt-6 text-chalk-dim">Loading…</p>
      ) : decks.length === 0 ? (
        <Panel className="mt-6 max-w-md">
          <p className="text-chalk-dim">You need a deck first.</p>
          <Link to="/decks/new" className="mt-2 inline-block text-chalk underline">
            Create one
          </Link>
        </Panel>
      ) : (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {decks.map((d) => (
            <DeckTile key={d.id} deck={d} to={`/table/solo/${d.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** /table/solo/:deckId — the table, running the reducer locally. */
export function SoloTablePage() {
  const { deckId = "" } = useParams();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const state = useGame((s) => s.state);
  const startLocal = useGame((s) => s.startLocal);
  const leave = useGame((s) => s.leave);
  const [error, setError] = useState<string | null>(null);
  const [deckName, setDeckName] = useState("");

  useEffect(() => {
    if (!user) return;
    loadDeckForTable(deckId)
      .then((deck) => {
        setDeckName(deck.name);
        startLocal(deck, user.id, user.displayName);
      })
      .catch(() => setError("Couldn't load that deck."));
    return () => leave();
  }, [deckId, user, startLocal, leave]);

  if (error) return <p className="p-6 text-chalk-dim">{error}</p>;
  if (!state) return <p className="p-6 text-chalk-dim">Shuffling up…</p>;
  return <Table state={state} title={deckName} onLeave={() => nav("/table/solo")} />;
}

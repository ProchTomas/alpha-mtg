import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { deckApi, type DeckSummary } from "@/lib/decks";
import { DeckTile } from "@/components/DeckCard";

export function LandingPage() {
  const user = useAuth((s) => s.user);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  useEffect(() => {
    deckApi.listPublic().then(setDecks).catch(() => {});
  }, []);
  return (
    <div className="py-10">
      <h1 className="font-display text-5xl font-medium tracking-tight">Shuffle up.</h1>
      <p className="mt-4 max-w-xl text-chalk-dim">
        Build decks, then sit down at a table with friends. No rules engine — the server moves cards and keeps hidden
        information hidden, you do the rest by talking.
      </p>
      <div className="mt-8 flex gap-3">
        <Link to={user ? "/decks/new" : "/register"} className="rounded bg-brass px-4 py-2 font-medium text-ink hover:brightness-110">
          {user ? "New deck" : "Get started"}
        </Link>
        <Link to="/cards" className="rounded bg-felt-800 px-4 py-2 font-medium text-chalk hover:bg-felt-700">
          Search cards
        </Link>
      </div>
      {decks.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl">Latest decks</h2>
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {decks.map((d) => (
              <DeckTile key={d.id} deck={d} showOwner />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

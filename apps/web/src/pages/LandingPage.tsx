import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LobbyInfo } from "@alphamtg/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deckApi, type DeckSummary } from "@/lib/decks";
import { DeckTile } from "@/components/DeckCard";
import { Button, ErrorText, Input } from "@/components/ui";

export function LandingPage() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deckApi.listPublic().then(setDecks).catch(() => {});
  }, []);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) nav(`/table/${c}`);
  };

  const startTable = async () => {
    setBusy(true);
    setError(null);
    try {
      const { lobby } = await api.post<{ lobby: LobbyInfo }>("/games", {});
      nav(`/table/${lobby.joinCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="py-10">
      <h1 className="font-display text-5xl font-medium tracking-tight">Shuffle up.</h1>
      <p className="mt-4 max-w-xl text-chalk-dim">
        Build decks, then sit down at a table with friends. No rules engine — the server moves cards and keeps hidden
        information hidden, you do the rest by talking.
      </p>

      <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        <form onSubmit={join} className="rounded-lg bg-felt-800 p-4">
          <h2 className="font-display text-lg">Join a table</h2>
          <div className="mt-2 flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Join code"
              maxLength={6}
              className="font-mono tracking-[0.2em] uppercase"
            />
            <Button type="submit" disabled={code.trim().length < 4}>
              Join
            </Button>
          </div>
        </form>
        <div className="rounded-lg bg-felt-800 p-4">
          <h2 className="font-display text-lg">Start a table</h2>
          <p className="mt-1 text-sm text-chalk-dim">You get a code to share. 2–6 seats, spectators welcome.</p>
          <div className="mt-2">
            {user ? (
              <Button onClick={() => void startTable()} disabled={busy}>
                Start a table
              </Button>
            ) : (
              <Link to="/register" className="inline-block rounded bg-brass px-4 py-2 text-sm font-medium text-ink hover:brightness-110">
                Register to host
              </Link>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      </div>

      <div className="mt-6 flex gap-4 text-sm">
        <Link to="/table/solo" className="text-chalk-dim hover:text-chalk">
          Solo practice →
        </Link>
        <Link to="/cards" className="text-chalk-dim hover:text-chalk">
          Search cards →
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

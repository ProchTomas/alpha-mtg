import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LobbyInfo } from "@playtest/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deckApi, type DeckSummary } from "@/lib/decks";
import { useGame } from "@/lib/game";
import { Table } from "@/components/table/Table";
import { Button, ErrorText, PageTitle, Panel } from "@/components/ui";

/**
 * /table/:code — the lobby until the host starts, then the table. One socket for both.
 * Anyone can watch; only seated players (who joined while it was a lobby) can act.
 */
export function OnlineTablePage() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const { user, ready } = useAuth();
  const { lobby, state, connect, leave, connection, lastError } = useGame();

  useEffect(() => {
    if (!ready) return;
    connect(code, user?.id ?? null);
    return () => leave();
  }, [code, ready, user?.id, connect, leave]);

  if (!ready || (!lobby && connection !== "closed")) return <p className="p-6 text-chalk-dim">Connecting…</p>;
  if (!lobby) return <p className="p-6 text-chalk-dim">{lastError ?? "Couldn't reach that table."}</p>;

  if (lobby.status !== "lobby" && state) {
    return <Table state={state} title={`Table ${lobby.joinCode}`} onLeave={() => nav("/")} />;
  }
  return <Lobby lobby={lobby} userId={user?.id ?? null} />;
}

function Lobby({ lobby, userId }: { lobby: LobbyInfo; userId: string | null }) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const me = lobby.players.find((p) => p.userId === userId);
  const isHost = lobby.hostId === userId;
  const link = `${location.origin}/table/${lobby.joinCode}`;

  useEffect(() => {
    if (userId) deckApi.list().then(setDecks).catch(() => {});
  }, [userId]);

  const call = async (path: string, body: unknown = {}) => {
    setError(null);
    try {
      await api.post(`/games/${lobby.joinCode}${path}`, body);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  };

  const everyoneReady = lobby.players.length > 0 && lobby.players.every((p) => p.deckId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-baseline gap-4">
        <PageTitle>Table</PageTitle>
        <span className="font-display text-3xl tracking-[0.2em] text-brass">{lobby.joinCode}</span>
      </div>
      <p className="mt-2 text-sm text-chalk-dim">
        Share the code or the link:{" "}
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true));
          }}
          className="text-chalk underline"
        >
          {copied ? "copied!" : link}
        </button>
      </p>

      <Panel className="mt-6">
        <h2 className="font-display text-xl">Seats</h2>
        <ul className="mt-3 divide-y divide-ink/40">
          {lobby.players.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-brass" : "bg-felt-700"}`} title={p.connected ? "online" : "offline"} />
              <span className="tabular w-6 text-chalk-dim">{p.seat + 1}</span>
              <span>
                {p.displayName} <span className="text-chalk-dim">@{p.handle}</span>
                {p.userId === lobby.hostId && <span className="ml-2 rounded bg-felt-900/60 px-1.5 text-[10px] uppercase tracking-wide text-chalk-dim">host</span>}
              </span>
              <span className="ml-auto text-chalk-dim">
                {p.userId === userId ? (
                  <select
                    value={p.deckId ?? ""}
                    onChange={(e) => void call("/deck", { deckId: e.target.value || null })}
                    className="rounded border border-felt-700 bg-felt-800 px-2 py-1 text-chalk"
                  >
                    <option value="">Pick a deck…</option>
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.cardCount})
                      </option>
                    ))}
                  </select>
                ) : (
                  (p.deckName ?? "choosing a deck…")
                )}
              </span>
            </li>
          ))}
        </ul>
        {lobby.spectators > 0 && <p className="mt-2 text-xs text-chalk-dim">{lobby.spectators} watching</p>}
      </Panel>

      <ErrorText>{error}</ErrorText>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!userId ? (
          <p className="text-sm text-chalk-dim">
            <Link to="/login" className="text-chalk underline">
              Sign in
            </Link>{" "}
            to take a seat. You can watch without an account.
          </p>
        ) : !me ? (
          <Button onClick={() => void call("/join")} disabled={lobby.players.length >= 6}>
            Take a seat
          </Button>
        ) : (
          <>
            {isHost && (
              <Button onClick={() => void call("/start")} disabled={!everyoneReady}>
                Start game
              </Button>
            )}
            {!isHost && <span className="text-sm text-chalk-dim">Waiting for the host to start…</span>}
            <Button variant="ghost" onClick={() => void call("/leave")}>
              Leave seat
            </Button>
          </>
        )}
        {decks.length === 0 && me && (
          <span className="text-sm text-chalk-dim">
            No decks yet —{" "}
            <Link to="/decks/new" className="text-chalk underline">
              make one
            </Link>
            .
          </span>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/auth";
import { Button, ErrorText, Input, PageTitle, Panel } from "@/components/ui";

export type FriendsView = { friends: User[]; incoming: User[]; outgoing: User[] };

export const friendsApi = {
  list: () => api.get<FriendsView>("/friends"),
  request: (handle: string) => api.post<FriendsView>("/friends/request", { handle }),
  accept: (userId: string) => api.post<FriendsView>("/friends/accept", { userId }),
  remove: (userId: string) => api.post<FriendsView>("/friends/remove", { userId }),
};

export function FriendsPage() {
  const [view, setView] = useState<FriendsView | null>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    friendsApi.list().then(setView).catch(() => setView({ friends: [], incoming: [], outgoing: [] }));
  }, []);

  const run = async (fn: () => Promise<FriendsView>) => {
    setError(null);
    try {
      setView(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    void run(() => friendsApi.request(handle)).then(() => setHandle(""));
  };

  if (!view) return <p className="text-chalk-dim">Loading…</p>;

  const Row = ({ u, actions }: { u: User; actions: React.ReactNode }) => (
    <li className="flex items-center gap-3 py-2 text-sm">
      <Link to={`/u/${u.handle}`} className="hover:underline">
        {u.displayName}
      </Link>
      <span className="text-chalk-dim">@{u.handle}</span>
      <span className="ml-auto flex gap-2">{actions}</span>
    </li>
  );

  return (
    <div className="max-w-2xl">
      <PageTitle>Friends</PageTitle>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Add by handle, e.g. anna" />
        <Button type="submit" disabled={!handle.trim()}>
          Send request
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>

      {view.incoming.length > 0 && (
        <Panel className="mt-6">
          <h2 className="font-display text-lg">Requests for you</h2>
          <ul className="mt-2 divide-y divide-ink/40">
            {view.incoming.map((u) => (
              <Row
                key={u.id}
                u={u}
                actions={
                  <>
                    <Button className="py-1" onClick={() => void run(() => friendsApi.accept(u.id))}>
                      Accept
                    </Button>
                    <Button variant="ghost" className="py-1" onClick={() => void run(() => friendsApi.remove(u.id))}>
                      Decline
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="mt-6">
        <h2 className="font-display text-lg">
          Friends <span className="tabular text-chalk-dim">{view.friends.length}</span>
        </h2>
        {view.friends.length === 0 ? (
          <p className="mt-2 text-sm text-chalk-dim">Nobody yet. Friends show up in the invite picker when you host a table.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/40">
            {view.friends.map((u) => (
              <Row
                key={u.id}
                u={u}
                actions={
                  <Button variant="ghost" className="py-1" onClick={() => confirm(`Remove ${u.displayName}?`) && void run(() => friendsApi.remove(u.id))}>
                    Remove
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      {view.outgoing.length > 0 && (
        <Panel className="mt-6">
          <h2 className="font-display text-lg">Sent</h2>
          <ul className="mt-2 divide-y divide-ink/40">
            {view.outgoing.map((u) => (
              <Row
                key={u.id}
                u={u}
                actions={
                  <Button variant="ghost" className="py-1" onClick={() => void run(() => friendsApi.remove(u.id))}>
                    Cancel
                  </Button>
                }
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

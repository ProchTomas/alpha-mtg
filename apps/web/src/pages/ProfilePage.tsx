import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { Button, ErrorText, Field, Input, PageTitle, Panel } from "@/components/ui";
import { deckApi, type DeckSummary } from "@/lib/decks";
import { DeckTile } from "@/components/DeckCard";

function since(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function ProfilePage() {
  const { handle = "" } = useParams();
  const me = useAuth((s) => s.user);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [decks, setDecks] = useState<DeckSummary[]>([]);

  useEffect(() => {
    setUser(undefined);
    api
      .get<{ user: User }>(`/users/${encodeURIComponent(handle)}`)
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    deckApi.listForUser(handle).then(setDecks).catch(() => setDecks([]));
  }, [handle, me?.id]);

  if (user === undefined) return <p className="text-chalk-dim">Loading…</p>;
  if (user === null) return <p className="text-chalk-dim">No player called @{handle}.</p>;

  const isMe = me?.id === user.id;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <PageTitle>{user.displayName}</PageTitle>
        <span className="text-chalk-dim">@{user.handle}</span>
      </div>
      <p className="mt-1 text-sm text-chalk-dim">Playing since {since(user.createdAt)}</p>

      <section className="mt-8">
        <h2 className="font-display text-xl">Decks</h2>
        {decks.length === 0 ? (
          <p className="mt-2 text-sm text-chalk-dim">No public decks yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {decks.map((d) => (
              <DeckTile key={d.id} deck={d} />
            ))}
          </div>
        )}
      </section>

      {isMe && <EditProfile />}
    </div>
  );
}

function EditProfile() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setMsg({});
    try {
      const r = await api.patch<{ user: User }>("/auth/profile", { displayName, email });
      setUser(r.user);
      setMsg({ ok: "Saved." });
    } catch (err) {
      setMsg({ err: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMsg({});
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMsg({ ok: "Password changed." });
    } catch (err) {
      setMsg({ err: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  };

  return (
    <section className="mt-10 grid max-w-2xl gap-6 md:grid-cols-2">
      <Panel>
        <h2 className="font-display text-xl">Profile</h2>
        <form onSubmit={saveProfile} className="mt-4 space-y-4">
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Email (optional)" hint="Only a label on your account. Nothing is ever sent to it.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit">Save</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-xl">Password</h2>
        <form onSubmit={savePassword} className="mt-4 space-y-4">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!currentPassword || newPassword.length < 8}>
            Change password
          </Button>
        </form>
      </Panel>
      <div className="md:col-span-2">
        {msg.ok && <p className="text-sm text-brass">{msg.ok}</p>}
        <ErrorText>{msg.err}</ErrorText>
      </div>
    </section>
  );
}

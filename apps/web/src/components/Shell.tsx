import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { CardPreviewLayer } from "./CardPreview";

type Invite = { code: string; from: User; at: number };

/** Polls /api/invites while signed in; no push channel needed for a friends' site. */
function InviteBanner() {
  const user = useAuth((s) => s.user);
  const [invites, setInvites] = useState<Invite[]>([]);
  useEffect(() => {
    if (!user) {
      setInvites([]);
      return;
    }
    const poll = () => api.get<{ invites: Invite[] }>("/invites").then((r) => setInvites(r.invites)).catch(() => {});
    poll();
    const t = setInterval(poll, 20_000);
    return () => clearInterval(t);
  }, [user]);
  if (invites.length === 0) return null;
  return (
    <div className="border-b border-brass/40 bg-felt-800">
      {invites.map((i) => (
        <div key={i.code} className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
          <span>
            <span className="text-chalk">{i.from.displayName}</span> invited you to a table.
          </span>
          <Link to={`/table/${i.code}`} className="rounded bg-brass px-3 py-1 font-medium text-ink hover:brightness-110">
            Join {i.code}
          </Link>
          <button
            onClick={() => {
              void api.del(`/invites/${i.code}`);
              setInvites(invites.filter((x) => x.code !== i.code));
            }}
            className="text-chalk-dim hover:text-chalk"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Playtest";

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "text-chalk" : "hover:text-chalk");

export function Shell() {
  const { user, ready, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-ink/60 bg-felt-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-display text-xl tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex gap-4 text-sm text-chalk-dim">
            <NavLink to="/cards" className={navClass}>
              Cards
            </NavLink>
            <NavLink to="/decks" className={navClass}>
              Decks
            </NavLink>
            <NavLink to="/table/solo" className={navClass}>
              Table
            </NavLink>
            {user && (
              <NavLink to="/friends" className={navClass}>
                Friends
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            {!ready ? null : user ? (
              <>
                <Link to={`/u/${user.handle}`} className="text-chalk-dim hover:text-chalk">
                  {user.displayName}
                </Link>
                <button
                  onClick={() => void logout().then(() => nav("/"))}
                  className="text-chalk-dim hover:text-chalk"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-chalk-dim hover:text-chalk">
                  Sign in
                </Link>
                <Link to="/register" className="rounded bg-brass px-3 py-1 font-medium text-ink hover:brightness-110">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <InviteBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <CardPreviewLayer />
      <footer className="border-t border-ink/60 px-4 py-4 text-center text-xs text-chalk-dim">
        Card data and images from Scryfall. Magic: The Gathering is © Wizards of the Coast. This is unofficial Fan
        Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
      </footer>
    </div>
  );
}

import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CardPreviewLayer } from "./CardPreview";

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

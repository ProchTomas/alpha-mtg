import { Link, NavLink, Outlet } from "react-router-dom";

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Playtest";

export function Shell() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-ink/60 bg-felt-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-display text-xl tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex gap-4 text-sm text-chalk-dim">
            <NavLink to="/cards" className={({ isActive }) => (isActive ? "text-chalk" : "hover:text-chalk")}>
              Cards
            </NavLink>
            <NavLink to="/decks" className={({ isActive }) => (isActive ? "text-chalk" : "hover:text-chalk")}>
              Decks
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-ink/60 px-4 py-4 text-center text-xs text-chalk-dim">
        Card data and images from Scryfall. Magic: The Gathering is © Wizards of the Coast. This is unofficial Fan
        Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
      </footer>
    </div>
  );
}

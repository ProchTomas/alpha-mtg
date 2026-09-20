import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="py-16">
      <h1 className="font-display text-5xl font-medium tracking-tight">Shuffle up.</h1>
      <p className="mt-4 max-w-xl text-chalk-dim">
        Build decks, then sit down at a table with friends. No rules engine — the server moves cards and keeps
        hidden information hidden, you do the rest by talking.
      </p>
      <div className="mt-8 flex gap-3">
        <Link to="/cards" className="rounded bg-brass px-4 py-2 font-medium text-ink hover:brightness-110">
          Search cards
        </Link>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { deckApi, FORMATS, type DeckSummary, type UnresolvedLine } from "@/lib/decks";
import { DeckTile } from "@/components/DeckCard";
import { Button, ErrorText, Field, Input, PageTitle, Panel } from "@/components/ui";

export function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  useEffect(() => {
    void deckApi.list().then(setDecks);
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between">
        <PageTitle>Your decks</PageTitle>
        <Link to="/decks/new" className="rounded bg-brass px-4 py-2 text-sm font-medium text-ink hover:brightness-110">
          New deck
        </Link>
      </div>
      {decks === null ? (
        <p className="mt-6 text-chalk-dim">Loading…</p>
      ) : decks.length === 0 ? (
        <Panel className="mt-6 max-w-md">
          <p className="text-chalk-dim">No decks yet. Paste a decklist from Moxfield, Arena or MTGO to get started.</p>
          <Link to="/decks/new" className="mt-3 inline-block text-chalk underline">
            Create your first deck
          </Link>
        </Panel>
      ) : (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {decks.map((d) => (
            <DeckTile key={d.id} deck={d} />
          ))}
        </div>
      )}
    </div>
  );
}

const SAMPLE = `4 Lightning Bolt
4 Monastery Swiftspear
20 Mountain

SIDEBOARD:
2 Smash to Smithereens`;

export function NewDeckPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<string>("sixty");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedLine[]>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await deckApi.create({ name: name || "Untitled deck", format, text: text || undefined });
      if (r.unresolved.length) {
        setUnresolved(r.unresolved);
        // Give the user a beat to read the unresolved lines before going to the deck.
        setTimeout(() => nav(`/decks/${r.deck.id}`), 2500);
      } else {
        nav(`/decks/${r.deck.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>New deck</PageTitle>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled deck" maxLength={80} />
          </Field>
          <Field label="Format">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded border border-felt-700 bg-felt-800 px-3 py-2 text-chalk"
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Decklist (optional)" hint="One card per line: “4 Lightning Bolt”. Headers like SIDEBOARD: and // Commander are understood, as are Arena's (SET) 123 suffixes.">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder={SAMPLE}
            spellCheck={false}
            className="w-full rounded border border-felt-700 bg-felt-800 px-3 py-2 font-mono text-sm text-chalk placeholder:text-chalk-dim/50"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        {unresolved.length > 0 && (
          <Panel>
            <p className="text-sm">Couldn't find these — the rest of the deck was saved:</p>
            <ul className="mt-2 font-mono text-sm text-chalk-dim">
              {unresolved.map((u, i) => (
                <li key={i}>{u.raw}</li>
              ))}
            </ul>
          </Panel>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {text.trim() ? "Import deck" : "Create empty deck"}
          </Button>
          <Link to="/decks" className="px-4 py-2 text-sm text-chalk-dim hover:text-chalk">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

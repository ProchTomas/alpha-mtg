import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import type { Board, CardSummary } from "@alphamtg/shared";
import { BOARDS } from "@alphamtg/shared";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { BOARD_LABELS, computeStats, deckApi, exportText, FORMATS, formatLabel, groupByType, type DeckDetail, type UnresolvedLine } from "@/lib/decks";
import { CardImage } from "@/components/CardImage";
import { CardSearch } from "@/components/CardSearch";
import { previewProps } from "@/components/CardPreview";
import { DeckStatsPanel } from "@/components/DeckStats";
import { Button, ErrorText, Input, Panel } from "@/components/ui";

type View = "grid" | "list";
const DISPLAY_ORDER: Board[] = ["command", "main", "side", "maybe"];

export function DeckPage() {
  const { id = "" } = useParams();
  const editing = Boolean(useMatch("/decks/:id/edit"));
  const nav = useNavigate();
  const me = useAuth((s) => s.user);
  const [deck, setDeck] = useState<DeckDetail | null | undefined>(undefined);
  const [view, setView] = useState<View>(() => (localStorage.getItem("deckView") as View) || "grid");
  const [error, setError] = useState<string | null>(null);
  const [addBoard, setAddBoard] = useState<Board>("main");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    setDeck(undefined);
    deckApi
      .get(id)
      .then(setDeck)
      .catch(() => setDeck(null));
  }, [id]);

  const isOwner = Boolean(deck && me && deck.userId === me.id);
  const stats = useMemo(() => (deck ? computeStats(deck) : null), [deck]);

  const run = useCallback(async (fn: () => Promise<DeckDetail>) => {
    setError(null);
    try {
      setDeck(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }, []);

  const setQty = (cardId: string, board: Board, quantity: number) => run(() => deckApi.setCard(id, { cardId, board, quantity }));

  const moveTo = async (cardId: string, from: Board, to: Board, quantity: number) => {
    await run(() => deckApi.setCard(id, { cardId, board: from, quantity: 0 }));
    const existing = deck?.cards.find((e) => e.cardId === cardId && e.board === to)?.quantity ?? 0;
    await run(() => deckApi.setCard(id, { cardId, board: to, quantity: existing + quantity }));
  };

  const addCard = (card: CardSummary) => {
    const existing = deck?.cards.find((e) => e.cardId === card.id && e.board === addBoard)?.quantity ?? 0;
    void setQty(card.id, addBoard, existing + 1);
  };

  const changeView = (v: View) => {
    setView(v);
    localStorage.setItem("deckView", v);
  };

  if (deck === undefined) return <p className="text-chalk-dim">Loading…</p>;
  if (deck === null) return <p className="text-chalk-dim">No such deck, or it's private.</p>;

  const boardsWithCards = DISPLAY_ORDER.filter((b) => deck.cards.some((e) => e.board === b));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0">
        <DeckHeader deck={deck} isOwner={isOwner} editing={editing} run={run} onDelete={() => nav("/decks")} />
        <ErrorText>{error}</ErrorText>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex rounded bg-felt-800 p-0.5">
            {(["grid", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={`rounded px-3 py-1 capitalize ${view === v ? "bg-felt-700 text-chalk" : "text-chalk-dim hover:text-chalk"}`}
              >
                {v}
              </button>
            ))}
          </div>
          {isOwner && (
            <>
              {editing ? (
                <Link to={`/decks/${id}`} className="rounded bg-brass px-3 py-1 font-medium text-ink hover:brightness-110">
                  Done
                </Link>
              ) : (
                <Link to={`/decks/${id}/edit`} className="rounded bg-felt-800 px-3 py-1 text-chalk hover:bg-felt-700">
                  Edit
                </Link>
              )}
              <Button variant="ghost" onClick={() => setShowImport(true)} className="py-1">
                Import
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="py-1"
            onClick={() => {
              void navigator.clipboard?.writeText(exportText(deck));
            }}
          >
            Copy list
          </Button>
        </div>

        {editing && (
          <Panel className="mt-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <CardSearch autoFocus onPick={addCard} placeholder="Add a card…" />
              </div>
              <select
                value={addBoard}
                onChange={(e) => setAddBoard(e.target.value as Board)}
                className="rounded border border-felt-700 bg-felt-800 px-2 text-sm text-chalk"
              >
                {BOARDS.map((b) => (
                  <option key={b} value={b}>
                    to {BOARD_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
          </Panel>
        )}

        {deck.cards.length === 0 && (
          <p className="mt-8 text-chalk-dim">
            This deck is empty.{" "}
            {isOwner && !editing && (
              <Link to={`/decks/${id}/edit`} className="text-chalk underline">
                Add cards
              </Link>
            )}
          </p>
        )}

        {boardsWithCards.map((board) => (
          <section key={board} className="mt-8">
            <h2 className="font-display text-xl">
              {BOARD_LABELS[board]}{" "}
              <span className="tabular text-base text-chalk-dim">
                {deck.cards.filter((e) => e.board === board).reduce((n, e) => n + e.quantity, 0)}
              </span>
            </h2>
            {groupByType(deck, board).map((g) => (
              <div key={g.type} className="mt-3">
                {board === "main" && (
                  <h3 className="mb-2 text-sm text-chalk-dim">
                    {g.type} <span className="tabular">({g.count})</span>
                  </h3>
                )}
                {view === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                    {g.entries.map((e) => {
                      const c = deck.cardData[e.cardId];
                      if (!c) return null;
                      return (
                        <div key={e.cardId} className="relative" {...previewProps(c)}>
                          <CardImage card={c} size="small" />
                          <span className="tabular absolute right-1 bottom-1 rounded bg-ink/85 px-1.5 text-xs font-medium">
                            ×{e.quantity}
                          </span>
                          {editing && (
                            <Stepper
                              qty={e.quantity}
                              onChange={(q) => void setQty(e.cardId, board, q)}
                              onMove={(to) => void moveTo(e.cardId, board, to, e.quantity)}
                              onCover={() => void run(() => deckApi.update(id, { coverCardId: e.cardId }))}
                              board={board}
                              overlay
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ul className="divide-y divide-ink/40 rounded bg-felt-800">
                    {g.entries.map((e) => {
                      const c = deck.cardData[e.cardId];
                      if (!c) return null;
                      return (
                        <li key={e.cardId} className="flex items-center gap-3 px-3 py-1.5 text-sm" {...previewProps(c)}>
                          <span className="tabular w-6 text-right text-chalk-dim">{e.quantity}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="hidden truncate text-xs text-chalk-dim sm:block sm:w-48">{c.typeLine?.split(" — ")[0]}</span>
                          <span className="tabular w-16 text-right text-xs text-chalk-dim">{c.manaCost ?? c.cardFaces?.[0]?.mana_cost ?? ""}</span>
                          {editing && (
                            <Stepper
                              qty={e.quantity}
                              onChange={(q) => void setQty(e.cardId, board, q)}
                              onMove={(to) => void moveTo(e.cardId, board, to, e.quantity)}
                              onCover={() => void run(() => deckApi.update(id, { coverCardId: e.cardId }))}
                              board={board}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      {stats && <DeckStatsPanel stats={stats} />}

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImport={async (text, mode) => {
            const r = await deckApi.import(id, text, mode);
            setDeck(r.deck);
            return r.unresolved;
          }}
        />
      )}
    </div>
  );
}

function DeckHeader({
  deck,
  isOwner,
  editing,
  run,
  onDelete,
}: {
  deck: DeckDetail;
  isOwner: boolean;
  editing: boolean;
  run: (fn: () => Promise<DeckDetail>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [description, setDescription] = useState(deck.description);
  useEffect(() => {
    setName(deck.name);
    setDescription(deck.description);
  }, [deck.name, deck.description]);

  if (editing && isOwner) {
    return (
      <div className="space-y-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== deck.name && void run(() => deckApi.update(deck.id, { name }))}
          className="font-display text-2xl"
          maxLength={80}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== deck.description && void run(() => deckApi.update(deck.id, { description }))}
          rows={2}
          placeholder="Description (optional)"
          className="w-full rounded border border-felt-700 bg-felt-800 px-3 py-2 text-sm text-chalk placeholder:text-chalk-dim/60"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            value={deck.format}
            onChange={(e) => void run(() => deckApi.update(deck.id, { format: e.target.value }))}
            className="rounded border border-felt-700 bg-felt-800 px-2 py-1 text-chalk"
          >
            {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
          </select>
          <select
            value={deck.visibility}
            onChange={(e) => void run(() => deckApi.update(deck.id, { visibility: e.target.value as DeckDetail["visibility"] }))}
            className="rounded border border-felt-700 bg-felt-800 px-2 py-1 capitalize text-chalk"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted (anyone with the link)</option>
            <option value="public">Public</option>
          </select>
          <Button
            variant="danger"
            className="ml-auto py-1"
            onClick={() => {
              if (confirm(`Delete “${deck.name}”? This can't be undone.`)) void deckApi.remove(deck.id).then(onDelete);
            }}
          >
            Delete deck
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-medium tracking-tight">{deck.name}</h1>
      <p className="mt-1 text-sm text-chalk-dim">
        {formatLabel(deck.format)} · by{" "}
        <Link to={`/u/${deck.ownerHandle}`} className="text-chalk hover:underline">
          {deck.ownerDisplayName}
        </Link>
        {deck.visibility !== "public" && <> · {deck.visibility}</>}
      </p>
      {deck.description && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm">{deck.description}</p>}
    </div>
  );
}

function Stepper({
  qty,
  onChange,
  onMove,
  onCover,
  board,
  overlay = false,
}: {
  qty: number;
  onChange: (q: number) => void;
  onMove: (to: Board) => void;
  onCover: () => void;
  board: Board;
  overlay?: boolean;
}) {
  const btn = "h-6 w-6 rounded bg-felt-700 text-sm leading-none hover:bg-felt-700/70";
  return (
    <div className={overlay ? "absolute inset-x-1 bottom-1 flex items-center gap-1 rounded bg-ink/85 p-1" : "flex items-center gap-1"}>
      <button className={btn} onClick={() => onChange(qty - 1)} aria-label="Remove one">
        −
      </button>
      <span className="tabular w-5 text-center text-xs">{qty}</span>
      <button className={btn} onClick={() => onChange(qty + 1)} aria-label="Add one">
        +
      </button>
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === "cover") onCover();
          else if (v) onMove(v as Board);
        }}
        className="ml-auto h-6 w-6 rounded bg-felt-700 text-xs text-chalk-dim"
        aria-label="More"
      >
        <option value="">…</option>
        {BOARDS.filter((b) => b !== board).map((b) => (
          <option key={b} value={b}>
            Move to {BOARD_LABELS[b]}
          </option>
        ))}
        <option value="cover">Use as cover</option>
      </select>
    </div>
  );
}

function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (text: string, mode: "replace" | "append") => Promise<UnresolvedLine[]>;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("append");
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState<UnresolvedLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <Panel className="w-full max-w-lg" >
        <div onClick={(e) => e.stopPropagation()}>
          <h2 className="font-display text-xl">Import cards</h2>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={"4 Lightning Bolt\n1 Sol Ring"}
            className="mt-3 w-full rounded border border-felt-700 bg-felt-900 px-3 py-2 font-mono text-sm text-chalk"
          />
          <div className="mt-3 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} className="accent-brass" /> Add to deck
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-brass" /> Replace deck
            </label>
          </div>
          <ErrorText>{error}</ErrorText>
          {unresolved && unresolved.length > 0 && (
            <div className="mt-3 text-sm">
              <p>Couldn't find:</p>
              <ul className="font-mono text-chalk-dim">
                {unresolved.map((u, i) => (
                  <li key={i}>{u.raw}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {unresolved ? "Close" : "Cancel"}
            </Button>
            <Button
              disabled={busy || !text.trim()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const u = await onImport(text, mode);
                  setUnresolved(u);
                  if (u.length === 0) onClose();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Something went wrong.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

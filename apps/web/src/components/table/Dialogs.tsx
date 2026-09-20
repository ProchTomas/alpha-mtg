import { useEffect, useState } from "react";
import type { CardSummary, Zone } from "@alphamtg/shared";
import { useGame } from "@/lib/game";
import { CardImage } from "@/components/CardImage";
import { CardSearch } from "@/components/CardSearch";
import { previewProps } from "@/components/CardPreview";
import { Button } from "@/components/ui";
import { useMenu } from "./ContextMenu";

type Peek = { iid: string; cardId: string };

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" data-menu data-no-flip>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-lg bg-felt-800 p-5 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <div className="mb-3 flex items-center">
          <h2 className="font-display text-xl">{title}</h2>
          <button onClick={onClose} className="ml-auto text-sm text-chalk-dim hover:text-chalk">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Search your library: private view of every card, move any of them anywhere, then shuffle. */
export function SearchDialog({ cards, onClose }: { cards: Peek[]; onClose: () => void }) {
  const cardData = useGame((s) => s.cardData);
  const dispatch = useGame((s) => s.dispatch);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const take = (iid: string, to: Zone, position: "top" | "bottom") => {
    dispatch({ type: "MOVE_CARD", iid, from: "library", to, position });
    setTaken(new Set([...taken, iid]));
  };
  const finish = (shuffle: boolean) => {
    dispatch({ type: "SEARCH_END" });
    if (shuffle) dispatch({ type: "SHUFFLE" });
    onClose();
  };

  const visible = cards
    .filter((c) => !taken.has(c.iid))
    .map((c) => ({ ...c, data: cardData[c.cardId] }))
    .filter((c) => !q || (c.data?.name ?? "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.data?.name ?? "").localeCompare(b.data?.name ?? ""));

  return (
    <Modal title="Searching your library" onClose={() => finish(true)} wide>
      <div className="mb-3 flex items-center gap-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          className="w-64 rounded border border-felt-700 bg-felt-900 px-3 py-1.5 text-sm"
        />
        <span className="text-sm text-chalk-dim">Click a card to choose where it goes. Only you can see this.</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => finish(false)}>
            Done, don't shuffle
          </Button>
          <Button onClick={() => finish(true)}>Done &amp; shuffle</Button>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
        {visible.map((c) => (
          <button
            key={c.iid}
            {...(c.data ? previewProps(c.data) : {})}
            onClick={(e) =>
              useMenu.getState().show(e.clientX, e.clientY, [
                { label: "To hand", onSelect: () => take(c.iid, "hand", "bottom") },
                { label: "To battlefield", onSelect: () => take(c.iid, "battlefield", "bottom") },
                { label: "To graveyard", onSelect: () => take(c.iid, "graveyard", "top") },
                { label: "To exile", onSelect: () => take(c.iid, "exile", "top") },
                { separator: true },
                { label: "Top of library", onSelect: () => take(c.iid, "library", "top") },
                { label: "Bottom of library", onSelect: () => take(c.iid, "library", "bottom") },
              ], c.data?.name)
            }
            className="text-left"
          >
            {c.data ? <CardImage card={c.data} size="small" /> : <div className="card-img" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Scry: the top N in order; toggle each to bottom, drag to reorder is v2 — use the arrows. */
export function ScryDialog({ cards, onClose }: { cards: Peek[]; onClose: () => void }) {
  const cardData = useGame((s) => s.cardData);
  const dispatch = useGame((s) => s.dispatch);
  const [top, setTop] = useState<Peek[]>(cards);
  const [bottom, setBottom] = useState<Peek[]>([]);

  const move = (list: Peek[], setList: (l: Peek[]) => void, i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setList(next);
  };
  const confirm = () => {
    dispatch({ type: "SCRY", toTop: top.map((c) => c.iid), toBottom: bottom.map((c) => c.iid) });
    onClose();
  };

  const Row = ({ list, setList, label }: { list: Peek[]; setList: (l: Peek[]) => void; label: string }) => (
    <div>
      <h3 className="mb-2 text-sm text-chalk-dim">
        {label} <span className="tabular">({list.length})</span>
      </h3>
      <div className="flex min-h-[120px] flex-wrap gap-2 rounded bg-felt-900/50 p-2">
        {list.map((c, i) => {
          const d = cardData[c.cardId];
          return (
            <div key={c.iid} className="w-[90px]" {...(d ? previewProps(d) : {})}>
              {d ? <CardImage card={d} size="small" /> : <div className="card-img" />}
              <div className="mt-1 flex justify-between text-xs">
                <button onClick={() => move(list, setList, i, -1)} className="px-1 text-chalk-dim hover:text-chalk" title="Earlier">
                  ←
                </button>
                <button
                  onClick={() => {
                    if (label === "Top") {
                      setTop(top.filter((x) => x.iid !== c.iid));
                      setBottom([...bottom, c]);
                    } else {
                      setBottom(bottom.filter((x) => x.iid !== c.iid));
                      setTop([...top, c]);
                    }
                  }}
                  className="px-1 text-chalk-dim hover:text-chalk"
                >
                  {label === "Top" ? "↓ bottom" : "↑ top"}
                </button>
                <button onClick={() => move(list, setList, i, 1)} className="px-1 text-chalk-dim hover:text-chalk" title="Later">
                  →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal title={`Top ${cards.length} of your library`} onClose={onClose}>
      <p className="mb-3 text-sm text-chalk-dim">Leftmost is the top. Only you can see this.</p>
      <div className="space-y-4">
        <Row list={top} setList={setTop} label="Top" />
        <Row list={bottom} setList={setBottom} label="Bottom" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={confirm}>Done</Button>
      </div>
    </Modal>
  );
}

const COLORS = ["W", "U", "B", "R", "G"] as const;

/** Create a token: search Scryfall's real token cards, or type one in. */
export function TokenDialog({ onClose }: { onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const [name, setName] = useState("");
  const [typeLine, setTypeLine] = useState("Token Creature");
  const [pt, setPt] = useState("1/1");
  const [colors, setColors] = useState<Set<(typeof COLORS)[number]>>(new Set());

  const pickCard = (c: CardSummary) => {
    dispatch({ type: "CREATE_TOKEN", cardId: c.id });
    onClose();
  };
  const custom = () => {
    const [power, toughness] = pt.split("/");
    dispatch({
      type: "CREATE_TOKEN",
      spec: { name: name || "Token", typeLine, power: power?.trim() || undefined, toughness: toughness?.trim() || undefined, colors: [...colors] },
    });
    onClose();
  };

  return (
    <Modal title="Create a token" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="mb-1 text-sm text-chalk-dim">Find a printed token (e.g. “Soldier”, “Treasure”, “Copy”)</p>
          <CardSearch autoFocus onPick={pickCard} placeholder="Search tokens…" />
        </div>
        <div className="border-t border-ink/50 pt-4">
          <p className="mb-2 text-sm text-chalk-dim">Or make one up</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_80px]">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded border border-felt-700 bg-felt-900 px-3 py-1.5 text-sm" />
            <input value={typeLine} onChange={(e) => setTypeLine(e.target.value)} placeholder="Type line" className="rounded border border-felt-700 bg-felt-900 px-3 py-1.5 text-sm" />
            <input value={pt} onChange={(e) => setPt(e.target.value)} placeholder="P/T" className="rounded border border-felt-700 bg-felt-900 px-3 py-1.5 text-sm" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  const next = new Set(colors);
                  if (next.has(c)) next.delete(c);
                  else next.add(c);
                  setColors(next);
                }}
                className={`pip pip-${c} h-5 w-5 ${colors.has(c) ? "ring-2 ring-brass" : "opacity-50"}`}
                title={c}
              />
            ))}
            <Button onClick={custom} className="ml-auto">
              Create
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * London mulligan helper: after the reshuffle-and-draw-7, pick N cards from your hand to put
 * on the bottom (N = how many mulligans you've taken). Click to toggle, then confirm.
 */
export function MulliganDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const state = useGame((s) => s.state);
  const me = useGame((s) => s.me);
  const cardData = useGame((s) => s.cardData);
  const dispatch = useGame((s) => s.dispatch);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const hand = state?.players[me]?.zones.hand ?? [];

  const confirm = () => {
    if (picked.size > 0) dispatch({ type: "MOVE_MANY", iids: [...picked], from: "hand", to: "library", position: "bottom" });
    onClose();
  };

  return (
    <Modal title={`Mulligan to ${7 - count}`} onClose={onClose}>
      <p className="mb-3 text-sm text-chalk-dim">
        Choose {count} card{count === 1 ? "" : "s"} to put on the bottom of your library. Only you can see this.
      </p>
      <div className="flex flex-wrap gap-2">
        {hand.map((c) => {
          const d = cardData[c.cardId];
          const on = picked.has(c.iid);
          return (
            <button
              key={c.iid}
              onClick={() => {
                const next = new Set(picked);
                if (on) next.delete(c.iid);
                else if (next.size < count) next.add(c.iid);
                setPicked(next);
              }}
              className={`w-[100px] rounded-[4.75%] ${on ? "ring-2 ring-brass" : ""}`}
              {...(d ? previewProps(d) : {})}
            >
              {d ? <CardImage card={d} size="small" className={on ? "opacity-60" : ""} /> : <div className="card-img" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="tabular mr-auto text-sm text-chalk-dim">
          {picked.size} / {count}
        </span>
        <Button variant="ghost" onClick={onClose}>
          Keep all
        </Button>
        <Button onClick={confirm} disabled={picked.size !== count}>
          Bottom {count} and keep
        </Button>
      </div>
    </Modal>
  );
}

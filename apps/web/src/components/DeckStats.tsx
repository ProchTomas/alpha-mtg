import type { DeckStats } from "@/lib/decks";

const PIP_ORDER = ["W", "U", "B", "R", "G", "C"];
const PIP_LABEL: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

/**
 * Stats sidebar. The mana curve is a single-series bar chart: one neutral hue
 * (brass is reserved for turn/focus/primary), thin bars, direct labels, hover title.
 */
export function DeckStatsPanel({ stats }: { stats: DeckStats }) {
  const max = Math.max(1, ...stats.curve);
  const totalPips = Object.values(stats.pips).reduce((a, b) => a + b, 0);
  return (
    <aside className="space-y-6 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Cards" value={stats.total} />
        <Stat label="Lands" value={stats.lands} />
        <Stat label="Avg MV" value={stats.avgManaValue.toFixed(2)} />
      </div>

      <section>
        <h3 className="mb-2 text-chalk-dim">Mana curve</h3>
        <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Mana curve">
          {stats.curve.map((n, mv) => (
            <div key={mv} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${n} card${n === 1 ? "" : "s"} at mana value ${mv === 7 ? "7+" : mv}`}>
              <span className="tabular text-xs text-chalk-dim">{n || ""}</span>
              <div
                className="w-full rounded-t bg-chalk-dim/70 transition-none"
                style={{ height: `${(n / max) * 80}px`, minHeight: n ? 2 : 0 }}
              />
              <span className="tabular text-xs text-chalk-dim">{mv === 7 ? "7+" : mv}</span>
            </div>
          ))}
        </div>
      </section>

      {totalPips > 0 && (
        <section>
          <h3 className="mb-2 text-chalk-dim">Color pips</h3>
          <ul className="space-y-1">
            {PIP_ORDER.filter((k) => stats.pips[k]).map((k) => {
              const n = stats.pips[k]!;
              return (
                <li key={k} className="flex items-center gap-2">
                  <span className={`pip pip-${k}`} aria-hidden />
                  <span className="w-20">{PIP_LABEL[k]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-felt-700">
                    <span className="block h-full bg-chalk-dim/70" style={{ width: `${(n / totalPips) * 100}%` }} />
                  </span>
                  <span className="tabular w-10 text-right text-chalk-dim">{Math.round((n / totalPips) * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-chalk-dim">Types</h3>
        <ul className="space-y-1">
          {stats.types.map((t) => (
            <li key={t.type} className="flex justify-between">
              <span>{t.type}</span>
              <span className="tabular text-chalk-dim">{t.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-felt-900/60 px-3 py-2">
      <div className="text-xs text-chalk-dim">{label}</div>
      <div className="tabular font-display text-2xl">{value}</div>
    </div>
  );
}

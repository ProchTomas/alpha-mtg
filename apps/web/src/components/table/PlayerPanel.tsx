import type { PlayerState } from "@alphamtg/shared";
import { useGame } from "@/lib/game";

const QUICK_COUNTERS = ["poison", "energy", "experience", "commander damage"];

/** Life total (big tabular numerals), ±1/±5, and named player counters. Anyone can edit anyone's. */
export function PlayerPanel({ player, isTurn, compact = false }: { player: PlayerState; isTurn: boolean; compact?: boolean }) {
  const dispatch = useGame((s) => s.dispatch);
  const adj = (delta: number) => dispatch({ type: "ADJUST_LIFE", playerId: player.id, delta });
  const setCounter = (name: string, value: number) => dispatch({ type: "SET_PLAYER_COUNTER", playerId: player.id, name, value });
  const counters = Object.entries(player.counters);

  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "rounded-lg bg-felt-800 px-3 py-2"}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {isTurn && <span className="h-2 w-2 rounded-full bg-brass" title="Active turn" />}
          <span className="truncate">{player.displayName}</span>
          {!player.connected && useGame.getState().mode === "online" && <span className="text-xs text-chalk-dim">(away)</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => adj(-5)} className="rounded px-1.5 text-xs text-chalk-dim hover:bg-felt-700" title="−5">
            −5
          </button>
          <button onClick={() => adj(-1)} className="rounded px-1.5 text-chalk-dim hover:bg-felt-700" title="−1">
            −
          </button>
          <button
            onClick={() => {
              const v = window.prompt("Set life to", String(player.life));
              if (v !== null && Number.isFinite(parseInt(v, 10))) dispatch({ type: "SET_LIFE", playerId: player.id, value: parseInt(v, 10) });
            }}
            className={`tabular font-display leading-none ${compact ? "text-2xl" : "text-[40px]"} min-w-[2ch] text-center`}
            title="Click to set"
          >
            {player.life}
          </button>
          <button onClick={() => adj(1)} className="rounded px-1.5 text-chalk-dim hover:bg-felt-700" title="+1">
            +
          </button>
          <button onClick={() => adj(5)} className="rounded px-1.5 text-xs text-chalk-dim hover:bg-felt-700" title="+5">
            +5
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {counters.map(([name, n]) => (
          <span key={name} className="flex items-center gap-1 rounded bg-felt-900/60 px-1.5 py-0.5">
            <button onClick={() => setCounter(name, n - 1)} className="text-chalk-dim hover:text-chalk">
              −
            </button>
            <span className="tabular">
              {n} {name}
            </span>
            <button onClick={() => setCounter(name, n + 1)} className="text-chalk-dim hover:text-chalk">
              +
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            const name = e.target.value === "other" ? window.prompt("Counter name")?.trim() : e.target.value;
            if (name) setCounter(name, (player.counters[name] ?? 0) + 1);
          }}
          className="rounded bg-felt-900/60 px-1 py-0.5 text-chalk-dim"
          title="Add a counter"
        >
          <option value="">+ counter</option>
          {QUICK_COUNTERS.filter((c) => !player.counters[c]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="other">other…</option>
        </select>
      </div>
    </div>
  );
}

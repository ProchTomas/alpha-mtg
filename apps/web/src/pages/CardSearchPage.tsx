import { useState } from "react";
import type { CardSummary } from "@playster/shared";
import { CardSearch } from "@/components/CardSearch";
import { CardImage } from "@/components/CardImage";

export function CardSearchPage() {
  const [results, setResults] = useState<CardSummary[]>([]);
  return (
    <div>
      <h1 className="font-display text-3xl">Cards</h1>
      <div className="mt-4 max-w-xl">
        <CardSearch autoFocus onResults={setResults} />
      </div>
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {results.map((c) => (
          <figure key={c.id}>
            <CardImage card={c} />
            <figcaption className="mt-1 truncate text-xs text-chalk-dim">
              {c.name} · {c.setCode.toUpperCase()} {c.collectorNumber}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

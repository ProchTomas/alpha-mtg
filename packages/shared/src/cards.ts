/** Card shape shared by client and server: a subset of the `cards` table. */
export type CardFace = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: Record<string, string>;
};

export type CardSummary = {
  id: string;
  oracleId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  cmc: number | null;
  colors: string[];
  colorIdentity: string[];
  layout: string | null;
  power: string | null;
  toughness: string | null;
  imageUris: Record<string, string> | null;
  cardFaces: CardFace[] | null;
  releasedAt: string | null;
};

export type ImageSize = "small" | "normal" | "large" | "png" | "art_crop" | "border_crop";

const TWO_FACED_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "double_faced_token",
  "reversible_card",
  "art_series",
]);

/**
 * The one place that knows where images live for every layout.
 * Double-faced layouts keep image_uris on card_faces[n]; everything else on the card.
 */
export function getFaceImages(
  card: Pick<CardSummary, "imageUris" | "cardFaces" | "layout">,
  size: ImageSize = "normal",
): { front: string | null; back: string | null } {
  const faces = card.cardFaces ?? [];
  const fromFaces = faces.map((f) => f.image_uris?.[size] ?? null);
  const front = card.imageUris?.[size] ?? fromFaces[0] ?? null;
  const back = TWO_FACED_LAYOUTS.has(card.layout ?? "") ? (fromFaces[1] ?? null) : null;
  return { front, back };
}

export function hasBackFace(card: Pick<CardSummary, "layout">): boolean {
  return TWO_FACED_LAYOUTS.has(card.layout ?? "");
}

export function primaryTypeLine(card: Pick<CardSummary, "typeLine" | "cardFaces">): string {
  return card.typeLine ?? card.cardFaces?.[0]?.type_line ?? "";
}

const TYPE_BUCKETS = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
] as const;
export type TypeBucket = (typeof TYPE_BUCKETS)[number] | "Other";

/** Rough type bucket for deck stats. First match wins, so Artifact Creature → Creature. */
export function cardTypeBucket(typeLine: string): TypeBucket {
  // Only look at the front face and the supertypes/types before the em dash.
  const front = typeLine.split("//")[0] ?? typeLine;
  const t = front.split("—")[0] ?? front;
  for (const k of TYPE_BUCKETS) if (t.includes(k)) return k;
  return "Other";
}

/** Count colored/colorless pips in a mana cost string like "{1}{U}{U}". Hybrid counts for both. */
export function manaPips(manaCost: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!manaCost) return out;
  for (const m of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1] ?? "";
    for (const c of ["W", "U", "B", "R", "G", "C"]) {
      if (sym.includes(c)) out[c] = (out[c] ?? 0) + 1;
    }
  }
  return out;
}

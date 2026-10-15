/**
 * Land count guidance and opening-hand maths.
 *
 * The recommended count is a rule of thumb, not a theorem: decks want more lands as their average
 * mana value climbs, and cheap ramp partly substitutes for lands. The opening-hand numbers, by
 * contrast, are exact — a hypergeometric draw from the library.
 */

export type LandAdvice = {
  /** Lands the deck currently runs. */
  lands: number;
  /** Suggested land count for this curve. */
  recommended: number;
  /** Mean lands in an opening hand of seven. */
  openingMean: number;
  /** Probability of a keepable opening seven (2–5 lands). */
  pKeepable: number;
  /** Cards drawn from, i.e. deck size minus the command zone. */
  librarySize: number;
};

const HAND = 7;
const KEEP_MIN = 2;
const KEEP_MAX = 5;

/**
 * Commander decks sit around 36 lands at an average mana value of 2.5, rising with the curve.
 * Cheap ramp (mana value 2 or less) replaces roughly half a land each, capped so that a deck
 * stuffed with rocks still runs a sane mana base.
 */
export function recommendedLandCount(format: string, avgManaValue: number, cheapRamp: number): number {
  const mv = Number.isFinite(avgManaValue) ? Math.max(0, avgManaValue) : 3;
  const commander = format === "commander";
  const base = commander ? 31 + 2 * mv : 17 + 2.3 * mv;
  const rampOffset = Math.min(cheapRamp * 0.3, commander ? 3 : 2);
  const raw = base - rampOffset;
  const [lo, hi] = commander ? [30, 42] : [18, 27];
  return Math.round(Math.min(hi, Math.max(lo, raw)));
}

/** Hypergeometric: probability of exactly `k` successes drawing `draws` from `size` with `successes` in it. */
export function hypergeometric(size: number, successes: number, draws: number, k: number): number {
  if (k < 0 || k > draws || k > successes || draws - k > size - successes) return 0;
  return (choose(successes, k) * choose(size - successes, draws - k)) / choose(size, draws);
}

/** Multiplicative binomial coefficient; stays exact enough in doubles for deck-sized numbers. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * Opening-hand land maths. `librarySize` is what you actually draw from: for Commander that's the
 * 99, because the commander starts in the command zone.
 */
export function openingHand(librarySize: number, lands: number): { mean: number; pKeepable: number } {
  if (librarySize <= 0 || lands < 0) return { mean: 0, pKeepable: 0 };
  const draws = Math.min(HAND, librarySize);
  const mean = (draws * lands) / librarySize;
  let pKeepable = 0;
  for (let k = KEEP_MIN; k <= Math.min(KEEP_MAX, draws); k++) {
    pKeepable += hypergeometric(librarySize, lands, draws, k);
  }
  return { mean, pKeepable };
}

export function landAdvice(input: {
  format: string;
  lands: number;
  totalCards: number;
  commandZone: number;
  avgManaValue: number;
  cheapRamp: number;
}): LandAdvice {
  const librarySize = Math.max(1, input.totalCards - input.commandZone);
  const { mean, pKeepable } = openingHand(librarySize, input.lands);
  return {
    lands: input.lands,
    recommended: recommendedLandCount(input.format, input.avgManaValue, input.cheapRamp),
    openingMean: mean,
    pKeepable,
    librarySize,
  };
}

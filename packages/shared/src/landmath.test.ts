import { describe, expect, it } from "vitest";
import { choose, hypergeometric, landAdvice, openingHand, recommendedLandCount } from "./landmath.js";

describe("choose", () => {
  it("matches known binomial coefficients", () => {
    expect(choose(5, 2)).toBeCloseTo(10);
    expect(choose(52, 5)).toBeCloseTo(2598960);
    expect(choose(99, 7)).toBeCloseTo(14887031544, -3); // C(100,7) is 16007560800 — off by one deck slot
    expect(choose(100, 7)).toBeCloseTo(16007560800, -3);
    expect(choose(7, 0)).toBe(1);
    expect(choose(3, 5)).toBe(0);
  });
});

describe("hypergeometric", () => {
  it("sums to 1 over all outcomes", () => {
    let total = 0;
    for (let k = 0; k <= 7; k++) total += hypergeometric(99, 36, 7, k);
    expect(total).toBeCloseTo(1, 10);
  });

  it("is 0 for impossible draws", () => {
    expect(hypergeometric(99, 36, 7, 8)).toBe(0);
    expect(hypergeometric(99, 2, 7, 3)).toBe(0);
  });
});

describe("openingHand", () => {
  it("gives the mean by linearity of expectation", () => {
    // 36 lands in 99 cards, 7 cards drawn.
    expect(openingHand(99, 36).mean).toBeCloseTo((7 * 36) / 99, 10);
  });

  it("a typical Commander mana base keeps most hands", () => {
    const { pKeepable } = openingHand(99, 37);
    expect(pKeepable).toBeGreaterThan(0.8);
    expect(pKeepable).toBeLessThan(0.95);
  });

  it("a land-light deck keeps far fewer", () => {
    expect(openingHand(99, 20).pKeepable).toBeLessThan(openingHand(99, 37).pKeepable);
  });

  it("handles the degenerate cases", () => {
    expect(openingHand(0, 0)).toEqual({ mean: 0, pKeepable: 0 });
    expect(openingHand(99, 0).pKeepable).toBe(0);
  });
});

describe("recommendedLandCount", () => {
  it("rises with the curve in Commander", () => {
    const low = recommendedLandCount("commander", 2.5, 0);
    const high = recommendedLandCount("commander", 4.0, 0);
    expect(low).toBeGreaterThanOrEqual(35);
    expect(low).toBeLessThanOrEqual(37);
    expect(high).toBeGreaterThan(low);
  });

  it("cheap ramp buys back some lands, but not endlessly", () => {
    const none = recommendedLandCount("commander", 3, 0);
    const some = recommendedLandCount("commander", 3, 6);
    const lots = recommendedLandCount("commander", 3, 30);
    expect(some).toBeLessThan(none);
    expect(none - lots).toBeLessThanOrEqual(4);
  });

  it("stays inside sane bounds for either format", () => {
    for (const mv of [0, 1, 3, 6, 12]) {
      const c = recommendedLandCount("commander", mv, 0);
      expect(c).toBeGreaterThanOrEqual(30);
      expect(c).toBeLessThanOrEqual(42);
      const s = recommendedLandCount("sixty", mv, 0);
      expect(s).toBeGreaterThanOrEqual(18);
      expect(s).toBeLessThanOrEqual(27);
    }
  });
});

describe("landAdvice", () => {
  it("excludes the command zone from the library", () => {
    const a = landAdvice({ format: "commander", lands: 36, totalCards: 100, commandZone: 1, avgManaValue: 3, cheapRamp: 8 });
    expect(a.librarySize).toBe(99);
    expect(a.openingMean).toBeCloseTo((7 * 36) / 99, 10);
    expect(a.recommended).toBeGreaterThan(30);
  });
});

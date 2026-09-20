import { describe, expect, it } from "vitest";
import { formatDecklist, parseDecklist } from "./deckformat.js";

describe("parseDecklist", () => {
  it("parses plain quantity + name lines", () => {
    const r = parseDecklist("4 Lightning Bolt\n1 Sol Ring\nCounterspell");
    expect(r.map((l) => [l.quantity, l.name, l.board])).toEqual([
      [4, "Lightning Bolt", "main"],
      [1, "Sol Ring", "main"],
      [1, "Counterspell", "main"],
    ]);
  });

  it("handles 4x and set/collector suffixes (Moxfield / Arena)", () => {
    const r = parseDecklist("4x Lightning Bolt (CLB) 187 *F*\n1 Sol Ring (C21) 244");
    expect(r[0]).toMatchObject({ quantity: 4, name: "Lightning Bolt", setCode: "clb", collectorNumber: "187" });
    expect(r[1]).toMatchObject({ quantity: 1, name: "Sol Ring", setCode: "c21", collectorNumber: "244" });
  });

  it("switches boards on headers", () => {
    const r = parseDecklist(`// Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring

SIDEBOARD:
2 Rest in Peace
// Maybeboard
1 Thoughtseize`);
    expect(r.map((l) => [l.name, l.board])).toEqual([
      ["Atraxa, Praetors' Voice", "command"],
      ["Sol Ring", "main"],
      ["Rest in Peace", "side"],
      ["Thoughtseize", "maybe"],
    ]);
  });

  it("treats a blank line after cards as the Arena sideboard separator", () => {
    const r = parseDecklist("4 Lightning Bolt\n\n2 Pyroblast");
    expect(r.map((l) => l.board)).toEqual(["main", "side"]);
  });

  it("returns to main after a headerless commander block (Moxfield export)", () => {
    const r = parseDecklist(`// Commander
1 Atraxa, Praetors' Voice

1 Sol Ring
4 Forest

1 Rest in Peace`);
    expect(r.map((l) => [l.name, l.board])).toEqual([
      ["Atraxa, Praetors' Voice", "command"],
      ["Sol Ring", "main"],
      ["Forest", "main"],
      ["Rest in Peace", "side"],
    ]);
  });

  it("keeps double-faced names with //", () => {
    const r = parseDecklist("4 Delver of Secrets // Insectile Aberration");
    expect(r[0]?.name).toBe("Delver of Secrets // Insectile Aberration");
  });

  it("ignores comments and garbage", () => {
    const r = parseDecklist("# my deck\n// notes\n\n4 Lightning Bolt\n0 Nothing");
    expect(r).toHaveLength(1);
  });

  it("round-trips through formatDecklist", () => {
    const text = "// Commander\n1 Atraxa, Praetors' Voice\n\n4 Lightning Bolt\n\nSIDEBOARD:\n2 Pyroblast\n";
    const parsed = parseDecklist(text);
    expect(parseDecklist(formatDecklist(parsed))).toEqual(parsed.map((l) => ({ ...l, raw: expect.any(String) })));
  });
});

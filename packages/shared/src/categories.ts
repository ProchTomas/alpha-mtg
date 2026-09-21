/**
 * Functional deck categories, derived from Scryfall's community-curated Oracle Tags.
 * The ingest resolves Scryfall's ~4,500-tag hierarchy down to these ids and stores one row
 * per (oracle_id, category), so both the server and the client only ever see these.
 *
 * A card can be in several categories at once (Teferi, Hero of Dominaria is removal, draw
 * and ramp), so the counts deliberately do not sum to the deck size.
 */
export const CARD_CATEGORIES = [
  {
    id: "ramp",
    label: "Ramp",
    description:
      "Extra mana for this turn or later: mana rocks and dorks, rituals, and spells that fetch lands. Searching for a land counts here rather than under Tutors.",
  },
  {
    id: "draw",
    label: "Card draw",
    description: "Cards and abilities that draw you extra cards.",
  },
  {
    id: "removal",
    label: "Removal",
    description:
      "Answers that deal with things one at a time: destroy, exile, bounce, sacrifice, damage. Sweepers are counted under Board clears instead.",
  },
  {
    id: "wipe",
    label: "Board clears",
    description: "Sweepers that hit everything at once, like Wrath of God.",
  },
  {
    id: "interaction",
    label: "Interaction",
    description:
      "Counterspells, plus ways to protect your own permanents — hexproof, shroud, ward, indestructible, protection.",
  },
  {
    id: "tutor",
    label: "Tutors",
    description: "Search your library for a specific card. Land searching is counted as Ramp.",
  },
  {
    id: "recursion",
    label: "Recursion",
    description:
      "Getting cards back out of your graveyard — returning them to your hand or the battlefield, or casting them straight from there.",
  },
] as const;

export type CardCategoryId = (typeof CARD_CATEGORIES)[number]["id"];

export const CATEGORY_IDS: readonly string[] = CARD_CATEGORIES.map((c) => c.id);

export function categoryLabel(id: string): string {
  return CARD_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

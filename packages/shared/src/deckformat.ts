export const BOARDS = ["main", "side", "command", "maybe"] as const;
export type Board = (typeof BOARDS)[number];

export type ParsedDeckLine = {
  quantity: number;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  board: Board;
  raw: string;
};

const HEADERS: Array<[RegExp, Board]> = [
  [/^(\/\/\s*)?(sideboard|side)\s*:?\s*$/i, "side"],
  [/^(\/\/\s*)?(commander|command(er)?\s*zone)\s*:?\s*$/i, "command"],
  [/^(\/\/\s*)?(maybe(board)?|considering)\s*:?\s*$/i, "maybe"],
  [/^(\/\/\s*)?(main(board|deck)?|deck)\s*:?\s*$/i, "main"],
];

// "4 Lightning Bolt" | "4x Lightning Bolt" | "1 Sol Ring (C21) 244" | "Lightning Bolt"
const LINE = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s*(\S+)?)?\s*(?:\*F\*|\*E\*)?\s*$/;

/** Parse the common Arena / Moxfield / MTGO text export formats. */
export function parseDecklist(text: string): ParsedDeckLine[] {
  const out: ParsedDeckLine[] = [];
  let board: Board = "main";
  let blankAfterCards = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      // Arena exports separate main / side with a blank line and no header.
      if (out.length > 0) blankAfterCards = true;
      continue;
    }
    if (line.startsWith("#")) continue;

    const header = HEADERS.find(([re]) => re.test(line));
    if (header) {
      board = header[1];
      blankAfterCards = false;
      continue;
    }
    if (line.startsWith("//")) continue;

    // A blank line ends a headerless block: commander → main (Moxfield), main → side (Arena).
    if (blankAfterCards) {
      if (board === "command") board = "main";
      else if (board === "main") board = "side";
    }
    blankAfterCards = false;

    const m = LINE.exec(line);
    if (!m) continue;
    const quantity = m[1] ? parseInt(m[1], 10) : 1;
    let name = (m[2] ?? "").trim();
    // Strip trailing " #tag" and MTGO-style "[SET]".
    name = name.replace(/\s+#\S+$/g, "").replace(/\s*\[[A-Za-z0-9]{2,6}\]\s*$/, "").trim();
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

    out.push({
      quantity,
      name,
      setCode: m[3]?.toLowerCase(),
      collectorNumber: m[4],
      board,
      raw: rawLine,
    });
  }
  return out;
}

/** Inverse of parseDecklist, in the format Moxfield/Arena accept. */
export function formatDecklist(
  lines: Array<{ quantity: number; name: string; board: Board }>,
): string {
  const by: Record<Board, string[]> = { command: [], main: [], side: [], maybe: [] };
  for (const l of lines) by[l.board].push(`${l.quantity} ${l.name}`);
  const parts: string[] = [];
  if (by.command.length) parts.push("// Commander", ...by.command, "");
  parts.push(...by.main);
  if (by.side.length) parts.push("", "SIDEBOARD:", ...by.side);
  if (by.maybe.length) parts.push("", "// Maybeboard", ...by.maybe);
  return parts.join("\n").trim() + "\n";
}

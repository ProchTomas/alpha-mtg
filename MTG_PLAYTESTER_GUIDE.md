# Playtest — build guide

A web app for friendly Magic: The Gathering playtesting. Deck building and storage like Moxfield,
plus a real-time multiplayer table where two or more people can shuffle up and play.

**There is no rules engine.** The server never decides what is legal. It moves cards between zones,
tracks numbers, and keeps hidden information hidden. Players resolve the game by talking to each
other, exactly like playing across a kitchen table.

---

## 1. Scope

### In scope

**Account & profile**
- Email + password sign-up, session cookie.
- Public profile page: display name, avatar, deck list, "playing since" date.
- Friends: send request, accept, list. Friends appear in an invite picker when creating a lobby.

**Decks**
- Create / rename / delete decks.
- Paste-import a decklist in the standard text format (`4 Lightning Bolt`, `1 Sol Ring`, optional
  `SIDEBOARD:` / `// Commander` headers).
- Autocomplete card search while editing.
- Visual grid view (card images) and compact list view.
- Mana curve, color pips, card-type breakdown.
- Public / unlisted toggle; a shareable URL.
- Commander / companion slot (just a flag on a deck card — no rules enforcement).

**Table (the game)**
- Create a lobby, get a join code / link, 2–6 seats, spectators allowed.
- Each player picks one of their decks, then the server shuffles it into their library.
- Zones per player: library, hand, battlefield, graveyard, exile, command zone, "face-down aside"
  (for cards set aside by effects).
- Actions: draw top, draw N, draw a random card from library, mill, shuffle, search library
  (private view), put a card on top / on bottom / Nth from top, move any card between any two zones,
  tap/untap, flip face-down, transform, attach (visual grouping only), clone, create a token,
  set/adjust counters on a permanent, free-form drag positioning on your own battlefield half.
- Life totals with +1/-1/+5/-5 and direct edit; poison, energy, experience, and arbitrary named
  counters per player.
- Dice roller, coin flip, "random opponent" picker — all logged.
- Untap-step button: untaps everything you control.
- Turn marker and phase is *not* enforced; just a "pass turn" button that moves an indicator.
- Game log: every action, with hidden details redacted for other players.
- Undo: each player can undo their own last action (server keeps a short per-player action stack).
- Mulligan: London mulligan helper — redraw 7, then choose N to put on the bottom.

### Explicitly out of scope
- Any legality, timing, priority, stack, or triggered-ability logic.
- Deck legality checking against formats.
- Prices, collection tracking, trading.
- Mobile-first layout. Make it work on a tablet; the table is a desktop experience.

---

## 2. Stack

Keep it small and boring. One repo, one deployable process plus Postgres.

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Fast dev loop, no framework ceremony |
| Styling | Tailwind CSS v4 | Design tokens live in CSS vars, see §7 |
| State | Zustand for local UI, plain reducer for game state | The game state is server-authoritative; the client just renders snapshots and applies patches |
| Drag & drop | `@dnd-kit/core` | Works with keyboard, unlike HTML5 DnD |
| Backend | Node 22 + Fastify + `ws` | HTTP API and WebSocket in one process |
| DB | SQLite (`better-sqlite3`) + Drizzle ORM | One file, no service to run. See §11 — Postgres is fine too, but it isn't needed here |
| Auth | Session cookie, `argon2` hashes, sessions table in Postgres | No third-party auth dependency |
| Validation | Zod, shared between client and server | One schema for every WS message |
| Deploy | One self-hosted box, Caddy in front | One process means no cross-node game state problem. See §10 |

Monorepo layout:

```
/apps/web        React client
/apps/server     Fastify + ws
/packages/shared Zod schemas, TS types, game reducer (imported by both)
/scripts         Scryfall ingest
```

The **game reducer lives in `/packages/shared`** and is imported by both sides. The server runs it as
the source of truth; the client runs the same code optimistically for instant feedback and rolls back
if the server's version number disagrees. Write it as a pure function:

```ts
reduce(state: GameState, action: GameAction, actorId: PlayerId): GameState
```

No randomness inside the reducer. Shuffles and random draws take their entropy from the action
payload (the server generates a seed or the resulting permutation and puts it in the broadcast
action), so every client replays to an identical state.

---

## 3. Card data

Use **Scryfall bulk data**. Do not call their API at request time.

### Ingest script (`/scripts/ingest-cards.ts`)

1. `GET https://api.scryfall.com/bulk-data` with a descriptive `User-Agent`
   (e.g. `Playtest/1.0 (+https://yourdomain; you@example.com)`).
2. Find the entry with `type === "default_cards"` and follow its `download_uri`.
   - `oracle_cards` is smaller (one row per unique card) but loses alternate printings and art.
     Use `default_cards` so people can pick the printing they like; it's ~500 MB of JSON.
3. Stream-parse it (`stream-json` or `clarinet`) — do not `JSON.parse` the whole file.
4. Filter out `layout === "art_series"`, digital-only (`digital === true`) if you want paper only,
   and memorabilia sets (`set_type === "memorabilia"`).
5. Upsert into `cards` (see §4). Store the raw `card_faces` array as JSONB for double-faced cards.
6. Run it on deploy and then weekly via cron.

### Images

Store `image_uris` as JSON and read:

- `small` (146×204) — deck list rows, hand thumbnails on small screens
- `normal` (488×680) — battlefield, hand, hover preview
- `art_crop` — deck cover art, profile banners
- `png` — only when you need transparent corners

For double-faced cards, images live under `card_faces[n].image_uris`, not on the card object.

Don't hotlink and don't mirror the whole set — serve them through a lazy local cache, see §10.

**Terms you must respect** (Wizards Fan Content Policy, via Scryfall):
don't paywall the data, don't crop or cover the copyright line and artist name, don't stretch,
recolor, or watermark card images, and don't imply endorsement by Scryfall or Wizards. Put a short
attribution line in the footer.

### Search

Index locally for autocomplete rather than proxying Scryfall — SQLite FTS5, see §10 (or a GIN
trigram index if you stay on Postgres).

Rank by: exact prefix match, then trigram similarity, then whether it's the newest printing.
That's enough — full Scryfall query syntax (`t:creature cmc<=3`) is a nice-to-have for v2.

---

## 4. Database schema

```sql
-- Cards (from Scryfall, read-only at runtime)
cards (
  id uuid primary key,              -- scryfall id
  oracle_id uuid not null,
  name text not null,
  set_code text not null,
  collector_number text not null,
  type_line text,
  oracle_text text,
  mana_cost text,
  cmc numeric,
  colors text[],
  color_identity text[],
  layout text,
  image_uris jsonb,
  card_faces jsonb,
  released_at date,
  search_tsv tsvector
)
-- one row per printing; oracle_id groups reprints

users (id, email, password_hash, display_name, handle unique, avatar_url, created_at)
sessions (id, user_id, expires_at)

friendships (requester_id, addressee_id, status, created_at)  -- status: pending|accepted|blocked
-- store one row per pair, ordered so (a,b) and (b,a) can't both exist

decks (id, user_id, name, description, format, visibility, cover_card_id, created_at, updated_at)
deck_cards (deck_id, card_id, quantity, board)  -- board: main|side|command|maybe
-- primary key (deck_id, card_id, board)

games (id, host_id, join_code unique, status, state jsonb, version int, created_at, ended_at)
game_players (game_id, user_id, seat, deck_id, joined_at)
```

`games.state` as a JSONB blob is intentional: it's a single document, it's only ever read and written
whole, and it lets you reload a game after a server restart. Persist it on a debounce (every ~2 s of
activity) rather than on every action. Keep the live copy in memory.

---

## 5. Game state & protocol

### State shape

```ts
type CardInstance = {
  iid: string;          // instance id, unique within this game
  cardId: string;       // scryfall id
  ownerId: PlayerId;    // who brought it
  controllerId: PlayerId;
  tapped: boolean;
  faceDown: boolean;
  flipped: boolean;     // transformed / back face shown
  counters: Record<string, number>;
  x?: number; y?: number;   // battlefield position, 0..1 relative to own half
  attachedTo?: string;      // iid, visual only
  note?: string;
};

type PlayerState = {
  id: PlayerId;
  seat: number;
  life: number;
  counters: Record<string, number>;   // poison, energy, whatever
  zones: {
    library: CardInstance[];   // ordered, index 0 = top
    hand: CardInstance[];
    battlefield: CardInstance[];
    graveyard: CardInstance[];  // ordered, index 0 = top
    exile: CardInstance[];
    command: CardInstance[];
    aside: CardInstance[];
  };
  connected: boolean;
};

type GameState = {
  id: string;
  version: number;
  players: Record<PlayerId, PlayerState>;
  turnPlayer: PlayerId;
  turnNumber: number;
  log: LogEntry[];
};
```

### Hidden information — the important part

The server holds the full state. Before sending to a client, it runs `redactFor(state, viewerId)`:

- **Your own hand**: full objects. **Other hands**: replaced by `{ iid, faceDown: true }` — same
  length, no card ids, so the client can render card backs and animate correctly.
- **Every library**: replaced by an array of `{ iid }` only, in *shuffled-out* order — actually, send
  just a count plus the iids in a random order that changes on every shuffle, so nobody can infer the
  order by diffing snapshots. Never send `cardId` for a library card to anyone, including its owner.
- **Face-down battlefield cards**: `cardId` stripped for everyone except the controller.
- **Exile**: face-up exile is visible to all; face-down exile follows the battlefield rule.
- **Search-library results** go in a targeted message to the searcher only, never in the broadcast.

Do the redaction on the server, always, per recipient. Never send full state and hide it in the UI —
that's one devtools inspection away from cheating, and this is exactly the kind of thing friendly
playtesters will notice and lose trust over.

### Transport

WebSocket at `/ws?game=<id>`, authenticated by the session cookie.

Client → server:
```ts
{ t: "action", v: number, action: GameAction }   // v = version client believes it's at
{ t: "ping" }
```

Server → client:
```ts
{ t: "snapshot", state: RedactedGameState }      // on join, and after any desync
{ t: "patch", v: number, action: GameAction, redacted: Partial<State> }
{ t: "private", payload: ... }                   // search results, mulligan hand
{ t: "reject", v: number, reason: string }       // client rolls back, requests snapshot
```

Version handling: server increments `version` on every accepted action. If a client sends an action
with a stale `v`, the server still applies it (there's no legality to conflict with) but the client
must reconcile against the returned version. On any mismatch the client asks for a full snapshot —
snapshots are small enough that this is fine.

### Action list

Keep it flat and explicit. This is the whole game:

```
MOVE_CARD      { iid, from: Zone, to: Zone, position: "top"|"bottom"|number, faceDown? }
MOVE_MANY      { iids[], from, to, position }
DRAW           { count }
DRAW_RANDOM    { count }          // from anywhere in library
MILL           { count }
SHUFFLE        { permutation[] }  // server-generated
SEARCH_START   { }                // server replies privately with the full library
SEARCH_END     { }                // logs "searched their library"
SCRY           { toTop[], toBottom[] }
TAP            { iids[], tapped }
UNTAP_ALL      { }
FLIP           { iid, faceDown }
TRANSFORM      { iid }
SET_COUNTER    { iid, name, value }
ADJUST_COUNTER { iid, name, delta }
CREATE_TOKEN   { cardId?, name, typeLine, power, toughness, colors[] }
CLONE          { iid }
SET_LIFE       { playerId, value }
ADJUST_LIFE    { playerId, delta }
SET_PLAYER_COUNTER { playerId, name, value }
MOVE_ON_BATTLEFIELD { iid, x, y }
ATTACH         { iid, targetIid | null }
PASS_TURN      { }
ROLL           { sides, count, results[] }
MULLIGAN       { keep: number }
NOTE           { iid, text }
UNDO           { }
```

Anyone can act on anyone's cards — it's a friendly playtest and sometimes your opponent needs to
sacrifice your creature. Every action is attributed in the log: "Tomas moved Bloodghast (Anna's) from
battlefield to graveyard." Trust plus visibility beats permissions here.

---

## 6. Screens

```
/                     landing — join code box, "start a table", latest decks
/login /register
/u/:handle            profile: decks, friends, recent games
/decks                your decks
/decks/new            paste-import or start empty
/decks/:id            deck view (grid / list toggle, stats sidebar)
/decks/:id/edit       search + add, quantity steppers
/friends              requests in / out, list
/table/:joinCode      lobby → game
```

### Table layout

```
┌──────────────────────────────────────────────────────────────┐
│  opponent life / counters / zone counts       [log ▸]        │
│  ┌────────────────── opponent hand (backs) ─────────────────┐│
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│      opponent battlefield (their positions, mirrored)        │
│ ─────────────────────────── table line ───────────────────── │
│      your battlefield (drag freely)                          │
│                                                              │
│  ┌─ your hand (fanned, hover to lift) ───────────────────┐   │
│  └────────────────────────────────────────────────────────┘  │
│  [lib 53] [gy 2] [exile 0] [cmd 1]     life 20  ⊖ ⊕   pass  │
└──────────────────────────────────────────────────────────────┘
```

With 3+ players, stack opponents' halves vertically in a scrollable column on the left and keep your
own half fixed at the bottom. Don't try to draw a round table.

Interactions:
- Right-click / long-press a card → context menu with every legal move for its current zone.
- Double-click a battlefield card → tap/untap. Double-click a hand card → play to battlefield.
- Drag between zone piles. Zone piles are click-to-open stacks, not scattered cards.
- Hover any card anywhere → large preview in a fixed corner. This is the single most-used feature in
  every playtester ever built; make it instant and never let it flicker.
- Keyboard: `D` draw, `U` untap all, `S` shuffle, `Space` pass turn, `Esc` close overlay.

---

## 7. Visual direction

The subject is a card table. The cards are already loud — 80 % of the screen is somebody else's
illustration and five colors of mana. So the interface around them is quiet, matte, and low-chroma,
and the only saturated things on screen are the cards themselves.

**Palette** — a dark, slightly green-grey felt, not a neutral dark-mode grey:

```css
--felt-900: #1B211F;   /* app background */
--felt-800: #232A27;   /* panels, zone piles */
--felt-700: #2E3733;   /* raised surfaces, hover */
--chalk:    #E6E3DA;   /* primary text */
--chalk-dim:#9BA39D;   /* secondary text, counts */
--ink:      #12100D;   /* card shadow, table line */
--brass:    #C8A56B;   /* the single accent: active turn, your seat, focus ring */
```

Brass appears in exactly three places: the turn indicator, the focus ring, and the primary button.
Nowhere else.

**Type** — one family with real character for the chrome, one for numbers.
`Fraunces` (variable, `opsz` and `SOFT` axes) for headings, deck names, and the landing page;
`Inter` for UI text; tabular-lining numerals for life totals and zone counts. Life totals are the
biggest type on the screen after card names — set them at 40 px+ with `font-variant-numeric:
tabular-nums` so they don't jitter when they change.

**Structure** — the table line separating your half from your opponent's is a single 1 px `--ink`
rule with a soft shadow above it, nothing more. Zone piles are stacked card backs with the count
overlaid, not labeled boxes. Cards get `border-radius: 4.75%` (the real proportion of a Magic card
corner) and a tight shadow, never a glow.

**Motion** — cards animate between zones along a straight line in 180 ms with a slight scale dip.
That's the one orchestrated moment. No hover transitions on panels, no entrance animations, no
gradient washes. Respect `prefers-reduced-motion` by cutting to the destination.

Card aspect ratio is `5:7` (63×88 mm). Bake it in as a CSS variable and never let a card stretch.

---

## 8. Build order

Ship each step working before starting the next.

1. **Repo + schema.** Drizzle migrations, Postgres in Docker Compose, empty Fastify server.
2. **Card ingest.** Run the script, verify ~100k rows, build the search endpoint, render a search box
   that shows card images. Nothing else works until this does.
3. **Auth + profile.** Register, log in, session cookie, `/u/:handle`.
4. **Decks.** Create, paste-import, list view, grid view, stats sidebar. This is a complete, useful
   product on its own — get it good before touching WebSockets.
5. **Shared reducer.** Write `reduce()` plus a test suite that plays a scripted 20-action game and
   asserts the final state. No network involved.
6. **Solo table.** One player, one deck, all zones and actions working locally against the reducer.
   Debug the whole card-interaction layer with no multiplayer in the way.
7. **Multiplayer.** WebSocket, server-authoritative reducer, redaction, snapshot/patch, reconnect.
   Test with two browser profiles side by side.
8. **Lobby & friends.** Join codes, seat selection, deck picking, friend invites.
9. **Polish.** Undo, mulligan helper, dice, log filtering, keyboard shortcuts.

---

## 9. Things that will bite you

- **Double-faced cards.** `image_uris` is on `card_faces[n]`, not the card. Handle `transform`,
  `modal_dfc`, `meld`, `adventure`, `split`, and `flip` layouts in one place —
  `getFaceImages(card): {front: string, back?: string}` — and call it everywhere.
- **Token cards.** Scryfall has real token entries (`layout: "token"`, set type `token`). Index them
  so people can search for a "1/1 white Soldier" instead of hand-rolling every token.
- **Reconnects.** A dropped player must be able to rejoin the same seat and get a fresh snapshot.
  Key seats to `user_id`, not to socket id.
- **Library order after shuffle.** Regenerate the client-visible iid ordering on every shuffle, or a
  player who diffs two snapshots learns the deck order.
- **Optimistic UI rollback.** If you animate a card into a zone and the server rejects, the snap-back
  is jarring. Since nothing can be rejected on legality grounds, rejections should be rare — but
  handle them by re-snapshotting rather than reversing animations.
- **Big decks.** A 100-card commander library rendered as 100 DOM nodes in a hidden stack will hurt.
  Render zone piles as at most 3 stacked backs plus a count.
- **`games.state` growth.** Cap `log` at the last 500 entries in the persisted blob; keep the full
  log in a separate append-only table if you want game history.

---

## 10. Running this free, with almost no third parties

Hard constraint: no paid services, and as few external runtime dependencies as possible. The app
should be one process, one data file, one directory of images, behind one reverse proxy.

### What stays

- **Scryfall bulk data.** Free, no API key, no account. You download it on a cron and then never
  talk to them again at runtime (see images below). This is the one external dependency worth
  keeping — nobody else gives you 100k cards for nothing.
- **A TLS certificate.** Caddy with automatic Let's Encrypt. Free, and you can't avoid a CA.

That's the list. Everything below gets removed or self-hosted.

### Database: drop Postgres, use SQLite

Nothing in this app needs Postgres. There's one writer process, the working set is a few hundred MB,
and the heaviest query is a name autocomplete. SQLite in WAL mode handles it and removes a whole
service from your deployment.

- `better-sqlite3` is synchronous and faster than a network round trip to Postgres on the same box.
- Replace `pg_trgm` with **FTS5** for card search:

```sql
CREATE VIRTUAL TABLE cards_fts USING fts5(
  name, type_line, oracle_text,
  content='cards', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```
  Rank with `bm25(cards_fts)`, and for prefix autocomplete query `name MATCH 'light*'`. Add a plain
  `CREATE INDEX cards_name_nocase ON cards(name COLLATE NOCASE)` for exact-prefix ranking.
- Replace `jsonb` columns with `TEXT` holding JSON; SQLite's `json_extract` works if you ever need
  to query inside them, which you mostly won't.
- Backups are `sqlite3 data.db ".backup backup.db"` on a cron. No pg_dump, no roles, no tuning.

If you'd rather stay on Postgres because you already know it, keep it — just run it in the same
Docker Compose file, not as a hosted database.

### Images: cache locally instead of hotlinking

Hotlinking `*.scryfall.io` costs nothing and is allowed, but it makes every page load depend on
someone else's uptime and leaks your users' IPs to them. Better: **lazy-cache on first use.**

```
GET /img/:scryfallId/:size
  → if /var/playtest/img/:size/:id.jpg exists, sendFile
  → else fetch from scryfall.io, write to disk, sendFile
  → serve with Cache-Control: public, max-age=31536000, immutable
```

Only cards people actually put in decks get downloaded. A few hundred decks worth of distinct cards
is maybe 2–5 GB at `normal` size, which is nothing on any VPS disk. The full 100k-card mirror would
be ~30 GB — don't pre-fetch, let it fill in.

Rate-limit your own fetcher to a few per second and set the `User-Agent`. This is polite, and it also
means Scryfall being down only affects cards nobody has ever used.

### Fonts: self-host

Don't link Google Fonts — it's a third-party request on every page. Download the variable `.woff2`
files, put them in `/apps/web/public/fonts`, and declare them yourself:

```css
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}
```
Both Fraunces and Inter are SIL Open Font License, so self-hosting is explicitly permitted. Same for
any icon set — use inline SVG, not an icon font CDN.

### Auth without an email provider

Sending email means SMTP means a third party (or a mail server, which you don't want to run). So:

- **No email verification.** Email is just a login identifier. Don't send anything to it.
- **No emailed password reset.** At registration, generate a 24-character recovery code, show it
  once, store only its argon2 hash. Reset = paste the recovery code. This is how you avoid the entire
  transactional-email problem, and for a playtest site among friends it's completely adequate.
- Better still: let people sign in with **handle + password**, and make email optional and unused.
- Sessions in the database, `HttpOnly; Secure; SameSite=Lax` cookie. No JWT, no auth SaaS, no OAuth.

### Everything else you'd normally reach for, and its replacement

| Usual service | Instead |
|---|---|
| Pusher / Ably / Supabase Realtime | Your own `ws` server — you already have one process |
| S3 / R2 for avatars | Write to a local `uploads/` dir, cap at 256 KB, re-encode to WebP with `sharp`. Or skip uploads and generate a deterministic identicon from the user id |
| Sentry | `pino` to a rotating log file, plus a `/health` endpoint |
| Plausible / GA | Nothing. You don't need analytics for a friends' playtest site |
| Redis | An in-memory `Map` of live games. One process means no shared cache needed |
| Cloudflare CDN | Caddy serving static files with long cache headers |
| Docker Hub pulls at deploy | Build locally, `docker save` / `docker load`, or just run Node directly with systemd |

### Where it runs

Cheapest honest options, in order:

1. **Your own machine + Cloudflare Tunnel or a WireGuard VPS relay** — genuinely zero cost if you
   have a box that's on anyway. Cloudflare Tunnel's free tier avoids port forwarding and gives you
   TLS, at the cost of one more third party in the path.
2. **Oracle Cloud Always Free** — 4 ARM cores / 24 GB RAM, permanently free, no card charge. Massive
   overkill for this and the most common genuinely-free VPS. Capacity in some regions is scarce.
3. **Hetzner CX22** — ~€4/month, boring and reliable, if you'd rather pay a token amount than fight
   for free-tier capacity.

A domain is the only unavoidable cost (~$10/year). A free `duckdns.org` or `nip.io` subdomain works
if you want the bill to be exactly zero, though Let's Encrypt rate-limits shared domains like DuckDNS
more aggressively.

### Resulting deployment

```
systemd unit: node /apps/server/dist/index.js
  ├── data.db              SQLite, WAL mode
  ├── img/                 lazily cached card images
  ├── uploads/             avatars
  └── public/              built React bundle + self-hosted fonts
Caddy → :443 → localhost:3000
cron: weekly scryfall ingest, nightly sqlite backup
```

One process, one file, one directory. Nothing to renew, nothing to be billed for, and the only thing
that can break from the outside is a weekly download that fails safely.

---

## 11. Attribution

Footer, every page:

> Card data and images from Scryfall. Magic: The Gathering is © Wizards of the Coast. This is
> unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.

And keep it free to use — Scryfall's terms forbid putting their data behind any payment, survey, or
required signup.

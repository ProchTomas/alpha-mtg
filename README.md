# Playtest

Friendly Magic: The Gathering playtesting on the web: deck building + a real-time multiplayer table.
No rules engine — the server moves cards and keeps hidden information hidden; players do the rest.

Design and scope: [MTG_PLAYTESTER_GUIDE.md](./MTG_PLAYTESTER_GUIDE.md).

## Layout

```
apps/web         React 19 + Vite + Tailwind v4
apps/server      Fastify + ws + SQLite (better-sqlite3, Drizzle)
packages/shared  Zod schemas, TS types, game reducer — imported by both
scripts/         Scryfall ingest
data/            SQLite db, cached card images, uploads (gitignored)
```

## Getting started

Requires Node ≥ 22. npm workspaces, no pnpm needed.

```sh
npm install
npm run db:migrate     # creates data/data.db (+ FTS5 index)
npm run ingest         # downloads Scryfall bulk data (~80 MB gz), ~100k cards, ~15 s
npm run dev:server     # http://127.0.0.1:3000
npm run dev:web        # http://localhost:5173  (proxies /api, /img, /ws to the server)
```

Other scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run db:generate` (after editing
`apps/server/src/db/schema.ts`).

Copy `.env.example` to `.env` to change the app name, port, data directory or contact email
(the contact email goes into the `User-Agent` sent to Scryfall, as they ask).

## Status

Build order from the guide §8:

- [x] 1. Repo + schema
- [x] 2. Card ingest + search + image cache
- [x] 3. Auth + profile
- [x] 4. Decks
- [x] 5. Shared reducer + tests
- [x] 6. Solo table
- [ ] 7. Multiplayer
- [ ] 8. Lobby & friends
- [ ] 9. Polish

## Notes that differ from the guide

- Scryfall bulk data is now shipped as gzipped JSONL (`jsonl_download_uri`), not a JSON array.
  The ingest streams gunzip → readline; no `stream-json`.
- Cards carry `edhrec_rank` and `promo` from Scryfall; search uses popularity as a tiebreaker and
  prefers plain set printings (not Secret Lair / The List / promo) as the representative printing.
- `better-sqlite3` must be ≥ 12 for Node 24 prebuilt binaries.

## Attribution

Card data and images from Scryfall. Magic: The Gathering is © Wizards of the Coast. This is
unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
Fonts: Fraunces and Inter, SIL Open Font License (see `apps/web/public/fonts`).

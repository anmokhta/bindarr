# Bindarr — project aspects

Orientation for the self-hosted card collection and binder planner.
Product status and the route map live in [docs/ROADMAP.md](docs/ROADMAP.md).
How to run it lives in [README.md](README.md).

## Functional purpose

Bindarr keeps a bank of cards and places them into named binders that match real physical sheets, so pockets can be planned before anything is sleeved.

The task bar is three areas, plus Settings.

**Binders** model physical binders. Layouts are 3×3 (9 pockets), 2×2 (4), and 4×3 (12). Size is counted in double-sided sheets: a 3-sheet 2×2 binder is 6 sides and 24 slots. The planner shows Page 1 alone, then two-page spreads (2–3, 4–5, …). Binders can be created, renamed, duplicated, archived, restored, and permanently deleted. Sheet count can shrink only when that would not drop cards.

**Bank** is one card table with independent have and want flags. Bank → Cards is the have view; Bank → Wishlist is the want view. Wishlist cards stay in binders but render grayscale until marked obtained. Cards can carry many tags and one collection. Import and export is JSON and CSV, with dedupe. Games in the model are Pokémon, Magic, Yu-Gi-Oh!, Lorcana, and One Piece, plus a Misc bank. Only Pokémon lookup works today. Add and edit use a modal.

**Extras** is Artist Search: TCGdex illustrator results in-app, with artofpkm as an external secondary link. Artist icon buttons elsewhere deep-link here with `?artist=` prefilled.

**Settings** covers theme, visible games, nav style, the API call log (1h through 30d counts), a one-shot migrate for legacy `images.pokemontcg.io` URLs, and a version check against GitHub Releases.

## UI

There is no component library. Styling is one stylesheet (`apps/web/src/styles.css`) with CSS variables: paper, vinyl green, and gold, in light and dark. Type is Fraunces for titles and IBM Plex Sans / Mono for UI and metadata.

Navigation is a two-level task bar (Bank / Binders / Extras) plus a gear that opens Settings. Subsection style is a user setting: segmented control (default), left sidebar, or icon rail, switched under Settings → Nav styles. Game filters stay as pill chips regardless of that setting. The planner is a pocket grid with a sticky editor sidebar. The page-width slider is stored in the browser, not on the server. Write-up: [docs/ui-subsection-nav.md](docs/ui-subsection-nav.md).

## Frontend UX

The web app is React 19 on Vite, with a small custom history router in `apps/web/src/router.ts` (no React Router). Every screen has a real URL, and older paths redirect.

Behavior that matters when changing the UI:

- Planner state autosaves to the server, with a loading / saved / saving / error indicator.
- Pockets support drag-to-swap and click-to-place from the bank (Escape cancels place mode).
- A filled pocket is an instance of a bank card (`bankId` required). Display resolves from the bank; the pocket’s own field is the local `tag`.
- First load in a browser that still has the old single-file planner offers to import `localStorage` (`binderPlannerState_v1`).
- Bank forms and filters already use tags and collections. The Tags and Collections screens are read-only previews, including disabled rule, bulk-apply, slot-label, and Optimize panels.

Almost all app state lives in `App.tsx` and is passed into page components. Shared types and validation come from `@bindarr/shared`.

## Backend and data

Fastify serves the API and, in production, the built UI. SQLite (`better-sqlite3`, WAL mode) is a single file, `./data/bindarr.db` in Docker and local dev.

| Table | What it holds |
| --- | --- |
| `planner_state` | One JSON document for every binder |
| `bank_items` | One JSON document per card |
| `app_settings` | Visible games and nav style |
| `lookup_cache` | Pokémon TCGdex responses |
| `api_calls` | Every upstream lookup attempt |

API surface: `/api/state`, `/api/bank` (CRUD plus import), `/api/lookup`, `/api/lookup/artist`, `/api/migrate/pokemontcg-images`, `/api/calls`, `/api/settings`, `/api/health`, `/api/version/latest`.

A file lock (`apps/server/src/write-lease.ts`) lets only one process write the database. A second instance opens read-only and writes return HTTP 423. Electron’s first run can create a new database or point at an existing one. There is no user authentication. The README expects a trusted LAN or a reverse proxy with auth and TLS.

Pokémon lookup uses `@tcgdex/sdk` against `api.tcgdex.net` with retry, a SQLite cache, and stale fallback. Each attempt is logged. No API key is required.

## Tech stack and how it ships

npm workspaces, Node 20+:

- `apps/web` — Vite, React 19, TypeScript
- `apps/server` — Fastify 5, better-sqlite3
- `packages/shared` — Zod schemas and planner math
- `apps/desktop-electron` — Electron 35 shell that starts the same server locally and stores the DB in the OS app-data folder

Docker Compose is the recommended run (`localhost:8080`, `./data` mounted). `npm run dev` runs the API on 8080 and Vite on 5173, with `/api` proxied. Tests are Vitest for units and Playwright for navigation, binders, bank, wishlist, and sheets. GitHub Actions runs CI and unsigned desktop builds (dmg, NSIS exe, AppImage, deb). `v*` tags publish desktop releases. Electron was chosen over Tauri so the Node and SQLite backend stays one runtime; that decision is in [docs/adr/0001-desktop-shell.md](docs/adr/0001-desktop-shell.md).

## Data contract

Planner state, bank cards, and settings are JSON documents checked by Zod in `packages/shared`. The database stores those blobs; columns are only `id`, `game`, and timestamps. Binder math (sheet count, spreads, safe resize, legacy two-bucket import) lives in that package, and both the API and the UI call it. A change to a card or binder shape has to land there first, or the client and server will disagree about what is valid.

## Save and sync

Planner and bank do not save the same way. The planner is one document: the UI updates locally, waits 400ms, then `PUT /api/state`. Closing the tab flushes that save with `keepalive`. The server replaces the whole document. Two browsers on the same server overwrite each other; there is no version check or merge. Bank cards are separate rows (`POST` / `PUT` / `DELETE`), so one card edit does not replace the rest of the bank. A second Bindarr process on the same file gets the write lease’s read-only mode and receives HTTP 423 on writes.

## Physical model

Pages are sides of double-sided sheets. An odd side count is padded with a blank back. Shrinking refuses to drop a side that still has cards. Spreads are Page 1 alone, then pairs. Sheet count is capped at 200. Those rules are why the planner cannot treat pages as a free-form list.

## Card identity

A filled pocket is always a bank card instance (`bankId`). Card fields (name, set, number, image, artist, have/want, …) live on the bank item; the UI resolves them live via `resolveSlotView`. The pocket stores `bankId` plus a pocket-local `tag` (denormalized name/note/image may still sit in slot JSON for older data). Editing the bank updates every pocket that links to it. Orphans (deleted bank row) show a missing-card state, not a freeform editor. Have and want are independent flags on the same bank row. Import merges on `apiId` within a game, or on name + set + number when there is no `apiId`. Tags are a list; collection is a single string. That split is the open question before the Tags and Collections manager, the rules engine, and slot labels (a tag or collection attached to a slot, page, or section so placed cards inherit it). See [docs/labels-and-optimize.md](docs/labels-and-optimize.md).

## Outside data

Pokémon lookup goes through the server to TCGdex (`@tcgdex/sdk`). The proxy retries, caches successes, and serves the cache when the upstream is down. Card images are remote TCGdex asset URLs (`…/low.webp`), not files in the database. Settings can rewrite legacy `images.pokemontcg.io` bank/pocket URLs to TCGdex assets. Every attempt is written to `api_calls` and shown under Settings → Logs; rows are kept with no pruning yet. A version check calls the GitHub releases API for `anmokhta/bindarr`. Artist Search uses the same stack filtered by illustrator; artofpkm is an external link only. Notes: [docs/research/artist-search.md](docs/research/artist-search.md).

## Trust boundary

The server has no accounts. Anyone who can reach the port can read and write the collection. Docker runs as the `node` user. The intended setup is a trusted LAN, or a reverse proxy that adds auth and TLS.

## Where preferences live

Theme and page-size scale stay in that browser’s `localStorage`. Visible games and nav style are one server-wide settings row, so every browser on that Bindarr shares them. The old single-file planner is offered as a one-time import only when the server database has never been written.

## Backup and growth

The backup unit is the `./data` folder (database plus SQLite WAL files). There is no in-app export of the whole app yet. The call log and lookup cache grow inside that same file.

## Packaging

`better-sqlite3` is a native addon. Docker and CI install Python and a C++ compiler to build it; the Electron package rebuilds it against Electron’s Node ABI. Desktop builds are unsigned. The desktop app, Docker, and `npm run dev` are three ways to open the same kind of database, and two of them must not write one file at once.

## Verification

Shared tests cover binder geometry and parsing. Server tests cover the API, import dedupe, lookup cache, and the write lease. Playwright covers navigation, binders, sheets, bank, wishlist, and nav styles. CI also builds the Docker image and checks `/api/health` and `/api/state`.

## Still open

From [docs/ROADMAP.md](docs/ROADMAP.md), in order:

1. Tags and Collections manager (create, rename, delete, with card review).
2. Rules engine (preview, then bulk-apply; optional auto-apply later).
3. Artist Search through the lookup proxy.
4. Named binder sections with filled/total rollups.
5. Slot and section labels.
6. Organize → Optimize: a before/after diff that writes nothing until confirmed.
7. Lookups for the other games, in-app backup and restore, call-log pruning, and signed desktop builds.

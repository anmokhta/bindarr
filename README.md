# Bindarr

**Card management and binder organizing.**

Plan which cards go in which binder pockets before physically sleeving them.
Binders are real named binders with 3×3, 2×2, or 4×3 (12-pocket) layouts,
sized in physical double-sided sheets: a 3-sheet 2×2 binder holds 24 cards.
The planner shows Page 1, then two-page spreads, with a page-size slider.
Cards live in one bank with independent have/want flags — Bank → Cards is
the have view, Bank → Wishlist the want view (wishlist cards render in
black & white in binders until marked obtained). Both views import/export
JSON/CSV (including PriceCharting collection CSV exports). Bank → Tags and
Bank → Collections preview the tags/collections
already in use; management and auto-tag rules are planned (see
[docs/ROADMAP.md](docs/ROADMAP.md)). Includes Pokémon TCG lookup via
pokemontcg.io, drag-to-swap pockets, and automatic saving. External API
calls are logged under Settings → Calls (`/settings?tab=calls`); rows are
kept indefinitely for now — prune entries older than 90 days if it grows.

Bindarr is a self-hosted web app: a Fastify + SQLite server serves the
React frontend and stores all binder data server-side, so you can use it from
any browser on your network and back up one database file.

## Quickstart (Docker — recommended)

```sh
docker compose up -d --build
```

Open <http://localhost:8080>. Data lives in the gitignored host folder
`./data/` (bind-mounted to `/data` in the container as `bindarr.db`). It
survives restarts, rebuilds, and `docker compose down` / `down -v`.

Useful commands:

```sh
mkdir -p data            # created automatically on first run if missing
docker compose logs -f   # logs
docker compose down      # stop (./data kept)
PORT=9000 docker compose up -d   # different host port
```

### Backup / restore

```sh
# backup
tar czf bindarr-data.tar.gz -C data .
# restore (with Bindarr stopped)
mkdir -p data && tar xzf bindarr-data.tar.gz -C data
```

> **Security:** Bindarr has **no built-in authentication**. Run it on a
> trusted LAN, or put a reverse proxy with auth/TLS (Caddy, Traefik, …) in
> front. Do not expose port 8080 directly to the public internet.

## Local development (no Docker)

Requires Node ≥ 20 (22 recommended) and, for `better-sqlite3`, Python 3 +
a C++ compiler.

```sh
npm install
npm run dev        # server on :8080 (API + state), web dev server on :5173
```

Open <http://localhost:5173> — Vite proxies `/api` to the server. Local data
goes to `./data/bindarr.db` (override with `DATABASE_PATH`).

Other scripts: `npm run build`, `npm start` (production server serving the
built UI on `PORT`, default 8080), `npm test`, `npm run typecheck`.

## Desktop app (Electron)

The same server + UI packaged for Linux/Mac/Windows. On first launch you
choose **Create new database** (standard OS app-data path) or **Use existing
database…** (open a `bindarr.db` in place — e.g. Docker `./data/bindarr.db`).

Only one Bindarr process may write a given DB file at a time. A second
instance (Docker + Electron sharing the same file) opens **read-only** until
the writer exits (or the lock goes stale); Settings and the main UI show a
read-only banner. Health checks soft-promote when the lease is free. If you
are stuck read-only with nothing else open, use **Take write access** (confirm
first — forcing while another instance is still writing can corrupt data).

```sh
npm run build
npm run desktop:dev    # run unpackaged
npm run desktop:dist   # package for your OS into apps/desktop-electron/dist
```

**Updates:** Settings → Server compares the running version to the latest
GitHub Release (Docker and desktop). Packaged desktop builds also offer
**Help → Check for Updates…** (downloads via `electron-updater`).

Every push/PR builds unsigned macOS / Windows / Linux **artifacts**. Pushing
a `v*` tag publishes a GitHub Release with installers for the updater. Builds
are **not code-signed/notarized**, so macOS/Windows will warn on first launch.
Why Electron over Tauri:
[docs/adr/0001-desktop-shell.md](docs/adr/0001-desktop-shell.md).

## Coming from the old single-file planner?

The original single-file version of Bindarr saved to browser `localStorage`
(`binderPlannerState_v1`). Run Bindarr, open it in the same browser, and it
will offer to import that data to the server on first load.

## Layout

- `apps/web` — Vite + React + TypeScript frontend (two-level task bar:
  Bank / Binders / Extras, each with subsections; routes in
  [docs/ROADMAP.md](docs/ROADMAP.md))
- `apps/server` — Fastify API (`/api/state`, `/api/bank`, `/api/lookup`,
  `/api/calls`, `/api/settings`) + SQLite
- `packages/shared` — shared types/Zod schemas for planner + bank state
- `apps/desktop-electron` — Electron shell (see ADR 0001)
- `binder-planner-handoff.md` — original design notes (historical;
  superseded by this README and `docs/ROADMAP.md`)

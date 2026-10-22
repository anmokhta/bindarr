# Bindarr

**Card management and binder organizing.**

Plan which cards go in which binder pockets (3×3 / 9-pocket and 2×2 / 4-pocket
pages) before physically sleeving them. Includes Pokémon TCG lookup via
pokemontcg.io, drag-to-swap pockets, and automatic saving.

Bindarr is a self-hosted web app: a Fastify + SQLite server serves the
React frontend and stores all binder data server-side, so you can use it from
any browser on your network and back up one database file.

## Quickstart (Docker — recommended)

```sh
docker compose up -d --build
```

Open <http://localhost:8080>. Data persists in the `bindarr-data` Docker
volume (`/data/bindarr.db` in the container) and survives restarts/upgrades.

Useful commands:

```sh
docker compose logs -f     # logs
docker compose down        # stop (data kept)
docker compose down -v     # stop AND delete all binder data
PORT=9000 docker compose up -d   # different host port
```

### Backup / restore

Named-volume setup (default):

```sh
# backup
docker run --rm -v bindarr_bindarr-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/bindarr-data.tar.gz -C /data .
# restore (with Bindarr stopped)
docker run --rm -v bindarr_bindarr-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/*; tar xzf /backup/bindarr-data.tar.gz -C /data'
```

Or switch `docker-compose.yml` to the commented `./data:/data` bind mount and
just copy the `data/` folder (contains `bindarr.db`).

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

The same server + UI packaged for Linux/Mac/Windows. It starts the backend
locally (DB in your OS app-data folder) and opens it in an app window.

```sh
npm run build
npm run desktop:dev    # run unpackaged
npm run desktop:dist   # package for your OS into apps/desktop-electron/dist
```

Tagged releases (`v*`) or manual dispatch of the **Desktop** GitHub Actions
workflow build unsigned `.dmg` / `.exe` (NSIS) / `.AppImage` + `.deb`
artifacts for macOS/Windows/Linux. They are **not code-signed/notarized**,
so macOS/Windows will warn on first launch. Why Electron over Tauri:
[docs/adr/0001-desktop-shell.md](docs/adr/0001-desktop-shell.md).

## Coming from the old single-file planner?

The original single-file version of Bindarr saved to browser `localStorage`
(`binderPlannerState_v1`). Run Bindarr, open it in the same browser, and it
will offer to import that data to the server on first load.

## Layout

- `apps/web` — Vite + React + TypeScript frontend
- `apps/server` — Fastify API (`GET /api/health`, `GET|PUT /api/state`) + SQLite
- `packages/shared` — shared types/Zod schemas for the planner state
- `apps/desktop-electron` — Electron shell (see ADR 0001)
- `binder-planner-handoff.md` — original design notes and roadmap
  (card bank, multiple binders, sections, import/export — not yet built)

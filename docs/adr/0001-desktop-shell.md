# ADR 0001: Desktop shell — Electron (over Tauri)

## Status
Accepted (2026-10-21)

## Context
Bindarr's backend is a Node (Fastify) server using the native `better-sqlite3`
addon, and the frontend is a Vite/React build the server serves. A desktop
shell for Linux/Mac/Windows must therefore run that Node/SQLite backend
locally, store its DB in the OS app-data dir, and load the UI from the local
server (TCG lookup stays a browser-side fetch to pokemontcg.io).

Two minimal spikes were scaffolded against the same backend: `apps/desktop-tauri`
(Tauri 2, Node server as an `externalBin` sidecar) and `apps/desktop-electron`.

## Spike findings
- **Electron (built and verified on macOS):** dev mode spawns the server with
  system Node; the packaged app spawns it with `ELECTRON_RUN_AS_NODE`.
  Gotchas found and solved: (1) `better-sqlite3` must be rebuilt against
  Electron's Node ABI (`@electron/rebuild` in `scripts/prepare-backend.mjs`),
  (2) electron-builder strips `node_modules` from `extraResources`, so the
  backend bundle ships deps as `deps/` and `main.cjs` renames it back into
  `userData/backend` on first run, (3) `zod` (dep of `@bindarr/shared`) must
  be in the backend bundle. Result: packaged `.app` (~245 MB) launches, the
  server answers `/api/health`, the UI loads, and the DB is created under
  `~/Library/Application Support/@bindarr/desktop-electron/`.
- **Tauri (scaffolded, not built):** no Rust toolchain on the dev machine
  (`cargo` absent), and the design needs the Node server packaged as a
  per-platform sidecar binary — which itself requires bundling Node +
  rebuilding `better-sqlite3` per OS/arch, i.e. Electron's hard parts plus a
  Rust toolchain and a sidecar update story. The win would be bundle size
  (~10 MB shell + sidecar), not capability.

## Decision
Use **Electron** (`apps/desktop-electron`, electron-builder). It is the only
option that reuses the exact Node/SQLite backend with no second runtime to
package, which matters more for a self-hosted personal tool than bundle size.

## Consequences
- Larger downloads (~245 MB macOS app, mostly Chromium + backend deps).
- Unsigned artifacts for now: CI builds `.dmg` / NSIS `.exe` / `.AppImage`+`.deb`
  without code-signing/notarization; macOS/Windows will warn on first launch
  until signing certificates are added.
- The Tauri spike was deleted; revisit only if bundle size becomes a real
  problem and a Rust/sidecar pipeline is worth it.

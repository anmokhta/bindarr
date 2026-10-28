# Artist Search — Research Notes

API and data-source notes. Product status and the Planned milestone live in
[../artist-search.md](../artist-search.md) — **Artist Search is not shipped**.

## Backend (scaffold)

- Extras → Artist Search calls `GET /api/lookup/artist?name=…&page=…`, which
  uses `@tcgdex/sdk` with `Query.equal("illustrator", name)` and pagination
  (24 per page). Results are mapped like name lookup (`localId` → number,
  `illustrator` → artist, `{image}/low.webp`).
- Calls go through the same retry / `logApiCall` (`provider: "tcgdex"`) /
  `tcgdex:` SQLite cache as `/api/lookup`.
- Prefill from `?artist=` auto-runs search on mount. artofpkm remains a
  secondary deep link (`/illustrators/{slug}`).
- Bank / binder "More by this artist" actions navigate here with the query set.
- Card name lookup accepts `lang=en|ja`; the artist endpoint does not read
  `lang` today and searches the English catalog only.

## The Art of Pokémon (artofpkm.com)

- **No public API.** The site is a server-rendered Rails/Turbo app.
  Scraping its HTML is **not planned**. Slugified deep-links to illustrator
  pages are feasible and stay as an external secondary action.

## TCGdex (primary)

- Illustrator filter: `illustrator=eq:{name}` (SDK `Query.equal`).
- Free, no API key. Same resilience story as card name lookup.

## Out of scope

Non-Pokémon artists; scraping artofpkm.

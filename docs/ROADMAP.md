# Bindarr Roadmap & Status

Organized by the app's task bar: **Bank**, **Binders**, **Extras**
(Settings stays a standalone page at `/settings`).

## Where we are

### Done
- **Platform**: Docker self-hosted app (Fastify + SQLite, one volume),
  Electron desktop shell for macOS/Windows/Linux (unsigned), GitHub
  Actions workflows for CI and desktop builds; remote `anmokhta/bindarr`
  is live (no `v*` Release cut yet for the desktop updater).
- **Binders**: real named binders (create, rename, duplicate,
  archive/restore, permanent delete, current-binder indicator);
  layouts 3×3 (9), 2×2 (4), 4×3 (12 pockets); physical double-sided
  **sheets** (a 3-sheet 2×2 binder = 6 sides = 24 slots) with safe
  sheet-count resizing; two-page spreads (Page 1 solo, then 2–3, 4–5…)
  and a persisted page-size slider.
- **Bank**: one card table with independent have/want flags — Bank >
  Cards is the have view, Bank > Wishlist the want view (wishlist cards
  render grayscale in binders until marked obtained); per-game bank
  sidebar, filters, sort (name/set/number/artist/date added), picture
  filter; JSON/CSV import/export with dedupe (including PriceCharting);
  checkbox bulk bar (add/remove tags, set collection, delete, Identify);
  Bank > Bulk add (paste names/numbers, per-card TCGdex review, Have /
  Want / Both, EN/JP language); Add/Edit card in a modal with shared
  button styles and an EN/JP language field.
- **Lookup**: Pokémon via TCGdex (`@tcgdex/sdk`) with retry, SQLite
  cache, and stale fallback; optional `lang=ja` (Japanese catalog) with
  EN fallback for JP Identify; exact `localId` matching (avoids Pocket
  false positives like `81` → `#181`); Settings migrate for legacy
  pokemontcg.io image URLs; every upstream attempt logged to Settings >
  Logs (`/settings?tab=calls`) with 1h/12h/24h/3d/7d/30d counts.
  PriceCharting Japanese imports set `language=ja` and strip the
  Japanese set prefix; Identify skips Carddass, prefers main-TCG over
  TCG Pocket when both exist, and for JP rows tries the JA catalog
  first then EN. (Illustrator API exists for Artist Search; the Extras
  feature itself is **not** shipped — see Scaffolded.)
- **Routing**: every screen has a real URL; the task bar is two-level
  (Bank / Binders / Extras + subsections) and old URLs redirect.
- **Desktop DB share + updates**: Electron first-run Create new / Use
  existing; single-writer lease; Settings version vs GitHub Releases;
  `v*` tags publish desktop releases (see ADR 0001).

### Scaffolded (UI exists, feature not built)
- **Bank > Tags / Bank > Collections**: read-only previews of the tags
  and collections already on cards, with disabled rule/bulk-apply and
  **Slot labels and Optimize** panels. Card forms, filters, and the
  Bank checkbox bulk bar already edit tags (many per card) and
  collection (one per card); create/rename/delete for the taxonomy
  itself is still planned. Design note:
  [labels-and-optimize.md](labels-and-optimize.md).
- **Extras > Artist Search**: Planned badge on the page; thin TCGdex
  illustrator proxy + preview grid only. **Not shipped** until UI redo,
  clear in-app results, artofpkm links, and Save to bank. Design note:
  [artist-search.md](artist-search.md).

## Open UI decisions

- **Subsection / Settings nav:** segmented / sidebar / icon rail via
  Settings → Nav styles (`/settings?tab=nav-styles`); write-up:
  [ui-subsection-nav.md](ui-subsection-nav.md).

## Next steps (in order)

1. **Tags & Collections manager** (Bank > Tags, Bank > Collections):
   create/rename/delete with card review — renaming a tag rewrites it
   on every card; deleting offers remove-from-cards vs keep. Decide
   first: collections single-value (today) or multi-value?
2. **Rules engine**: conditions over name/set/artist/evolution
   line/game/tags/have-want → add tag or set collection. Always
   preview matches before applying; bulk-apply to existing cards;
   then optional auto-apply on create/import/update. Open questions:
   rule precedence on conflicting collection assignments, undo,
   whether imports trigger rules. Smart tags/collections live here.
3. **Artist Search** (Extras): redesign UI; show TCGdex responses clearly
   in-app; artofpkm illustrator (and related) links; Save to bank from
   results. Keep Planned badge until done. See
   [artist-search.md](artist-search.md) (API notes:
   [research/artist-search.md](research/artist-search.md)).
4. **Binder sections**: named groups of sides within a binder with
   filled/total rollups (deferred from the multiple-binders milestone).
   Sections are the anchor for slot labels and Optimize.
5. **Slot and section labels**: attach a tag/collection to a slot,
   page, or section so placed cards inherit it; drag a label onto a
   binder to pull matching cards. See
   [labels-and-optimize.md](labels-and-optimize.md).
6. **Organize > Optimize (diff preview)**: ordered label rules per
   binder/section; Optimize computes proposed layout changes and shows
   a before/after diff; Apply writes nothing until confirmed.
7. **More games & release polish**: Magic/Yu-Gi-Oh!/Lorcana/One Piece
   lookups, full-app backup/restore in Settings, call-log pruning,
   signed desktop builds, first `v*` GitHub Release (CI and remote
   already exist; updater path untested end-to-end until a tag is cut).

## Route map

| URL | Screen |
| --- | --- |
| `/binders/planner` (`/`, `/binders/planner`) | Binders > Planner |
| `/binders/manage` (`/binders`) | Binders > Manage Binders |
| `/binders/organize` (future) | Binders > Organize (Optimize) — not routed yet |
| `/bank/cards` (`/bank`) | Bank > Cards |
| `/bank/wishlist` (`/wishlist`) | Bank > Wishlist |
| `/bank/bulk-add` | Bank > Bulk add |
| `/bank/tags` | Bank > Tags (skeleton) |
| `/bank/collections` | Bank > Collections (skeleton) |
| `/extras/artist-search` (`/artist-search`) | Extras > Artist Search (skeleton / Planned) |
| `/settings` (`?tab=calls` / `?tab=nav-styles`) | Settings (standalone; Nav styles demos) |
| `/extras/nav-styles` | redirects → `/settings?tab=nav-styles` |

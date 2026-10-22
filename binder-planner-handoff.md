# Binder Page Planner — Handoff Notes

## What this is
A tool for planning which cards go in which binder pockets before physically
sleeving/moving cards around. Started as a single self-contained HTML file
(vanilla JS/CSS, no build step, no framework) so it could run either as a
Claude Artifact (hosted) or as a plain local file opened in a browser.

Current file: `binder-page-planner.html`
Currently published as a Claude Artifact at:
https://claude.ai/artifact/3mUuZerCGa4rQvmy7dR27y

## Why it's a plain HTML file (context for Claude Code)
No particular attachment to the format — it just started as a quick Claude
Artifact. Moving to Claude Code is a good point to decide whether to keep it
as a static single-file app, or turn it into something with a real build step
(Vite/React, etc.) — especially once binders/cards need to be
imported/exported or synced anywhere. Worth deciding early since it affects
how state should be structured going forward.

## Current feature set
- Two binder types: **3×3 (9-pocket)** and **2×2 (4-pocket)**, switched via a
  toggle at the top. Each type has its own independent set of pages.
- **Pages**: add/delete/rename pages within a binder type.
- **Pockets**: click an empty pocket to fill it in (name, note, one of three
  tags — Showcase / Set build / Trade-bulk). Click a filled pocket to edit it.
  Small "×" button clears a pocket.
- **Drag and drop** to swap two pockets' contents within the same page.
- **Pokémon TCG lookup**: inside the pocket editor, a "Look up" panel queries
  the free pokemontcg.io API by card name (+ optional number), shows thumbnail
  results, and clicking one fills in name/note/image.
  - Query pattern: `https://api.pokemontcg.io/v2/cards?q=name:"X" number:Y&pageSize=8`
  - No API key required at low volume (1,000 req/day unauthenticated).
- **Persistence**: everything autosaves to `localStorage` under the key
  `binderPlannerState_v1`. No backend, no accounts, no sync.

## Known constraint to design around
Claude's hosted Artifact preview runs behind a content-security policy that
blocks `fetch()` calls to arbitrary external domains (only a short allowlist
of script/font CDNs is permitted, no general API calls). So:
- The pokemontcg.io lookup **does not work** in the hosted Artifact link — it
  shows a message explaining that instead of failing silently.
- It **does work** when the same HTML file is downloaded and opened directly
  in a browser (double-click, no server needed) — no CSP restriction there.
This won't apply once the project lives in Claude Code / runs as a normal
local or deployed web app — worth keeping in mind if the plan is to
eventually publish it as an Artifact again vs. just run it locally or deploy
it properly.

## Current data model
```js
state = {
  activeType: '3x3' | '2x2',
  activePageIndex: { '3x3': 0, '2x2': 0 },
  pages: {
    '3x3': [ { name: 'Page 1', slots: [ null | CardSlot, ... 9 total ] }, ... ],
    '2x2': [ { name: 'Page 1', slots: [ null | CardSlot, ... 4 total ] }, ... ]
  }
}

CardSlot = {
  name: string,
  tag: 'none' | 'showcase' | 'set' | 'trade',
  note: string,
  image: string | null   // URL from pokemontcg.io result, if picked via lookup
}
```

## Design tokens (for visual consistency if rebuilding)
- Palette: binder-green `#2F4B3C` (`--vinyl`), oat paper `#F3EFE4` (`--paper`),
  foil gold `#B8902F` (`--gold`), plus three tag colors — showcase gold
  `#B8902F`, set-build teal `#3E7C74`, trade/bulk clay `#A85C3E`.
  Dark-mode variants are already defined in the CSS custom properties.
- Type: **Fraunces** (serif, headings), **IBM Plex Sans** (UI/body),
  **IBM Plex Mono** (labels/tags/small data), all via Google Fonts.
- Pocket aspect ratio: 2.5:3.5 (real trading-card ratio).

## Next planned features (roadmap, not yet built)
1. **Card bank** — a holding area to save cards outside of any binder page,
   so cards can be looked up / entered once and then placed (or re-placed)
   into pockets without re-searching. Needs its own storage bucket distinct
   from `pages`, plus some UI to browse/search the bank and drag from it into
   a pocket. Each bank entry carries richer metadata than a pocket does today
   — see **Card bank fields** below.
2. **Import/export** — get card and binder data in and out of the tool
   (likely JSON to start; CSV worth considering if it should interop with
   spreadsheets). Needs to cover: single binder, all binders, and probably
   the card bank too. Decide the file format before building the UI around
   it — schema is basically the data model above.
3. **Multiple binders** — right now there's only ever *one* binder of each
   type (3×3, 2×2). Needs a binder-level entity above "pages" — i.e. named
   binders, each containing its own set of pages, plus a way to switch
   between binders of the same pocket-type. This is a structural change to
   the data model (adds a `binders` layer above `pages`), so it's worth doing
   before the bank/import-export work locks in a different shape.
   **Preset page count:** when creating a binder, the user picks the number of
   pages up front (matching the physical binder's capacity), and the binder is
   created with that many empty pages instead of growing one page at a time.
   See **Binder presets** below.
4. **Sections within a page** — let a page (or ranges of pockets on a page)
   be tagged with a "section" (e.g. by set, by category, by however the user
   wants to divide it up), then show, per section: how many pockets are
   filled vs. total, and the percentage complete. Also useful per-page or
   per-binder rollups once this exists. This depends on deciding whether a
   "section" is a property per-pocket (simplest, reuses the existing `tag`-
   like approach) or a named range of pockets (more flexible, more UI work).

## Binder presets (planned)
Intended use: the user's binders hold their **card and card-adjacent
collection**, so a binder should mirror a real, physical binder.
- On binder creation: name, pocket type (9 or 4), and **number of pages**
  (preset), e.g. a 30-page binder is created with 30 empty pages.
- Capacity is then fixed and known: `pages × pockets` total slots, which makes
  the section fill-percentages (roadmap item 4) meaningful against a real
  ceiling rather than a growing count.
- Open decisions for Claude Code:
  - Can page count be changed later (add/remove pages)? Removing a page that
    contains cards needs a guard (confirm, or block until emptied).
  - Do physical pages hold cards on **both sides**? Real binder pages are
    often double-sided; decide whether "page" means one side or one sheet
    before locking in the capacity math.
  - "Card-adjacent" items (non-card things stored in a binder) — resolved in
    direction: the bank gets an `itemKind` field. See **Non-TCG items bank**.

## Card bank fields (planned)
Each bank entry is a saved card the user can search/filter and then place into
a pocket. Requested fields:

| Field | Notes |
|---|---|
| `name` | Card name |
| Evolution line | Which evolution tree the card's Pokémon belongs to, so the user can search for **every card in an evolution line** (e.g. all cards in a given three-stage family) in one query |
| `set` | Set the card was printed in |
| `artist` | Illustrator credit |
| `collection` | **User-created mini-set** — a named grouping the user defines (single value per card, or possibly multi — decide) |
| `tags` | **Zero or more** free-form tags per card (array, not a single value like the current `tag`) |

Suggested shape (not final):
```js
BankCard = {
  id: string,                 // local unique id
  apiId: string | null,       // pokemontcg.io id if looked up, else null
  name: string,
  evolutionLine: string | null, // line identifier, e.g. a family name — see below
  evolutionStage: number | null, // optional: position within the line
  set: string,
  number: string,
  artist: string | null,
  collection: string | null,  // user-created mini-set name
  tags: string[],
  image: string | null,
  note: string
}
```

**Evolution-line search — needs a design decision.** Searching "all cards in
an evolution" requires every card to carry some shared line identifier.
Options to weigh:
1. Derive it from API data on lookup. *Not yet verified:* check the official
   pokemontcg.io docs for whether card objects expose fields like the
   evolves-from / evolves-to names, Pokédex numbers, and artist — and whether
   those are enough to reconstruct a full line (adjacent-stage links alone may
   not give the whole family without extra lookups). Confirm before building
   on it.
2. Ship a small local lookup table mapping Pokémon name → line, used to
   auto-fill the field.
3. Let the user set/override the line manually (needed anyway for cards the
   API doesn't cover or gets wrong).
Likely answer: 1 or 2 for auto-fill, plus 3 as an override.

**Collection vs. tags vs. sections — keep these distinct:**
- `collection` = user-defined mini-set a *card* belongs to (lives on the bank
  card).
- `tags` = multi-value labels on a *card* for filtering (replaces the single
  Showcase/Set/Trade tag; those three can remain as default tag values).
- *Section* (roadmap item 4) = a grouping applied to *pages* in a binder, used
  for fill-percentage rollups. Don't conflate it with `collection`, though a
  section could optionally be linked to a collection later.

**Bank search/filter UI** should cover at least: name text search, evolution
line, set, artist, collection, and tag (multi-tag filter: any vs. all).

## Non-TCG items bank (planned)
The user wants to load items that aren't TCG cards into the same system, e.g.
a **1997 Japanese Pokémon Carddass** card, or the **back of a cool-looking
card sleeve**. These need to be placeable in binder pockets just like TCG cards.

Design implications:
- **One bank, two kinds of item**, rather than a separate bank. Add an
  `itemKind` discriminator on bank entries (replaces the open question in
  "Binder presets"). Suggested values: `tcg-card`, `other-card`, `sleeve`,
  `other`. Keep the list editable/extensible, since the user may collect
  other card-adjacent things.
- **Manual-first entry.** Treat these as hand-entered by default: name,
  photo/image, notes. Whether any lookup API covers Carddass or sleeves is
  **unverified** — check before assuming; don't make the UI depend on it.
- **Image upload is the primary path.** Unlike TCG cards (image URL from the
  API), these items need the user to supply their own photo. Store as a
  data URL in `localStorage` only for small images; for a real library plan
  on IndexedDB (or files on disk in a Claude Code/local build), because
  `localStorage` has a small quota and photos will exhaust it quickly. This
  also affects import/export (images must be bundled or referenced).
- **Field applicability differs by kind.** Fields that make sense for TCG
  cards (evolution line, set number, API id) may not apply to a Carddass or
  a sleeve. Keep them optional and only show relevant fields per `itemKind`.
  Suggested extra optional fields for non-TCG items: `maker` / `series`,
  `year`, `language`, `condition`, `source` (where it came from).
- **Shared fields stay universal:** `name`, `image`, `collection`, `tags`
  (multi), `note` — so bank search, collections and the section fill
  percentages work across all kinds without special-casing.
- **Pocket display:** a sleeve back or an oddly sized item may not match the
  2.5:3.5 pocket ratio; decide whether images are cropped, letterboxed
  (`object-fit: contain`, which the pocket thumbnail already uses), or the
  user sets a fit mode per item.
- **Evolution-line search** should simply skip non-TCG items unless the user
  sets a line manually (a Pokémon Carddass could reasonably carry one).

Suggested shape addition (not final):
```js
BankItem = BankCard & {
  itemKind: 'tcg-card' | 'other-card' | 'sleeve' | 'other',
  maker: string | null,
  year: number | null,
  language: string | null,
  condition: string | null,
  source: string | null,
  imageFit: 'cover' | 'contain'
}
```

## Useful links
- Pokémon TCG API docs: https://docs.pokemontcg.io/
- PriceCharting (pricing context from earlier in this conversation, not yet
  integrated): https://www.pricecharting.com — no public free API; scraping
  it means going around a Cloudflare bot-check, so it wasn't used here.

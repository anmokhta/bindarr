# Artist Search

**Status:** Planned — not shipped  
**Route:** `/extras/artist-search` (`/artist-search` redirects)  
**Date:** 2026-10-27

Design note for the Extras → Artist Search milestone. A thin TCGdex illustrator
proxy and scaffold page exist; the feature is **not** considered shipped until
the UI and bank actions below land. Research notes (API / artofpkm constraints):
[research/artist-search.md](research/artist-search.md).

## Goals

1. **Redo the page UI** — replace the current scaffold so results, status, and
   actions are clear and match the rest of Bindarr (Bank card grid, buttons,
   Planned badge on the title until this ships).
2. **Show responses in-app** — TCGdex illustrator hits must render as a usable
   in-app result set (image, name, set, number), not only a status line or an
   external redirect.
3. **artofpkm links** — keep The Art of Pokémon as a secondary action:
   illustrator page deep link (`/illustrators/{slug}`), and per-card / gallery
   links where useful. Scraping artofpkm is out of scope.
4. **Save to bank** — from a result, add the card to the Pokémon bank (have
   and/or want), with the same dedupe rules as other imports/lookups.
5. **Planned badge** — the page title shows a Planned badge until the milestone
   is done; e2e expects that badge while the feature is unfinished.

## Current scaffold (not shipped)

What exists today and must not be treated as the finished feature:

- `GET /api/lookup/artist?name=…&page=…` (TCGdex, 24/page, retry/cache/logs).
- Prefill from `?artist=` and “More by this artist” deep links.
- A basic search box, result thumbnails, pagination, and one artofpkm link.
- No Planned badge was briefly removed; it is restored while this stays Planned.

Gaps vs goals: UI needs a redesign; result cards need clearer metadata and
actions; **Save to bank** is missing; place-into-binder is optional follow-on
(see Open questions).

## Target UX

| Element | Behavior |
| --- | --- |
| Title | `Artist Search` + Planned badge (until shipped) |
| Search | Name field + Search; Enter submits; loading/error status visible |
| Results | In-app grid/list: image, name, set, `#number`; empty and error states |
| External | “Open on The Art of Pokémon” for the illustrator; optional per-result links |
| Bank | Per result: **Add to bank** (have / want / both — match Bulk add patterns) |
| Entry points | Extras tab; artist icon from bank/pocket with `?artist=` prefilled |

## Out of scope (for this milestone)

- Non-Pokémon games.
- Scraping artofpkm.com.
- Treating artofpkm as the primary result source (TCGdex stays primary).

## Open questions

- Place-from-results into the current binder pocket vs bank-only for v1?
- Dedup when the card is already in the bank — navigate to existing vs update?
- Should artist lookup gain `lang=ja` like `/api/lookup`, or stay EN-only?
- Wishlist-only add vs Have/Want/Both control?

## Tracking

- Roadmap next-steps item and Scaffolded section: [ROADMAP.md](ROADMAP.md).
- Route map lists the page; badge + unfinished UI mean it stays Planned there
  until this doc’s goals are met.

# Artist Search — Research Notes

Goal: "view other cards by this artist" from any card, and a dedicated
Artist Search tab. Findings from the initial research pass:

## The Art of Pokémon (artofpkm.com)

- **No public API.** The site is a server-rendered Rails/Turbo app.
  `/api/cards` returns 404; `cards.json`, `illustrators.json`, and
  `?format=json` return 406 Not Acceptable.
- `robots.txt` is permissive (`Allow: /`; only `/admin/` and `/users/` are
  disallowed), and the sitemap exposes stable illustrator URLs such as
  `/illustrators/mitsuhiro-arita`. **Slugified deep-links to an artist's
  page are feasible** and are what the scaffold uses.
- Scraping its HTML would be fragile and is **not planned**. No API/ToS
  program was found. The site covers Japanese cards (eras/sets PMCG 1996 →
  MEGA) and describes itself as under construction.

## Pokémon TCG API (pokemontcg.io)

- Already supports artist search via its Lucene query syntax:
  `q=artist:"Mitsuhiro Arita"`. This is the same API our `/api/lookup`
  proxy already calls (with retry/backoff + SQLite caching), making it
  the realistic primary source when artist search is built.
- Note: the unauthenticated API intermittently returns 500s (measured
  ~1/6 success during earlier testing). The proxy's retry/cache mitigates
  this; new artist calls should log through the server's `logApiCall`
  helper so they appear in Settings → Calls.

## Scaffold shipped

- `/artist-search` tab with a search box, "coming soon" explainer, results
  placeholder, and — once an artist is entered — an
  "Open on The Art of Pokémon" deep link (slugified name) plus a disabled
  "Search with Pokémon TCG API (planned)" affordance. No fetching yet.
- "More by this artist" actions on bank/wishlist cards (and planned for
  pocket editor results / filled pockets) navigate to
  `/artist-search?artist=<name>` prefilled.

## Out of scope (this pass)

Building the actual artist search/results, scraping artofpkm, and
non-Pokémon game artist lookups.

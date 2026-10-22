import { useState } from "react";

export function artistSlug(name: string): string {
  return name.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function ArtistSearchPage() {
  const initial = new URLSearchParams(window.location.search).get("artist") ?? "";
  const [artist, setArtist] = useState(initial);
  const slug = artistSlug(artist);

  return (
    <section className="page-section">
      <h2 className="page-title">Artist Search</h2>
      <p className="page-sub">
        Find cards by the artist who illustrated them. Full in-app search is coming soon —
        for now, jump straight to the artist's page on The Art of Pokémon.
      </p>
      <div className="bank-filters-bar">
        <input
          className="bank-search"
          placeholder="Artist name, e.g. Mitsuhiro Arita"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          aria-label="Artist name"
        />
      </div>
      {artist.trim() && (
        <div className="bank-actions-row">
          <a className="primary-btn" href={`https://www.artofpkm.com/illustrators/${slug}`} target="_blank" rel="noreferrer">
            Open on The Art of Pokémon
          </a>
          <button disabled title="Planned: search via the Pokémon TCG API (artist: query)">
            Search with Pokémon TCG API (planned)
          </button>
        </div>
      )}
      <div className="artist-placeholder">
        <p>Artist results will appear here once search is built.</p>
        <p>
          Planned sources: the Pokémon TCG API (<code>artist:"…"</code> queries through our
          existing lookup proxy) and deep links to The Art of Pokémon, which has no public API.
          See <code>docs/research/artist-search.md</code>.
        </p>
      </div>
    </section>
  );
}

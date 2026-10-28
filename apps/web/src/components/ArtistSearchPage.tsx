import { useEffect, useState } from "react";
import { lookupByArtist, type TcgCard } from "../api.js";

export function artistSlug(name: string): string {
  return name.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function ArtistSearchPage() {
  const initial = new URLSearchParams(window.location.search).get("artist") ?? "";
  const [artist, setArtist] = useState(initial);
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<TcgCard[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const slug = artistSlug(artist);

  async function runSearch(nextPage = 1) {
    const name = artist.trim();
    if (!name) {
      setStatus("Type an artist name first.");
      return;
    }
    setLoading(true);
    setStatus("Searching TCGdex…");
    try {
      const result = await lookupByArtist(name, nextPage);
      setCards(result.cards);
      setPage(result.page);
      setStatus(
        result.cards.length
          ? `${result.cards.length} card${result.cards.length === 1 ? "" : "s"} (page ${result.page})`
          : "No cards found for that illustrator.",
      );
      const params = new URLSearchParams(window.location.search);
      params.set("artist", name);
      window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
    } catch (e) {
      setCards([]);
      setStatus(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initial.trim()) void runSearch(1);
    // Prefill from URL once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page-section">
      <h2 className="page-title">Artist Search <span className="planned-badge">Planned</span></h2>
      <p className="page-sub">
        Scaffold only — UI redo, clearer in-app results, artofpkm links, and Save to bank are still planned
        (see <code>docs/artist-search.md</code>). TCGdex illustrator lookup and The Art of Pokémon deep link work below as a preview.
      </p>
      <div className="bank-filters-bar">
        <div className="bank-search-row">
          <input
            className="bank-search"
            placeholder="Artist name, e.g. Mitsuhiro Arita"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(1); }}
            aria-label="Artist name"
          />
          <button type="button" className="btn btn-primary primary-btn" disabled={loading || !artist.trim()} onClick={() => void runSearch(1)}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>
      {artist.trim() && (
        <div className="bank-actions-row">
          <a className="btn btn-secondary btn-sm" href={`https://www.artofpkm.com/illustrators/${slug}`} target="_blank" rel="noreferrer">
            Open on The Art of Pokémon
          </a>
          {status && <span className="bank-count" role="status">{status}</span>}
        </div>
      )}

      {cards.length > 0 && (
        <>
          <div className="bank-grid artist-results-grid">
            {cards.map((c) => (
              <article key={c.id} className="bank-card">
                <div className="bank-card-img">
                  {c.imageSmall ? (
                    <img src={c.imageSmall} alt={c.name} />
                  ) : (
                    <div className="bank-card-noimg">{c.name}</div>
                  )}
                  <div className="card-overlay">
                    <div className="card-overlay-name">{c.name}</div>
                    <div className="card-overlay-meta">
                      {[c.setName, c.number ? `#${c.number}` : ""].filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="bank-actions-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading || page <= 1}
              onClick={() => void runSearch(page - 1)}
            >
              Previous
            </button>
            <span className="bank-count">Page {page}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading || cards.length < 24}
              onClick={() => void runSearch(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {!loading && !cards.length && artist.trim() && status.startsWith("No cards") && (
        <div className="artist-placeholder">
          <p>No TCGdex cards matched that illustrator name. Check spelling, or browse on The Art of Pokémon.</p>
        </div>
      )}
    </section>
  );
}

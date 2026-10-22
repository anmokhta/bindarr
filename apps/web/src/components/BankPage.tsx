export default function BankPage() {
  return (
    <section className="page-section">
      <h2 className="page-title">Card Bank</h2>
      <p className="page-sub">
        A holding area for cards that aren't in a binder yet — look them up once,
        then place them into pockets without searching again.
      </p>

      <div className="bank-toolbar">
        <input className="bank-search" placeholder="Search the bank by name…" disabled />
        <div className="bank-filters" aria-hidden>
          <span className="filter-chip">Evolution line</span>
          <span className="filter-chip">Set</span>
          <span className="filter-chip">Artist</span>
          <span className="filter-chip">Collection</span>
          <span className="filter-chip">Tags</span>
        </div>
        <button className="primary-btn" disabled title="Available with the card bank">
          + Add card
        </button>
      </div>

      <div className="bank-grid" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bank-skeleton-card">
            <div className="skeleton-img" />
            <div className="skeleton-line wide" />
            <div className="skeleton-line narrow" />
          </div>
        ))}
      </div>
      <p className="skeleton-note">
        Nothing here yet. The bank (with evolution-line, set, artist, collection,
        and tag filters, plus non-TCG items) is the next feature after binders.
      </p>
    </section>
  );
}

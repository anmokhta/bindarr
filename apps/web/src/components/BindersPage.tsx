import { useState } from "react";
import { BINDER_TYPES, type BinderType, type PlannerState } from "@bindarr/shared";

function stats(state: PlannerState, type: BinderType) {
  const pages = state.pages[type];
  const total = pages.length * BINDER_TYPES[type].count;
  const filled = pages.reduce((n, p) => n + p.slots.filter(Boolean).length, 0);
  return { pages: pages.length, total, filled };
}

export default function BindersPage({
  state,
  onOpen,
}: {
  state: PlannerState;
  onOpen: (type: BinderType) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<BinderType>("3x3");
  const [pageCount, setPageCount] = useState(30);

  return (
    <section className="page-section">
      <h2 className="page-title">Binders</h2>
      <p className="page-sub">Pick a binder to open it in the planner.</p>

      <div className="binder-list">
        {(Object.keys(BINDER_TYPES) as BinderType[]).map((key) => {
          const s = stats(state, key);
          const pct = s.total ? Math.round((s.filled / s.total) * 100) : 0;
          return (
            <article key={key} className="binder-card">
              <div className="binder-spine" aria-hidden />
              <div className="binder-info">
                <h3>{key === "3x3" ? "9-Pocket Binder" : "4-Pocket Binder"}</h3>
                <p className="binder-meta">
                  {BINDER_TYPES[key].sub} · {s.pages} page{s.pages === 1 ? "" : "s"}
                </p>
                <p className="binder-meta">
                  {s.filled} / {s.total} pockets filled ({pct}%)
                </p>
                <div className="fill-track"><div className="fill-bar" style={{ width: `${pct}%` }} /></div>
                <button className="primary-btn" onClick={() => onOpen(key)}>
                  {state.activeType === key ? "Open in planner" : "Select & open"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="create-binder">
        <h3>Create a new binder</h3>
        <div className="create-form">
          <label>
            Name
            <input placeholder="e.g. Vintage holos" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Pocket type
            <select value={type} onChange={(e) => setType(e.target.value as BinderType)}>
              <option value="3x3">9-pocket (3 × 3)</option>
              <option value="2x2">4-pocket (2 × 2)</option>
            </select>
          </label>
          <label>
            Pages
            <input
              type="number"
              min={1}
              max={200}
              value={pageCount}
              onChange={(e) => setPageCount(Number(e.target.value))}
            />
          </label>
        </div>
        <button className="primary-btn" disabled title="Available with multiple-binder support">
          Create binder
        </button>
        <p className="skeleton-note">
          Named binders with a preset page count arrive with the multiple-binder
          data model — this form is the planned layout.
        </p>
      </div>
    </section>
  );
}

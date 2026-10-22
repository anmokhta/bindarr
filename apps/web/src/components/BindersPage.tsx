import { useState } from "react";
import { BINDER_TYPES, sheetCountOf, totalSlotsOf, type Binder, type BinderType, type PlannerState } from "@bindarr/shared";

function stats(binder: Binder) {
  const total = totalSlotsOf(binder);
  const filled = binder.pages.reduce((n, p) => n + p.slots.filter(Boolean).length, 0);
  return { sheets: sheetCountOf(binder), sides: binder.pages.length, total, filled };
}

export interface BinderActions {
  onOpen: (id: string) => void;
  onCreate: (name: string, layout: BinderType, sheetCount: number) => void;
  onResizeSheets: (id: string, sheets: number) => string | null;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function BindersPage({
  state,
  actions,
}: {
  state: PlannerState;
  actions: BinderActions;
}) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<BinderType>("3x3");
  const [sheetCount, setSheetCount] = useState(15);
  const [resizeNotice, setResizeNotice] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const active = state.binders.filter((b) => !b.archivedAt);
  const archived = state.binders.filter((b) => b.archivedAt);

  function renderCard(binder: Binder) {
    const s = stats(binder);
    const pct = s.total ? Math.round((s.filled / s.total) * 100) : 0;
    const isCurrent = binder.id === state.activeBinderId && !binder.archivedAt;
    return (
      <article key={binder.id} className={`binder-card${isCurrent ? " current" : ""}`} aria-current={isCurrent || undefined}>
        <div className="binder-spine" aria-hidden />
        <div className="binder-info">
          {renamingId === binder.id ? (
            <input
              className="binder-rename"
              defaultValue={binder.name}
              autoFocus
              aria-label="Binder name"
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                const next = e.target.value.trim();
                setRenamingId(null);
                if (next && next !== binder.name) actions.onRename(binder.id, next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <h3>{binder.name}</h3>
          )}
          {isCurrent && <span className="current-badge">Current binder</span>}
          <p className="binder-meta">
            {BINDER_TYPES[binder.layout].sub} · {s.sheets} sheet{s.sheets === 1 ? "" : "s"} · {s.sides} sides
          </p>
          <p className="binder-meta">
            {s.filled} / {s.total} pockets filled ({pct}%)
          </p>
          <div className="fill-track"><div className="fill-bar" style={{ width: `${pct}%` }} /></div>
          {!binder.archivedAt && (
            <label className="binder-sheets-control">
              Sheets
              <input
                type="number" min={1} max={200} aria-label={`Sheets for ${binder.name}`}
                defaultValue={s.sheets} key={`bs-${binder.id}-${s.sheets}`}
                onBlur={(e) => setResizeNotice(actions.onResizeSheets(binder.id, Number(e.target.value)) ?? "")}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </label>
          )}
          <div className="binder-card-actions">
            {binder.archivedAt ? (
              <>
                <button className="primary-btn" onClick={() => actions.onRestore(binder.id)}>Restore</button>
                <button
                  onClick={() => {
                    if (window.confirm(`Permanently delete "${binder.name}" and all its pages? This can't be undone.`)) actions.onDelete(binder.id);
                  }}
                >
                  Permanently delete
                </button>
              </>
            ) : (
              <>
                <button className="primary-btn" disabled={isCurrent} onClick={() => actions.onOpen(binder.id)}>
                  {isCurrent ? "Currently open" : "Select & open"}
                </button>
                <button onClick={() => setRenamingId(binder.id)}>Rename</button>
                <button onClick={() => actions.onDuplicate(binder.id)}>Duplicate</button>
                <button
                  disabled={active.length <= 1}
                  title={active.length <= 1 ? "Archive is unavailable for your last binder" : undefined}
                  onClick={() => actions.onArchive(binder.id)}
                >
                  Archive
                </button>
              </>
            )}
          </div>
          {active.length <= 1 && !binder.archivedAt && (
            <p className="skeleton-note">This is your last binder — create another before archiving it.</p>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="page-section">
      <h2 className="page-title">Binders</h2>
      <p className="page-sub">Pick a binder to open it in the planner.</p>

      {resizeNotice && <p className="sheet-notice" role="alert">{resizeNotice}</p>}
      <div className="binder-list">{active.map(renderCard)}</div>

      {archived.length > 0 && (
        <>
          <h3 className="archived-heading">Archived binders</h3>
          <div className="binder-list archived">{archived.map(renderCard)}</div>
        </>
      )}

      <div className="create-binder">
        <h3>Create a new binder</h3>
        <div className="create-form">
          <label>
            Name
            <input placeholder="e.g. Vintage holos" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Pocket type
            <select value={layout} onChange={(e) => setLayout(e.target.value as BinderType)}>
              <option value="3x3">9-pocket (3 × 3)</option>
              <option value="2x2">4-pocket (2 × 2)</option>
              <option value="4x3">12-pocket (4 × 3)</option>
            </select>
          </label>
          <label>
            Sheets
            <input
              type="number"
              min={1}
              max={200}
              value={sheetCount}
              onChange={(e) => setSheetCount(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="primary-btn"
          onClick={() => {
            actions.onCreate(name.trim() || "Untitled binder", layout, Math.min(200, Math.max(1, sheetCount || 1)));
            setName("");
          }}
        >
          Create binder
        </button>
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import { BANK_LABELS, type BankItem } from "@bindarr/shared";
import { BankFiltersBar, emptyFilters, filterBankItems, type BankFilters } from "./BankPicker.js";
import BankItemForm from "./BankItemForm.js";

export default function BankPage({
  items,
  visibleBanks,
  onCreate,
  onUpdate,
  onDelete,
  onPlace,
}: {
  items: BankItem[];
  visibleBanks: string[];
  onCreate: (payload: Record<string, unknown>) => Promise<BankItem>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPlace: (item: BankItem) => void;
}) {
  const [game, setGame] = useState(visibleBanks[0] ?? "pokemon");
  const [filters, setFilters] = useState<BankFilters>(emptyFilters);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankItem | null>(null);

  const activeGame = visibleBanks.includes(game) ? game : (visibleBanks[0] ?? "pokemon");
  const inGame = useMemo(() => items.filter((i) => i.game === activeGame), [items, activeGame]);
  const visible = useMemo(() => filterBankItems(inGame, filters), [inGame, filters]);

  return (
    <section className="page-section">
      <h2 className="page-title">Card Bank</h2>
      <p className="page-sub">
        Cards and items that aren't in a binder yet. Place them into pockets from
        here, drag them onto a pocket, or pick them from a pocket's Bank tab.
      </p>

      <div className="bank-game-tabs">
        {visibleBanks.map((b) => (
          <button key={b} className={`game-tab${activeGame === b ? " active" : ""}`} onClick={() => { setGame(b); setShowForm(false); setEditing(null); }}>
            {BANK_LABELS[b] ?? b}
          </button>
        ))}
      </div>

      <BankFiltersBar items={inGame} filters={filters} onChange={setFilters} />

      <div className="bank-actions-row">
        <button className="primary-btn" onClick={() => { setEditing(null); setShowForm((s) => !s); }}>
          {showForm ? "Close form" : activeGame === "misc" ? "+ Add misc item" : "+ Add card"}
        </button>
        <span className="bank-count">{visible.length} of {inGame.length} item{inGame.length === 1 ? "" : "s"}</span>
      </div>

      {(showForm || editing) && (
        <BankItemForm
          key={editing?.id ?? `new-${activeGame}`}
          game={activeGame}
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSubmit={async (payload) => {
            if (editing) await onUpdate(editing.id, payload);
            else await onCreate(payload);
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {visible.length === 0 && !showForm && (
        <p className="bank-empty">
          {inGame.length === 0
            ? "Nothing in this bank yet — add a card above, or save one from a pocket's New tab."
            : "No items match these filters."}
        </p>
      )}

      <div className="bank-grid">
        {visible.map((item) => (
          <article
            key={item.id}
            className="bank-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-bindarr-bank", item.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title="Drag onto a binder pocket, or use Place"
          >
            <div className="bank-card-img">
              {item.image ? <img src={item.image} alt={item.name} /> : <div className="bank-card-noimg">{item.name}</div>}
              <div className="card-overlay">
                <div className="card-overlay-name">{item.name}</div>
                <div className="card-overlay-meta">
                  {[item.set, item.number ? `#${item.number}` : ""].filter(Boolean).join(", ")}
                  {item.game === "misc" && item.appliesToGame ? `For ${item.appliesToGame}` : ""}
                </div>
              </div>
            </div>
            <div className="bank-card-tags">
              {item.collection && <span className="mini-chip">{item.collection}</span>}
              {item.tags.map((t) => <span key={t} className="mini-chip">{t}</span>)}
            </div>
            <div className="bank-card-actions">
              <button onClick={() => onPlace(item)}>Place</button>
              <button onClick={() => { setEditing(item); setShowForm(false); }}>Edit</button>
              <button
                onClick={() => {
                  if (window.confirm(`Remove "${item.name}" from the bank? Pockets already filled with it keep their copy.`)) void onDelete(item.id);
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

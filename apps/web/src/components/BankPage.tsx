import { useMemo, useRef, useState } from "react";
import { BANK_LABELS, type BankItem } from "@bindarr/shared";
import { BankFiltersBar, emptyFilters, filterBankItems, type BankFilters } from "./BankPicker.js";
import BankItemForm from "./BankItemForm.js";
import ArtistLinkButton from "./ArtistLinkButton.js";
import IconButton, { PencilIcon, TrashIcon } from "./IconButton.js";
import Modal from "./Modal.js";
import { importBankItems } from "../api.js";

export type CollectionMode = "bank" | "wishlist";

function toCsv(items: BankItem[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["name", "set", "number", "artist", "evolutionLine", "collection", "tags", "have", "want", "image"];
  const rows = items.map((i) => [i.name, i.set, i.number, i.artist ?? "", i.evolutionLine ?? "", i.collection ?? "", i.tags.join("; "), i.have, i.want, i.image ?? ""].map(esc).join(","));
  return [header.join(","), ...rows].join("\n");
}

function parseCsv(text: string, game: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted && ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return {
      game,
      name: row.name ?? "",
      set: row.set ?? "",
      number: row.number ?? "",
      artist: row.artist || null,
      evolutionLine: row.evolutionline || null,
      collection: row.collection || null,
      tags: (row.tags ?? "").split(";").map((t) => t.trim()).filter(Boolean),
      have: row.have !== "false",
      want: row.want === "true",
      image: row.image || null,
    };
  }).filter((r) => r.name);
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BankPage({
  mode,
  items,
  visibleBanks,
  onCreate,
  onUpdate,
  onDelete,
  onPlace,
  onArtist,
  onImported,
}: {
  mode: CollectionMode;
  items: BankItem[];
  visibleBanks: string[];
  onCreate: (payload: Record<string, unknown>) => Promise<BankItem>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPlace: (item: BankItem) => void;
  onArtist: (name: string) => void;
  onImported: () => Promise<void>;
}) {
  const [game, setGame] = useState(visibleBanks[0] ?? "pokemon");
  const [filters, setFilters] = useState<BankFilters>(emptyFilters);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankItem | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activeGame = visibleBanks.includes(game) ? game : (visibleBanks[0] ?? "pokemon");
  const inMode = useMemo(() => items.filter((i) => (mode === "bank" ? i.have : i.want)), [items, mode]);
  const inGame = useMemo(() => inMode.filter((i) => i.game === activeGame), [inMode, activeGame]);
  const visible = useMemo(() => filterBankItems(inGame, filters), [inGame, filters]);
  const isWishlist = mode === "wishlist";
  const formOpen = showForm || !!editing;

  const formTitle = editing
    ? `Edit ${editing.name}`
    : activeGame === "misc"
      ? "Add misc item"
      : isWishlist
        ? "Add wanted card"
        : "Add card";

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = file.name.endsWith(".csv") || !text.trim().startsWith("[")
        ? parseCsv(text, activeGame)
        : (JSON.parse(text) as Record<string, unknown>[]);
      if (!parsed.length) { setNotice("No importable items found in that file."); return; }
      const result = await importBankItems(parsed);
      await onImported();
      setNotice(`Imported: ${result.created} new, ${result.updated} updated.`);
    } catch {
      setNotice("Import failed — check the file format and try again.");
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <section className="page-section">
      <h2 className="page-title">{isWishlist ? "Wishlist" : "Cards"}</h2>
      <p className="page-sub">
        {isWishlist
          ? "Cards you want but don't have yet. They show in black & white in binders until you mark them obtained."
          : "Cards and items you own. Place them into pockets from here, drag them onto a pocket, or pick them from a pocket's Bank tab."}
      </p>

      <div className="collection-layout">
        <aside className="collection-sidebar" aria-label="Banks">
          {visibleBanks.map((b) => {
            const count = items.filter((i) => i.game === b && (isWishlist ? i.want : i.have)).length;
            return (
              <button
                key={b}
                type="button"
                className={`collection-bank${activeGame === b ? " active" : ""}`}
                onClick={() => { setGame(b); closeForm(); }}
              >
                <span>{BANK_LABELS[b] ?? b}</span>
                <span className="collection-count">{count}</span>
              </button>
            );
          })}
        </aside>

        <div className="collection-main">
          <BankFiltersBar items={inGame} filters={filters} onChange={setFilters} />

          <div className="bank-actions-row">
            <button
              type="button"
              className="btn btn-primary primary-btn"
              onClick={() => { setEditing(null); setShowForm(true); }}
            >
              {activeGame === "misc" ? "+ Add misc item" : isWishlist ? "+ Add wanted card" : "+ Add card"}
            </button>
            <span className="bank-count">{visible.length} of {inGame.length} item{inGame.length === 1 ? "" : "s"}</span>
            <span className="export-import">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => download(`${mode}-${activeGame}.json`, JSON.stringify(visible, null, 2), "application/json")}
              >
                Export JSON
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => download(`${mode}-${activeGame}.csv`, toCsv(visible), "text/csv")}
              >
                Export CSV
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ""; }}
              />
            </span>
          </div>
          {notice && <p className="import-notice" role="status">{notice}</p>}

          {formOpen && (
            <Modal title={formTitle} onClose={closeForm}>
              <BankItemForm
                key={editing?.id ?? `new-${activeGame}-${mode}`}
                game={activeGame}
                initial={editing}
                defaultHave={!isWishlist}
                defaultWant={isWishlist}
                onCancel={closeForm}
                onSubmit={async (payload) => {
                  if (editing) await onUpdate(editing.id, payload);
                  else await onCreate(payload);
                  closeForm();
                }}
              />
            </Modal>
          )}

          {visible.length === 0 && (
            <p className="bank-empty">
              {inGame.length === 0
                ? isWishlist ? "Nothing on this wishlist yet — add a card you want above." : "Nothing in this bank yet — add a card above, or save one from a pocket's New tab."
                : "No items match these filters."}
            </p>
          )}

          <div className="bank-grid">
            {visible.map((item) => (
              <article
                key={item.id}
                className={`bank-card${item.want && !item.have ? " wishlist-only" : ""}`}
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
                  {item.have && <span className="mini-chip flag-have">Have</span>}
                  {item.want && <span className="mini-chip flag-want">Want</span>}
                </div>
                <div className="bank-card-actions">
                  <button type="button" className="bank-card-action-primary" onClick={() => onPlace(item)}>Place</button>
                  {isWishlist && (
                    <button
                      type="button"
                      className="bank-card-action-secondary"
                      onClick={() => void onUpdate(item.id, { ...item, have: true, want: false })}
                    >
                      Mark obtained
                    </button>
                  )}
                  {!isWishlist && (
                    <button
                      type="button"
                      className="bank-card-action-secondary"
                      aria-pressed={item.want}
                      onClick={() => void onUpdate(item.id, { ...item, want: !item.want })}
                    >
                      {item.want ? "Wanting ✓" : "Want it"}
                    </button>
                  )}
                  <div className="bank-card-actions-icons">
                    {item.artist && <ArtistLinkButton artist={item.artist} onClick={onArtist} />}
                    <IconButton label="Edit" onClick={() => { setEditing(item); setShowForm(false); }}>
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      label={`Delete ${item.name}`}
                      onClick={() => {
                        if (window.confirm(`Remove "${item.name}"? Pockets already filled with it keep their copy.`)) void onDelete(item.id);
                      }}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

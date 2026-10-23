import { useMemo, useRef, useState } from "react";
import { BANK_LABELS, type BankItem } from "@bindarr/shared";
import { BankFiltersBar, emptyFilters, filterBankItems, type BankFilters } from "./BankPicker.js";
import BankItemForm from "./BankItemForm.js";
import ArtistLinkButton from "./ArtistLinkButton.js";
import IconButton, { PencilIcon, TrashIcon } from "./IconButton.js";
import ImportPreviewModal from "./ImportPreviewModal.js";
import Modal from "./Modal.js";
import { importBankItems } from "../api.js";
import {
  applyFirstLookupToItem,
  filterByImage,
  lookupCardsWithFallbacks,
  needsImageEnrich,
  sortBankItems,
  type BankSortBy,
  type BankSortOrder,
  type ImageFilter,
} from "../bankEnrich.js";
import { parseBankImport, type BankImportFormat } from "../bankImport.js";

export type CollectionMode = "bank" | "wishlist";

function toCsv(items: BankItem[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["name", "set", "number", "artist", "evolutionLine", "collection", "tags", "have", "want", "image"];
  const rows = items.map((i) => [i.name, i.set, i.number, i.artist ?? "", i.evolutionLine ?? "", i.collection ?? "", i.tags.join("; "), i.have, i.want, i.image ?? ""].map(esc).join(","));
  return [header.join(","), ...rows].join("\n");
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

  const [importPreview, setImportPreview] = useState<{
    items: Record<string, unknown>[];
    format: BankImportFormat;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [enriching, setEnriching] = useState(false);
  const enrichCancelRef = useRef(false);
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortBy, setSortBy] = useState<BankSortBy>("name");
  const [sortOrder, setSortOrder] = useState<BankSortOrder>("asc");

  const activeGame = visibleBanks.includes(game) ? game : (visibleBanks[0] ?? "pokemon");
  const inMode = useMemo(() => items.filter((i) => (mode === "bank" ? i.have : i.want)), [items, mode]);
  const inGame = useMemo(() => inMode.filter((i) => i.game === activeGame), [inMode, activeGame]);
  const visible = useMemo(() => {
    const filtered = filterByImage(filterBankItems(inGame, filters), imageFilter);
    return sortBankItems(filtered, sortBy, sortOrder);
  }, [inGame, filters, imageFilter, sortBy, sortOrder]);
  const isWishlist = mode === "wishlist";
  const formOpen = showForm || !!editing;
  const missingImageCount = useMemo(
    () => (activeGame === "misc" ? 0 : visible.filter(needsImageEnrich).length),
    [visible, activeGame],
  );

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
      const { format, items: parsed } = parseBankImport(text, activeGame, file.name);
      if (!parsed.length) {
        setNotice("No importable items found in that file.");
        return;
      }
      setImportPreview({ items: parsed, format });
    } catch {
      setNotice("Import failed — check the file format and try again.");
    }
  }

  async function confirmImport(selected: Record<string, unknown>[]) {
    if (!importPreview || !selected.length) return;
    setImporting(true);
    try {
      const result = await importBankItems(selected);
      await onImported();
      const source = importPreview.format === "pricecharting" ? " from PriceCharting" : "";
      setNotice(`Imported${source}: ${result.created} new, ${result.updated} updated.`);
      setImportPreview(null);
    } catch {
      setNotice("Import failed — check the file format and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function fillMissingImages() {
    if (activeGame === "misc" || enriching) return;
    const targets = visible.filter(needsImageEnrich);
    if (!targets.length) {
      setNotice("No cards missing images in the current view.");
      return;
    }
    const ok = window.confirm(
      `Look up ${targets.length} card${targets.length === 1 ? "" : "s"} on Pokémon TCG and fill missing image (and empty fields) from the first match?`,
    );
    if (!ok) return;

    enrichCancelRef.current = false;
    setEnriching(true);
    let filled = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < targets.length; i++) {
      if (enrichCancelRef.current) break;
      const item = targets[i];
      setNotice(`Looking up ${i + 1} of ${targets.length}: ${item.name}…`);
      try {
        const cards = await lookupCardsWithFallbacks({
          name: item.name,
          number: item.number ?? "",
          set: item.set ?? "",
        });
        if (!cards.length || !cards[0].imageSmall) {
          skipped += 1;
          continue;
        }
        const patch = applyFirstLookupToItem(item, cards[0]);
        await onUpdate(item.id, patch);
        filled += 1;
      } catch {
        errors += 1;
      }
    }

    const stopped = enrichCancelRef.current ? " (stopped early)" : "";
    setNotice(`Filled ${filled} · skipped ${skipped} (no match) · ${errors} error${errors === 1 ? "" : "s"}${stopped}.`);
    setEnriching(false);
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

          <div className="bank-view-controls">
            <div className="bank-flag-toggle" role="group" aria-label="Picture filter">
              {([
                ["all", "All"],
                ["with", "With pictures"],
                ["without", "Without pictures"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`game-tab${imageFilter === id ? " active" : ""}`}
                  onClick={() => setImageFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="bank-sort-control">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as BankSortBy)} aria-label="Sort by">
                <option value="name">Name</option>
                <option value="set">Set</option>
                <option value="number">Number</option>
                <option value="artist">Artist</option>
              </select>
            </label>
            <label className="bank-sort-control">
              <span>Order</span>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as BankSortOrder)} aria-label="Sort order">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>

          <div className="bank-actions-row">
            <button
              type="button"
              className="btn btn-primary primary-btn"
              onClick={() => { setEditing(null); setShowForm(true); }}
            >
              {activeGame === "misc" ? "+ Add misc item" : isWishlist ? "+ Add wanted card" : "+ Add card"}
            </button>
            {activeGame !== "misc" && (
              enriching ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { enrichCancelRef.current = true; }}
                >
                  Stop filling
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={missingImageCount === 0}
                  title={missingImageCount === 0 ? "No cards missing images in this view" : undefined}
                  onClick={() => void fillMissingImages()}
                >
                  Fill missing images{missingImageCount > 0 ? ` (${missingImageCount})` : ""}
                </button>
              )
            )}
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

          {importPreview && (
            <ImportPreviewModal
              items={importPreview.items}
              format={importPreview.format}
              importing={importing}
              onCancel={() => { if (!importing) setImportPreview(null); }}
              onConfirm={(selected) => void confirmImport(selected)}
            />
          )}

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

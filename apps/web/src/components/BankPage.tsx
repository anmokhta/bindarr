import { useEffect, useMemo, useRef, useState } from "react";
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
import { addTags, parseTagList, removeTags, setCollection } from "../bankBulk.js";
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
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [enrichLog, setEnrichLog] = useState<Array<{ name: string; status: "filled" | "skipped" | "error"; detail?: string }>>([]);
  const [enrichSummary, setEnrichSummary] = useState("");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortBy, setSortBy] = useState<BankSortBy>("name");
  const [sortOrder, setSortOrder] = useState<BankSortOrder>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const activeGame = visibleBanks.includes(game) ? game : (visibleBanks[0] ?? "pokemon");
  const inMode = useMemo(() => items.filter((i) => (mode === "bank" ? i.have : i.want)), [items, mode]);
  const inGame = useMemo(() => inMode.filter((i) => i.game === activeGame), [inMode, activeGame]);
  const visible = useMemo(() => {
    const filtered = filterByImage(filterBankItems(inGame, filters), imageFilter);
    return sortBankItems(filtered, sortBy, sortOrder);
  }, [inGame, filters, imageFilter, sortBy, sortOrder]);
  const isWishlist = mode === "wishlist";
  const formOpen = showForm || !!editing;
  const visibleIds = useMemo(() => new Set(visible.map((i) => i.id)), [visible]);
  const selectedVisible = useMemo(
    () => visible.filter((i) => selectedIds.has(i.id)),
    [visible, selectedIds],
  );
  const missingImageCount = useMemo(() => {
    if (activeGame === "misc") return 0;
    const pool = selectedVisible.length ? selectedVisible : visible;
    return pool.filter(needsImageEnrich).length;
  }, [visible, selectedVisible, activeGame]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeGame, mode]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

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

  async function identifyCards(targets: BankItem[]) {
    if (activeGame === "misc" || enriching) return;
    const list = targets.filter(needsImageEnrich);
    if (!list.length) {
      setNotice("No cards missing images in the current selection.");
      return;
    }
    const ok = window.confirm(
      `Identify ${list.length} card${list.length === 1 ? "" : "s"} on Pokémon TCG and fill missing image (and empty fields) from the first match?`,
    );
    if (!ok) return;

    enrichCancelRef.current = false;
    setEnriching(true);
    setEnrichLog([]);
    setEnrichSummary("");
    setNotice("");
    const log: Array<{ name: string; status: "filled" | "skipped" | "error"; detail?: string }> = [];
    let filled = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < list.length; i++) {
      if (enrichCancelRef.current) break;
      const item = list[i];
      setEnrichProgress({ current: i + 1, total: list.length, name: item.name });
      try {
        const cards = await lookupCardsWithFallbacks({
          name: item.name,
          number: item.number ?? "",
          set: item.set ?? "",
        });
        if (!cards.length) {
          skipped += 1;
          log.push({ name: item.name, status: "skipped", detail: "no match" });
          setEnrichLog([...log]);
          continue;
        }
        if (!cards[0].imageSmall) {
          skipped += 1;
          log.push({ name: item.name, status: "skipped", detail: "match had no image" });
          setEnrichLog([...log]);
          continue;
        }
        const patch = applyFirstLookupToItem(item, cards[0]);
        await onUpdate(item.id, patch);
        filled += 1;
        log.push({ name: item.name, status: "filled" });
        setEnrichLog([...log]);
      } catch (e) {
        errors += 1;
        log.push({
          name: item.name,
          status: "error",
          detail: e instanceof Error ? e.message : "Lookup failed",
        });
        setEnrichLog([...log]);
      }
    }

    const stopped = enrichCancelRef.current ? " (stopped early)" : "";
    setEnrichSummary(
      `Identified ${filled} · skipped ${skipped} (no match) · ${errors} error${errors === 1 ? "" : "s"}${stopped}.`,
    );
    setEnrichProgress(null);
    setEnriching(false);
  }

  function dismissEnrichReport() {
    setEnrichLog([]);
    setEnrichSummary("");
    setEnrichProgress(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visible.map((i) => i.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkAddTags() {
    const raw = window.prompt("Add tags (comma-separated):");
    if (raw == null) return;
    const tags = parseTagList(raw);
    if (!tags.length) return;
    for (const item of selectedVisible) {
      await onUpdate(item.id, addTags(item, tags));
    }
  }

  async function bulkRemoveTags() {
    const raw = window.prompt("Remove tags (comma-separated):");
    if (raw == null) return;
    const tags = parseTagList(raw);
    if (!tags.length) return;
    for (const item of selectedVisible) {
      await onUpdate(item.id, removeTags(item, tags));
    }
  }

  async function bulkSetCollection() {
    const raw = window.prompt("Set collection (leave empty to clear):");
    if (raw == null) return;
    for (const item of selectedVisible) {
      await onUpdate(item.id, setCollection(item, raw));
    }
  }

  async function bulkDelete() {
    const n = selectedVisible.length;
    if (!n) return;
    const ok = window.confirm(
      `Remove ${n} selected card${n === 1 ? "" : "s"}? Pockets already filled with them keep their copies.`,
    );
    if (!ok) return;
    for (const item of selectedVisible) {
      await onDelete(item.id);
    }
    clearSelection();
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
                  Stop identifying
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={missingImageCount === 0}
                  title={
                    missingImageCount === 0
                      ? "No cards missing images in the current selection/view"
                      : selectedVisible.length
                        ? "Identify selected cards missing images"
                        : "Identify cards missing images in this view"
                  }
                  onClick={() => void identifyCards(selectedVisible.length ? selectedVisible : visible)}
                >
                  {selectedVisible.length ? "Identify" : "Identify all"}
                  {missingImageCount > 0 ? ` (${missingImageCount})` : ""}
                </button>
              )
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={!visible.length} onClick={selectAllVisible}>
              Select all
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

          {selectedVisible.length > 0 && (
            <div className="bank-bulk-bar" role="toolbar" aria-label="Bulk actions">
              <span className="bank-count">{selectedVisible.length} selected</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection}>Clear</button>
              {activeGame !== "misc" && !enriching && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={selectedVisible.filter(needsImageEnrich).length === 0}
                  onClick={() => void identifyCards(selectedVisible)}
                >
                  Identify
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void bulkAddTags()}>Add tags</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void bulkRemoveTags()}>Remove tags</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void bulkSetCollection()}>Set collection</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void bulkDelete()}>Delete</button>
            </div>
          )}

          {(enriching || enrichSummary || enrichLog.some((e) => e.status !== "filled")) && (
            <div className="bank-enrich-status" role="status">
              {enrichProgress && (
                <p className="bank-enrich-progress">
                  Looking up {enrichProgress.current} of {enrichProgress.total}: {enrichProgress.name}…
                </p>
              )}
              {enrichSummary && !enriching && (
                <div className="bank-enrich-summary-row">
                  <p className="import-notice">{enrichSummary}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={dismissEnrichReport}>
                    Dismiss
                  </button>
                </div>
              )}
              {enrichLog.filter((e) => e.status !== "filled").length > 0 && (
                <ul className="bank-enrich-log">
                  {enrichLog
                    .filter((e) => e.status !== "filled")
                    .map((e, idx) => (
                      <li key={`${e.name}-${idx}`}>
                        <span className={`bank-enrich-log-${e.status}`}>{e.status}</span>
                        {" · "}
                        {e.name}
                        {e.detail ? ` — ${e.detail}` : ""}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

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
                className={`bank-card${item.want && !item.have ? " wishlist-only" : ""}${selectedIds.has(item.id) ? " selected" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-bindarr-bank", item.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title="Drag onto a binder pocket, or use Place"
              >
                <label className="bank-card-select" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.name}`}
                  />
                </label>
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

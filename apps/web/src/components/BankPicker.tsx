import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BANK_LABELS, type BankItem } from "@bindarr/shared";

export interface BankFilters {
  query: string;
  includeEvolutions: boolean;
  set: string[];
  artist: string[];
  evolutionLine: string[];
  collection: string[];
  tag: string[];
}

export const emptyFilters: BankFilters = {
  query: "",
  includeEvolutions: false,
  set: [],
  artist: [],
  evolutionLine: [],
  collection: [],
  tag: [],
};

function matchesQuery(item: BankItem, q: string, includeEvolutions: boolean): boolean {
  if (!q) return true;
  const base = `${item.name} ${item.set} ${item.number} ${item.artist ?? ""} ${item.collection ?? ""} ${item.tags.join(" ")}`.toLowerCase();
  if (base.includes(q)) return true;
  if (!includeEvolutions) return false;
  return (item.evolutionLine ?? "").toLowerCase().includes(q);
}

export function filterBankItems(items: BankItem[], f: BankFilters): BankItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((i) => {
    if (!matchesQuery(i, q, f.includeEvolutions)) return false;
    if (f.set.length && !f.set.includes(i.set)) return false;
    if (f.artist.length && !(i.artist && f.artist.includes(i.artist))) return false;
    if (f.evolutionLine.length && !(i.evolutionLine && f.evolutionLine.includes(i.evolutionLine))) return false;
    if (f.collection.length && !(i.collection && f.collection.includes(i.collection))) return false;
    if (f.tag.length && !f.tag.some((t) => i.tags.includes(t))) return false;
    return true;
  });
}

function distinct(items: BankItem[], pick: (i: BankItem) => string | null): string[] {
  return [...new Set(items.map(pick).filter(Boolean) as string[])].sort();
}

function countsBy(items: BankItem[], pick: (i: BankItem) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const v = pick(item);
    if (!v) continue;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function MultiSelectFilter({
  label,
  allLabel,
  plural,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  plural: string;
  options: string[];
  counts?: Record<string, number>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    searchRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return [...base].sort((a, b) => {
      const aSel = selectedSet.has(a) ? 0 : 1;
      const bSel = selectedSet.has(b) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [options, q, selectedSet]);

  const triggerLabel =
    selected.length === 0 ? allLabel
      : selected.length === 1 ? selected[0]
        : `${selected.length} ${plural}`;
  const triggerTitle =
    selected.length === 0 ? allLabel
      : selected.length === 1 ? selected[0]
        : selected.join(", ");

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  function selectShown() {
    const next = new Set(selected);
    for (const opt of filtered) next.add(opt);
    onChange([...next]);
  }

  return (
    <div className={`multi-select${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`multi-select-trigger${selected.length ? " active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        title={triggerTitle}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multi-select-trigger-label">{triggerLabel}</span>
        <span className="multi-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multi-select-panel" id={listId} role="listbox" aria-multiselectable="true" aria-label={label}>
          <div className="multi-select-toolbar">
            <input
              ref={searchRef}
              className="multi-select-search"
              type="search"
              placeholder={`Search ${plural}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={`Search ${plural}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="multi-select-toolbar-actions">
              {filtered.length > 0 && (
                <button type="button" className="multi-select-clear" onClick={selectShown}>
                  Select shown
                </button>
              )}
              {selected.length > 0 && (
                <button type="button" className="multi-select-clear" onClick={() => onChange([])}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {options.length === 0 ? (
            <p className="multi-select-empty">No options yet</p>
          ) : filtered.length === 0 ? (
            <p className="multi-select-empty">No matches</p>
          ) : (
            filtered.map((opt) => {
              const checked = selected.includes(opt);
              const count = counts?.[opt];
              const display = count != null ? `${opt} (${count})` : opt;
              return (
                <label
                  key={opt}
                  className={`multi-select-option${checked ? " checked" : ""}`}
                  title={opt}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt)}
                    aria-label={opt}
                  />
                  <span aria-hidden="true">{display}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function BankFiltersBar({
  items,
  filters,
  onChange,
}: {
  items: BankItem[];
  filters: BankFilters;
  onChange: (f: BankFilters) => void;
}) {
  const patch = (p: Partial<BankFilters>) => onChange({ ...filters, ...p });
  return (
    <div className="bank-filters-bar">
      <div className="bank-search-row">
        <input
          className="bank-search"
          placeholder="Search by name, set, artist…"
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
        />
        <label className="bank-include-evo">
          <input
            type="checkbox"
            checked={filters.includeEvolutions}
            onChange={(e) => patch({ includeEvolutions: e.target.checked })}
          />
          Include evolutions
        </label>
      </div>
      <div className="bank-filter-selects">
        <MultiSelectFilter
          label="Sets"
          allLabel="All sets"
          plural="sets"
          options={distinct(items, (i) => i.set || null)}
          counts={countsBy(items, (i) => i.set || null)}
          selected={filters.set}
          onChange={(next) => patch({ set: next })}
        />
        <MultiSelectFilter
          label="Artists"
          allLabel="All artists"
          plural="artists"
          options={distinct(items, (i) => i.artist)}
          counts={countsBy(items, (i) => i.artist)}
          selected={filters.artist}
          onChange={(next) => patch({ artist: next })}
        />
        <MultiSelectFilter
          label="Evolution lines"
          allLabel="All evolution lines"
          plural="evolution lines"
          options={distinct(items, (i) => i.evolutionLine)}
          counts={countsBy(items, (i) => i.evolutionLine)}
          selected={filters.evolutionLine}
          onChange={(next) => patch({ evolutionLine: next })}
        />
        <MultiSelectFilter
          label="Collections"
          allLabel="All collections"
          plural="collections"
          options={distinct(items, (i) => i.collection)}
          counts={countsBy(items, (i) => i.collection)}
          selected={filters.collection}
          onChange={(next) => patch({ collection: next })}
        />
        <MultiSelectFilter
          label="Tags"
          allLabel="All tags"
          plural="tags"
          options={[...new Set(items.flatMap((i) => i.tags))].sort()}
          counts={Object.fromEntries(
            [...new Set(items.flatMap((i) => i.tags))].map((t) => [
              t,
              items.filter((i) => i.tags.includes(t)).length,
            ]),
          )}
          selected={filters.tag}
          onChange={(next) => patch({ tag: next })}
        />
      </div>
    </div>
  );
}

export default function BankPicker({
  items,
  banks,
  onFill,
}: {
  items: BankItem[];
  banks: string[];
  onFill: (item: BankItem) => void;
}) {
  const [game, setGame] = useState(banks[0] ?? "pokemon");
  const [filters, setFilters] = useState<BankFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<"all" | "have" | "want">("all");

  const inGameAll = useMemo(() => items.filter((i) => i.game === game), [items, game]);
  const inGame = useMemo(
    () => inGameAll.filter((i) => flagFilter === "all" || (flagFilter === "have" ? i.have : i.want)),
    [inGameAll, flagFilter],
  );
  const visible = useMemo(() => filterBankItems(inGame, filters), [inGame, filters]);
  const selected = visible.find((i) => i.id === selectedId) ?? inGame.find((i) => i.id === selectedId);

  return (
    <div className="bank-picker">
      <div className="bank-game-tabs">
        {banks.map((b) => (
          <button key={b} className={`game-tab${game === b ? " active" : ""}`} onClick={() => { setGame(b); setSelectedId(null); }}>
            {BANK_LABELS[b] ?? b}
          </button>
        ))}
      </div>
      <div className="bank-flag-toggle" role="group" aria-label="Have or wishlist">
        {(["all", "have", "want"] as const).map((f) => (
          <button key={f} className={`game-tab${flagFilter === f ? " active" : ""}`} onClick={() => setFlagFilter(f)}>
            {f === "all" ? "All" : f === "have" ? "Have" : "Wishlist"}
          </button>
        ))}
      </div>
      <BankFiltersBar items={inGame} filters={filters} onChange={setFilters} />
      <div className="bank-picker-list">
        {visible.length === 0 && <p className="bank-empty">No cards match — try another filter, or add one in the New tab.</p>}
        {visible.map((item) => (
          <div
            key={item.id}
            className={`bank-picker-item${selectedId === item.id ? " selected" : ""}${item.want && !item.have ? " wishlist-only" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-bindarr-bank", item.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setSelectedId(item.id)}
            onDoubleClick={() => onFill(item)}
            title="Click to select, double-click or use Fill to place, or drag onto a pocket"
          >
            {item.image && <img src={item.image} alt="" />}
            <span className="bank-picker-name">{item.name}</span>
            <span className="bank-picker-meta">
              {[item.set, item.number ? `#${item.number}` : ""].filter(Boolean).join(" ")}
              {item.collection ? ` · ${item.collection}` : ""}
            </span>
          </div>
        ))}
      </div>
      <button className="save-btn bank-fill-btn" disabled={!selected} onClick={() => selected && onFill(selected)}>
        {selected ? `Fill this pocket with ${selected.name}` : "Select a card to fill this pocket"}
      </button>
    </div>
  );
}

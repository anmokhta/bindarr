import { useMemo, useState } from "react";
import { BANK_LABELS, type BankItem } from "@bindarr/shared";

export interface BankFilters {
  query: string;
  set: string;
  artist: string;
  evolutionLine: string;
  collection: string;
  tag: string;
}

export const emptyFilters: BankFilters = { query: "", set: "", artist: "", evolutionLine: "", collection: "", tag: "" };

export function filterBankItems(items: BankItem[], f: BankFilters): BankItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((i) => {
    if (q && !`${i.name} ${i.set} ${i.number} ${i.artist ?? ""} ${i.evolutionLine ?? ""} ${i.collection ?? ""} ${i.tags.join(" ")}`.toLowerCase().includes(q)) return false;
    if (f.set && i.set !== f.set) return false;
    if (f.artist && i.artist !== f.artist) return false;
    if (f.evolutionLine && i.evolutionLine !== f.evolutionLine) return false;
    if (f.collection && i.collection !== f.collection) return false;
    if (f.tag && !i.tags.includes(f.tag)) return false;
    return true;
  });
}

function distinct(items: BankItem[], pick: (i: BankItem) => string | null): string[] {
  return [...new Set(items.map(pick).filter(Boolean) as string[])].sort();
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
  const set = (patch: Partial<BankFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="bank-filters-bar">
      <input
        className="bank-search"
        placeholder="Search by name, set, artist, evolution…"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
      />
      <div className="bank-filter-selects">
        <select value={filters.set} onChange={(e) => set({ set: e.target.value })}>
          <option value="">All sets</option>
          {distinct(items, (i) => i.set || null).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.artist} onChange={(e) => set({ artist: e.target.value })}>
          <option value="">All artists</option>
          {distinct(items, (i) => i.artist).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.evolutionLine} onChange={(e) => set({ evolutionLine: e.target.value })}>
          <option value="">All evolution lines</option>
          {distinct(items, (i) => i.evolutionLine).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.collection} onChange={(e) => set({ collection: e.target.value })}>
          <option value="">All collections</option>
          {distinct(items, (i) => i.collection).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">All tags</option>
          {[...new Set(items.flatMap((i) => i.tags))].sort().map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
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

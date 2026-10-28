import { useCallback, useEffect, useRef, useState } from "react";
import {
  BINDER_TYPES,
  STORAGE_KEY,
  defaultState,
  makeBinder,
  resizeBinderSheets,
  sheetCountOf,
  spreadCount,
  spreadIndexForSide,
  spreadLabel,
  spreadSides,
  totalSlotsOf,
  parsePlannerState,
  bankItemToSlot,
  defaultSettings,
  type AppSettings,
  type BankItem,
  type CardSlot,
  type PlannerState,
} from "@bindarr/shared";
import {
  createBankItem,
  deleteBankItem,
  fetchBank,
  fetchHealth,
  fetchSettings,
  fetchState,
  saveSettings,
  saveState,
  takeWriteLease,
  updateBankItem,
  type HealthInfo,
} from "./api.js";
import Pocket from "./components/Pocket.js";
import PocketEditor from "./components/PocketEditor.js";
import BankPage from "./components/BankPage.js";
import BindersPage from "./components/BindersPage.js";
import SettingsPage, { applyTheme, initialTheme } from "./components/SettingsPage.js";
import ArtistSearchPage from "./components/ArtistSearchPage.js";
import BulkAddPage from "./components/BulkAddPage.js";
import SubNav from "./components/SubNav.js";
import { CollectionsPage, TagsPage } from "./components/TaxonomyPages.js";
import { previousRoute, useRoute, type Route } from "./router.js";

type SaveStatus = "loading" | "saved" | "saving" | "error";
type View = "planner" | "bank" | "wishlist" | "bulkAdd" | "tags" | "collections" | "binders" | "artist" | "settings";

const VIEW_PATHS: Record<View, string> = {
  planner: "/binders/planner",
  bank: "/bank/cards",
  wishlist: "/bank/wishlist",
  bulkAdd: "/bank/bulk-add",
  tags: "/bank/tags",
  collections: "/bank/collections",
  binders: "/binders/manage",
  artist: "/extras/artist-search",
  settings: "/settings",
};

function viewForRoute(route: Route): View {
  switch (route) {
    case "/bank/cards": return "bank";
    case "/bank/wishlist": return "wishlist";
    case "/bank/bulk-add": return "bulkAdd";
    case "/bank/tags": return "tags";
    case "/bank/collections": return "collections";
    case "/binders/manage": return "binders";
    case "/extras/artist-search": return "artist";
    case "/settings": return "settings";
    default: return "planner";
  }
}

type Section = "bank" | "binders" | "extras";

const SECTIONS: { id: Section; label: string; defaultView: View; subsections: [View, string][] }[] = [
  {
    id: "bank",
    label: "Bank",
    defaultView: "bank",
    subsections: [
      ["bank", "Cards"],
      ["wishlist", "Wishlist"],
      ["bulkAdd", "Bulk add"],
      ["tags", "Tags"],
      ["collections", "Collections"],
    ],
  },
  { id: "binders", label: "Binders", defaultView: "planner", subsections: [["planner", "Planner"], ["binders", "Manage Binders"]] },
  { id: "extras", label: "Extras", defaultView: "artist", subsections: [["artist", "Artist Search"]] },
];

function sectionForView(view: View): Section {
  if (view === "bank" || view === "wishlist" || view === "bulkAdd" || view === "tags" || view === "collections") return "bank";
  if (view === "artist") return "extras";
  return "binders";
}

export default function App() {
  const [state, setState] = useState<PlannerState>(defaultState);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [editing, setEditing] = useState<{ page: number; slot: number } | null>(null);
  const [sheetNotice, setSheetNotice] = useState("");
  const [pageScale, setPageScale] = useState<number>(() => { try { const v = Number(localStorage.getItem("bindarr-page-scale")); return v >= 60 && v <= 130 ? v : 100; } catch { return 100; } });
  const [legacyAvailable, setLegacyAvailable] = useState<PlannerState | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [route, navigate] = useRoute();
  const view = viewForRoute(route);
  const go = (v: View) => navigate(VIEW_PATHS[v]);
  const settingsBack = () => navigate(previousRoute());
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings());
  const [placingItem, setPlacingItem] = useState<BankItem | null>(null);
  const [writeMode, setWriteMode] = useState(true);
  const [writerInfo, setWriterInfo] = useState<HealthInfo["writer"]>(undefined);
  const [takingLease, setTakingLease] = useState(false);

  useEffect(() => { applyTheme(initialTheme()); }, []);

  useEffect(() => {
    fetchBank().then(setBankItems).catch(() => { /* bank unavailable — planner still works */ });
    fetchSettings().then(setAppSettings).catch(() => { /* defaults */ });
    const refreshAccess = () => {
      fetchHealth()
        .then((h) => {
          setWriteMode(h.writeMode !== false);
          setWriterInfo(h.writeMode === false ? h.writer : undefined);
        })
        .catch(() => { /* ignore */ });
    };
    refreshAccess();
    const id = window.setInterval(refreshAccess, 15_000);
    return () => window.clearInterval(id);
  }, []);

  async function handleTakeWriteAccess() {
    const ok = window.confirm(
      "Only continue if no other Bindarr is using this database. Taking over while another instance is still writing can corrupt data.\n\nTake write access?",
    );
    if (!ok || takingLease) return;
    setTakingLease(true);
    try {
      const h = await takeWriteLease();
      setWriteMode(h.writeMode !== false);
      setWriterInfo(h.writeMode === false ? h.writer : undefined);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not take write access");
    } finally {
      setTakingLease(false);
    }
  }

  // Esc cancels click-to-place mode.
  useEffect(() => {
    if (!placingItem) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlacingItem(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingItem]);

  async function handleCreateBankItem(payload: Record<string, unknown>): Promise<BankItem> {
    const item = await createBankItem(payload);
    setBankItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
    return item;
  }

  async function handleUpdateBankItem(id: string, payload: Record<string, unknown>): Promise<void> {
    const item = await updateBankItem(id, payload);
    setBankItems((prev) => prev.map((i) => (i.id === id ? item : i)));
  }

  async function handleDeleteBankItem(id: string): Promise<void> {
    await deleteBankItem(id);
    setBankItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleSaveSettings(next: AppSettings): Promise<void> {
    setAppSettings(next);
    try { setAppSettings(await saveSettings(next)); } catch { /* keep local value */ }
  }
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<PlannerState | null>(null);

  // Flush a debounced save if the page is closed/reloaded before it fires.
  useEffect(() => {
    const flush = () => {
      if (pendingSave.current) void saveState(pendingSave.current, true);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    fetchState()
      .then(({ state: serverState, updatedAt }) => {
        setState(serverState);
        setStatus("saved");
        // One-time localStorage migration offer: only when server has never been written.
        if (!updatedAt) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const legacy = raw ? parsePlannerState(JSON.parse(raw)) : null;
            if (legacy && JSON.stringify(legacy) !== JSON.stringify(serverState)) {
              setLegacyAvailable(legacy);
            }
          } catch { /* ignore malformed legacy data */ }
        }
      })
      .catch(() => setStatus("error"))
      .finally(() => { loaded.current = true; });
  }, []);

  const update = useCallback((next: PlannerState) => {
    setState(next);
    if (!loaded.current) return;
    setStatus("saving");
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(next)
        .then(() => { if (pendingSave.current === next) pendingSave.current = null; setStatus("saved"); })
        .catch(() => setStatus("error"));
    }, 400);
  }, []);

  const binder = state.binders.find((b) => b.id === state.activeBinderId && !b.archivedAt)
    ?? state.binders.find((b) => !b.archivedAt)
    ?? state.binders[0];
  const pages = binder.pages;
  const pageIdx = Math.min(binder.activePageIndex, pages.length - 1);
  const page = pages[pageIdx];
  const spreadIdx = spreadIndexForSide(pageIdx);
  const visibleSides = spreadSides(spreadIdx, pages.length);
  const spreads = spreadCount(pages.length);

  function mutate(fn: (draft: PlannerState) => void) {
    const draft: PlannerState = structuredClone(state);
    fn(draft);
    setEditing(null);
    update(draft);
  }

  function setSlotAt(sideIdx: number, idx: number, card: CardSlot | null) {
    mutate((d) => {
      const b = d.binders.find((x) => x.id === d.activeBinderId)!;
      b.activePageIndex = sideIdx;
      b.pages[sideIdx].slots[idx] = card;
    });
  }

  function swapSlots(fromKey: string, toSide: number, to: number) {
    const [fromSide, from] = fromKey.split(":").map(Number);
    if (Number.isNaN(fromSide) || Number.isNaN(from) || (fromSide === toSide && from === to)) return;
    mutate((d) => {
      const b = d.binders.find((x) => x.id === d.activeBinderId)!;
      const a = b.pages[fromSide];
      const c = b.pages[toSide];
      if (!a || !c) return;
      [a.slots[from], c.slots[to]] = [c.slots[to], a.slots[from]];
      b.activePageIndex = toSide;
    });
  }

  function handleResizeSheets(id: string, sheets: number): string | null {
    const target = state.binders.find((b) => b.id === id);
    if (!target) return "Binder not found.";
    const result = resizeBinderSheets(target, sheets);
    if (!result.ok) return result.reason;
    mutate((d) => {
      const idx = d.binders.findIndex((b) => b.id === id);
      if (idx >= 0) d.binders[idx] = result.binder;
    });
    return null;
  }

  if (view === "settings") {
    return (
      <div className="wrap settings-standalone">
        <SettingsPage settings={appSettings} onSaveSettings={handleSaveSettings} onBack={settingsBack} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <div className="topbar">
          <h1>Bindarr</h1>
          <button
            className="settings-btn"
            aria-label="Settings"
            title="Settings"
            onClick={() => go("settings")}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <p>
          Card management and binder organizing. Rough out card placement before you buy or
          re-sleeve pages — everything saves automatically to your Bindarr server.
        </p>
        <div className="save-status" role="status">
          {status === "loading" && "Loading…"}
          {status === "saving" && "Saving…"}
          {status === "saved" && "All changes saved"}
          {status === "error" && "Could not reach the server — changes are not being saved"}
        </div>
        {!writeMode && (
          <div className="readonly-banner" role="status">
            <div className="readonly-banner-text">
              Read-only — another Bindarr holds the write lease
              {writerInfo?.hostname || writerInfo?.pid
                ? ` (${[writerInfo.hostname, writerInfo.pid != null ? `pid ${writerInfo.pid}` : null].filter(Boolean).join(", ")})`
                : ""}
              . Changes are blocked until that instance exits, or you take write access.
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={takingLease}
              onClick={() => void handleTakeWriteAccess()}
            >
              {takingLease ? "Taking…" : "Take write access"}
            </button>
          </div>
        )}
        <nav className="main-nav" aria-label="Main">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-btn${sectionForView(view) === s.id ? " active" : ""}`}
              aria-current={sectionForView(view) === s.id || undefined}
              onClick={() => go(s.defaultView)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <div className={`app-body nav-layout-${appSettings.navStyle}`}>
        <SubNav
          style={appSettings.navStyle}
          activeKey={view}
          onSelect={(key) => go(key as View)}
          items={(SECTIONS.find((s) => s.id === sectionForView(view))?.subsections ?? []).map(([key, label]) => ({ key, label }))}
        />
        <div className="app-main">

      {(view === "bank" || view === "wishlist") && (
        <BankPage
          mode={view === "wishlist" ? "wishlist" : "bank"}
          items={bankItems}
          visibleBanks={appSettings.visibleGames}
          onCreate={handleCreateBankItem}
          onUpdate={handleUpdateBankItem}
          onDelete={handleDeleteBankItem}
          onPlace={(item) => { setPlacingItem(item); go("planner"); }}
          onArtist={(name) => navigate(`/extras/artist-search?artist=${encodeURIComponent(name)}`)}
          onImported={async () => { setBankItems(await fetchBank()); }}
        />
      )}
      {view === "binders" && (
        <BindersPage
          state={state}
          actions={{
            onOpen: (id) => { mutate((d) => { d.activeBinderId = id; }); go("planner"); },
            onResizeSheets: handleResizeSheets,
            onCreate: (name, layout, count) => {
              const binder = makeBinder(crypto.randomUUID(), name, layout, count);
              mutate((d) => { d.binders.push(binder); d.activeBinderId = binder.id; });
              go("planner");
            },
            onRename: (id, name) => mutate((d) => { const b = d.binders.find((x) => x.id === id); if (b) b.name = name; }),
            onDuplicate: (id) => mutate((d) => {
              const src = d.binders.find((x) => x.id === id);
              if (!src) return;
              const copy = structuredClone(src);
              copy.id = crypto.randomUUID();
              copy.name = `Copy of ${src.name}`;
              copy.archivedAt = null;
              d.binders.push(copy);
            }),
            onArchive: (id) => mutate((d) => {
              const unarchived = d.binders.filter((x) => !x.archivedAt);
              if (unarchived.length <= 1) return;
              const b = d.binders.find((x) => x.id === id);
              if (!b) return;
              b.archivedAt = new Date().toISOString();
              if (d.activeBinderId === id) d.activeBinderId = d.binders.find((x) => !x.archivedAt && x.id !== id)!.id;
            }),
            onRestore: (id) => mutate((d) => { const b = d.binders.find((x) => x.id === id); if (b) b.archivedAt = null; }),
            onDelete: (id) => mutate((d) => { d.binders = d.binders.filter((x) => x.id !== id); }),
          }}
        />
      )}
      {view === "bulkAdd" && (
        <BulkAddPage
          visibleBanks={appSettings.visibleGames}
          onImported={async () => { setBankItems(await fetchBank()); }}
        />
      )}
      {view === "tags" && <TagsPage items={bankItems} />}
      {view === "collections" && <CollectionsPage items={bankItems} />}
      {view === "artist" && <ArtistSearchPage />}
      {view === "planner" && (
      <>

      {legacyAvailable && (
        <div className="migration-banner">
          <span>Found binder data saved in this browser by the old single-file planner.</span>
          <button
            onClick={() => { update(legacyAvailable); setLegacyAvailable(null); try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ } }}
          >
            Import it to the server
          </button>
          <button onClick={() => setLegacyAvailable(null)}>Dismiss</button>
        </div>
      )}

      <div className="layout">
      <div className="main">
      <div className="current-binder">
        <div>
          <h2 className="current-binder-name">{binder.name}</h2>
          <p className="current-binder-meta">
            {BINDER_TYPES[binder.layout].sub} · {sheetCountOf(binder)} sheet{sheetCountOf(binder) === 1 ? "" : "s"} · {pages.length} sides ·{" "}
            {pages.reduce((n, p) => n + p.slots.filter(Boolean).length, 0)} / {totalSlotsOf(binder)} pockets filled
          </p>
        </div>
        <button className="switch-binder-btn" onClick={() => go("binders")}>
          Switch binder
        </button>
      </div>
      <div className="binder-toolbar">
        <label>
          Sheets
          <input
            type="number" min={1} max={200} aria-label="Sheet count"
            defaultValue={sheetCountOf(binder)} key={`sheets-${binder.id}-${sheetCountOf(binder)}`}
            onBlur={(e) => { const msg = handleResizeSheets(binder.id, Number(e.target.value)); setSheetNotice(msg ?? ""); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <label className="page-size-control">
          Page size: {pageScale}%
          <input
            type="range" min={60} max={130} step={5} value={pageScale} aria-label="Page size"
            onChange={(e) => { const v = Number(e.target.value); setPageScale(v); try { localStorage.setItem("bindarr-page-scale", String(v)); } catch { /* noop */ } }}
          />
        </label>
        <button onClick={() => { setPageScale(100); try { localStorage.setItem("bindarr-page-scale", "100"); } catch { /* noop */ } }}>Reset size</button>
        {sheetNotice && <span className="sheet-notice" role="alert">{sheetNotice}</span>}
      </div>
      {placingItem && (
        <div className="placing-banner" role="status">
          <span>
            Placing <strong>{placingItem.name}</strong> — click a pocket to fill it.
          </span>
          <button onClick={() => setPlacingItem(null)}>Cancel (Esc)</button>
        </div>
      )}
      <div className="page-tabs">
        {Array.from({ length: spreads }, (_, sIdx) => (
          <div
            key={sIdx}
            className={`page-tab${sIdx === spreadIdx ? " active" : ""}`}
            onClick={() => mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.activePageIndex = spreadSides(sIdx, b.pages.length)[0] ?? 0; })}
          >
            {spreadLabel(sIdx, pages)}
          </div>
        ))}
      </div>

      <div className="spread-wrap" style={{ "--binder-scale": pageScale / 100 } as React.CSSProperties}>
        {visibleSides.map((sideIdx) => {
          const side = pages[sideIdx];
          return (
            <div className="binder-page" key={sideIdx}>
              <div className="side-head">
                <span
                  className="side-name" title="Double-click to rename"
                  onDoubleClick={() => setRenamingIndex(sideIdx)}
                >
                  {renamingIndex === sideIdx ? (
                    <input
                      defaultValue={side.name} autoFocus aria-label="Page name"
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        setRenamingIndex(null);
                        if (name && name !== side.name) mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.pages[sideIdx].name = name; });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenamingIndex(null); }}
                    />
                  ) : side.name}
                </span>
                <button
                  className="clear-btn"
                  onClick={() => {
                    if (!window.confirm(`Clear every pocket on "${side.name}"?`)) return;
                    mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.pages[sideIdx].slots = b.pages[sideIdx].slots.map(() => null); });
                  }}
                >
                  Clear this page
                </button>
              </div>
              <div className={`grid ${BINDER_TYPES[binder.layout].gridClass}`}>
                {side.slots.map((card, idx) => (
                  <Pocket
                    key={idx}
                    index={idx}
                    dragKey={`${sideIdx}:${idx}`}
                    card={card}
                    bankItems={bankItems}
                    onArtist={(name) => navigate(`/extras/artist-search?artist=${encodeURIComponent(name)}`)}
                    isEditing={editing?.page === sideIdx && editing?.slot === idx}
                    onEdit={() => {
                      if (placingItem) {
                        setSlotAt(sideIdx, idx, bankItemToSlot(placingItem));
                        setPlacingItem(null);
                      } else {
                        mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.activePageIndex = sideIdx; });
                        setEditing({ page: sideIdx, slot: idx });
                      }
                    }}
                    onClear={() => setSlotAt(sideIdx, idx, null)}
                    onSwap={(fromKey) => swapSlots(fromKey, sideIdx, idx)}
                    onBankDrop={(bankItemId) => {
                      const item = bankItems.find((i) => i.id === bankItemId);
                      if (item) setSlotAt(sideIdx, idx, bankItemToSlot(item));
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="footer-row">
        <div className="legend">
          <span><i style={{ background: "var(--tag-showcase)" }} />Showcase</span>
          <span><i style={{ background: "var(--tag-set)" }} />Set build</span>
          <span><i style={{ background: "var(--tag-trade)" }} />Trade / bulk</span>
        </div>
      </div>
      </div>

      {editing !== null && (
        <>
          <div className="editor-backdrop" onClick={() => setEditing(null)} />
          <aside className="editor-sidebar" aria-label="Pocket editor">
            <div className="editor-head">
              <h2>{pages[editing.page].slots[editing.slot] ? "Edit pocket" : "Add card"}</h2>
              <button className="editor-close" aria-label="Close editor" onClick={() => setEditing(null)}>×</button>
            </div>
            <p className="editor-sub">
              {pages[editing.page].name} · Pocket {editing.slot + 1}
            </p>
            {/* Key remounts the form when switching pockets. */}
            <PocketEditor
              key={`${binder.id}-${editing.page}-${editing.slot}`}
              card={pages[editing.page].slots[editing.slot]}
              onSave={(c) => setSlotAt(editing.page, editing.slot, c)}
              onCancel={() => setEditing(null)}
              bankItems={bankItems}
              visibleBanks={appSettings.visibleGames}
              onCreateBankItem={handleCreateBankItem}
              onUpdateBankItem={handleUpdateBankItem}
              onArtist={(name) => navigate(`/extras/artist-search?artist=${encodeURIComponent(name)}`)}
            />
            {pages[editing.page].slots[editing.slot] && (
              <button
                className="editor-clear"
                onClick={() => setSlotAt(editing.page, editing.slot, null)}
              >
                Clear this pocket
              </button>
            )}
          </aside>
        </>
      )}
      </div>
      </>
      )}
        </div>
      </div>
    </div>
  );
}

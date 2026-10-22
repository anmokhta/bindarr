import { useCallback, useEffect, useRef, useState } from "react";
import {
  BINDER_TYPES,
  STORAGE_KEY,
  blankPage,
  defaultState,
  makeBinder,
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
  fetchSettings,
  fetchState,
  saveSettings,
  saveState,
  updateBankItem,
} from "./api.js";
import Pocket from "./components/Pocket.js";
import PocketEditor from "./components/PocketEditor.js";
import BankPage from "./components/BankPage.js";
import BindersPage from "./components/BindersPage.js";
import SettingsPage, { applyTheme, initialTheme } from "./components/SettingsPage.js";
import ArtistSearchPage from "./components/ArtistSearchPage.js";
import { previousRoute, useRoute, type Route } from "./router.js";

type SaveStatus = "loading" | "saved" | "saving" | "error";
type View = "planner" | "bank" | "wishlist" | "binders" | "artist" | "settings";

const VIEW_PATHS: Record<View, string> = {
  planner: "/",
  bank: "/bank",
  wishlist: "/wishlist",
  binders: "/binders",
  artist: "/artist-search",
  settings: "/settings",
};

function viewForRoute(route: Route): View {
  switch (route) {
    case "/bank": return "bank";
    case "/wishlist": return "wishlist";
    case "/binders": return "binders";
    case "/artist-search": return "artist";
    case "/settings": return "settings";
    default: return "planner";
  }
}

export default function App() {
  const [state, setState] = useState<PlannerState>(defaultState);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState<PlannerState | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [route, navigate] = useRoute();
  const view = viewForRoute(route);
  const go = (v: View) => navigate(VIEW_PATHS[v]);
  const settingsBack = () => navigate(previousRoute());
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings());
  const [placingItem, setPlacingItem] = useState<BankItem | null>(null);

  useEffect(() => { applyTheme(initialTheme()); }, []);

  useEffect(() => {
    fetchBank().then(setBankItems).catch(() => { /* bank unavailable — planner still works */ });
    fetchSettings().then(setAppSettings).catch(() => { /* defaults */ });
  }, []);

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

  function mutate(fn: (draft: PlannerState) => void) {
    const draft: PlannerState = structuredClone(state);
    fn(draft);
    setEditingIndex(null);
    update(draft);
  }

  function setSlot(idx: number, card: CardSlot | null) {
    mutate((d) => {
      const b = d.binders.find((x) => x.id === d.activeBinderId)!;
      b.pages[b.activePageIndex].slots[idx] = card;
    });
  }

  function swapSlots(from: number, to: number) {
    if (from === to) return;
    mutate((d) => {
      const b = d.binders.find((x) => x.id === d.activeBinderId)!;
      const p = b.pages[b.activePageIndex];
      [p.slots[from], p.slots[to]] = [p.slots[to], p.slots[from]];
    });
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
        <nav className="main-nav" aria-label="Main">
          {([["planner", "Planner"], ["bank", "Bank"], ["wishlist", "Wishlist"], ["binders", "Binders"], ["artist", "Artist Search"]] as [View, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`nav-btn${view === key ? " active" : ""}`}
              onClick={() => go(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {(view === "bank" || view === "wishlist") && (
        <BankPage
          mode={view === "wishlist" ? "wishlist" : "bank"}
          items={bankItems}
          visibleBanks={appSettings.visibleGames}
          onCreate={handleCreateBankItem}
          onUpdate={handleUpdateBankItem}
          onDelete={handleDeleteBankItem}
          onPlace={(item) => { setPlacingItem(item); go("planner"); }}
          onArtist={(name) => navigate(`/artist-search?artist=${encodeURIComponent(name)}`)}
          onImported={async () => { setBankItems(await fetchBank()); }}
        />
      )}
      {view === "binders" && (
        <BindersPage
          state={state}
          actions={{
            onOpen: (id) => { mutate((d) => { d.activeBinderId = id; }); go("planner"); },
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
            {BINDER_TYPES[binder.layout].sub} · {pages.length} page{pages.length === 1 ? "" : "s"} ·{" "}
            {pages.reduce((n, p) => n + p.slots.filter(Boolean).length, 0)} /{" "}
            {pages.length * BINDER_TYPES[binder.layout].count} pockets filled
          </p>
        </div>
        <button className="switch-binder-btn" onClick={() => go("binders")}>
          Switch binder
        </button>
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
        {pages.map((p, idx) => (
          <div
            key={idx}
            className={`page-tab${idx === pageIdx ? " active" : ""}`}
            title="Double-click to rename"
            onClick={() => mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.activePageIndex = idx; })}
            onDoubleClick={(e) => { e.stopPropagation(); setRenamingIndex(idx); }}
          >
            {renamingIndex === idx ? (
              <input
                defaultValue={p.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  setRenamingIndex(null);
                  if (name && name !== p.name) mutate((d) => { const b = d.binders.find((x) => x.id === d.activeBinderId)!; b.pages[idx].name = name; });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingIndex(null);
                }}
              />
            ) : (
              p.name
            )}
          </div>
        ))}
        <button
          className="add-page-btn"
          onClick={() =>
            mutate((d) => {
              const b = d.binders.find((x) => x.id === d.activeBinderId)!;
              b.pages.push(blankPage(BINDER_TYPES[b.layout].count, b.pages.length + 1));
              b.activePageIndex = b.pages.length - 1;
            })
          }
        >
          + New page
        </button>
        {pages.length > 1 && (
          <button
            className="del-page-btn"
            onClick={() => {
              if (!window.confirm(`Delete "${page.name}"? This can't be undone.`)) return;
              mutate((d) => {
                const b = d.binders.find((x) => x.id === d.activeBinderId)!;
                b.pages.splice(b.activePageIndex, 1);
                b.activePageIndex = Math.max(0, b.activePageIndex - 1);
              });
            }}
          >
            Delete page
          </button>
        )}
      </div>

      <div className="binder-page">
        <div className={`grid ${BINDER_TYPES[binder.layout].gridClass}`}>
          {page.slots.map((card, idx) => (
            <Pocket
              key={idx}
              index={idx}
              card={card}
              wishlistOnly={(() => { const linked = card?.bankId ? bankItems.find((i) => i.id === card.bankId) : undefined; return !!linked && linked.want && !linked.have; })()}
              artist={card?.bankId ? (bankItems.find((i) => i.id === card.bankId)?.artist ?? null) : null}
              onArtist={(name) => navigate(`/artist-search?artist=${encodeURIComponent(name)}`)}
              isEditing={editingIndex === idx}
              onEdit={() => {
                if (placingItem) {
                  setSlot(idx, bankItemToSlot(placingItem));
                  setPlacingItem(null);
                } else {
                  setEditingIndex(idx);
                }
              }}
              onClear={() => setSlot(idx, null)}
              onSwap={(from) => swapSlots(from, idx)}
              onBankDrop={(bankItemId) => {
                const item = bankItems.find((i) => i.id === bankItemId);
                if (item) setSlot(idx, bankItemToSlot(item));
              }}
            />
          ))}
        </div>
        <div className="footer-row">
          <div className="legend">
            <span><i style={{ background: "var(--tag-showcase)" }} />Showcase</span>
            <span><i style={{ background: "var(--tag-set)" }} />Set build</span>
            <span><i style={{ background: "var(--tag-trade)" }} />Trade / bulk</span>
          </div>
          <button
            className="clear-btn"
            onClick={() => {
              if (!window.confirm(`Clear every pocket on "${page.name}"?`)) return;
              mutate((d) => {
                const b = d.binders.find((x) => x.id === d.activeBinderId)!;
                const p = b.pages[b.activePageIndex];
                p.slots = p.slots.map(() => null);
              });
            }}
          >
            Clear this page
          </button>
        </div>
      </div>
      </div>

      {editingIndex !== null && (
        <>
          <div className="editor-backdrop" onClick={() => setEditingIndex(null)} />
          <aside className="editor-sidebar" aria-label="Pocket editor">
            <div className="editor-head">
              <h2>{page.slots[editingIndex] ? "Edit pocket" : "Add card"}</h2>
              <button className="editor-close" aria-label="Close editor" onClick={() => setEditingIndex(null)}>×</button>
            </div>
            <p className="editor-sub">
              {page.name} · Pocket {editingIndex + 1}
            </p>
            {/* Key remounts the form when switching pockets. */}
            <PocketEditor
              key={`${binder.id}-${pageIdx}-${editingIndex}`}
              card={page.slots[editingIndex]}
              onSave={(c) => setSlot(editingIndex, c)}
              onCancel={() => setEditingIndex(null)}
              bankItems={bankItems}
              visibleBanks={appSettings.visibleGames}
              onCreateBankItem={handleCreateBankItem}
              onArtist={(name) => navigate(`/artist-search?artist=${encodeURIComponent(name)}`)}
            />
            {page.slots[editingIndex] && (
              <button
                className="editor-clear"
                onClick={() => setSlot(editingIndex, null)}
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
  );
}

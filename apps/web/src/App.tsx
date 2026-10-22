import { useCallback, useEffect, useRef, useState } from "react";
import {
  BINDER_TYPES,
  STORAGE_KEY,
  blankPage,
  defaultState,
  parsePlannerState,
  type BinderType,
  type CardSlot,
  type PlannerState,
} from "@bindarr/shared";
import { fetchState, saveState } from "./api.js";
import Pocket from "./components/Pocket.js";
import PocketEditor from "./components/PocketEditor.js";
import BankPage from "./components/BankPage.js";
import BindersPage from "./components/BindersPage.js";
import SettingsPage, { applyTheme, initialTheme } from "./components/SettingsPage.js";

type SaveStatus = "loading" | "saved" | "saving" | "error";
type View = "planner" | "bank" | "binders" | "settings";

export default function App() {
  const [state, setState] = useState<PlannerState>(defaultState);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState<PlannerState | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [view, setView] = useState<View>("planner");

  useEffect(() => { applyTheme(initialTheme()); }, []);
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

  const pages = state.pages[state.activeType];
  const pageIdx = state.activePageIndex[state.activeType];
  const page = pages[pageIdx];

  function mutate(fn: (draft: PlannerState) => void) {
    const draft: PlannerState = structuredClone(state);
    fn(draft);
    setEditingIndex(null);
    update(draft);
  }

  function setSlot(idx: number, card: CardSlot | null) {
    mutate((d) => { d.pages[d.activeType][d.activePageIndex[d.activeType]].slots[idx] = card; });
  }

  function swapSlots(from: number, to: number) {
    if (from === to) return;
    mutate((d) => {
      const p = d.pages[d.activeType][d.activePageIndex[d.activeType]];
      [p.slots[from], p.slots[to]] = [p.slots[to], p.slots[from]];
    });
  }

  return (
    <div className="wrap">
      <header>
        <div className="topbar">
          <h1>Binder Page Planner</h1>
          <button
            className={`settings-btn${view === "settings" ? " active" : ""}`}
            aria-label="Settings"
            title="Settings"
            onClick={() => setView("settings")}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <p>
          Rough out card placement before you buy or re-sleeve pages. Switch binder types, add
          pages, and drag cards between pockets. Everything saves automatically to your Bindarr server.
        </p>
        <div className="save-status" role="status">
          {status === "loading" && "Loading…"}
          {status === "saving" && "Saving…"}
          {status === "saved" && "All changes saved"}
          {status === "error" && "Could not reach the server — changes are not being saved"}
        </div>
        <nav className="main-nav" aria-label="Main">
          {([["planner", "Planner"], ["bank", "Bank"], ["binders", "Binders"]] as [View, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`nav-btn${view === key ? " active" : ""}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {view === "bank" && <BankPage />}
      {view === "binders" && (
        <BindersPage
          state={state}
          onOpen={(type) => { mutate((d) => { d.activeType = type; }); setView("planner"); }}
        />
      )}
      {view === "settings" && <SettingsPage />}
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
          <h2 className="current-binder-name">
            {state.activeType === "3x3" ? "9-Pocket Binder" : "4-Pocket Binder"}
          </h2>
          <p className="current-binder-meta">
            {BINDER_TYPES[state.activeType].sub} · {pages.length} page{pages.length === 1 ? "" : "s"} ·{" "}
            {pages.reduce((n, p) => n + p.slots.filter(Boolean).length, 0)} /{" "}
            {pages.length * BINDER_TYPES[state.activeType].count} pockets filled
          </p>
        </div>
        <button className="switch-binder-btn" onClick={() => setView("binders")}>
          Switch binder
        </button>
      </div>
      <div className="type-toggle">
        {(Object.keys(BINDER_TYPES) as BinderType[]).map((key) => (
          <button
            key={key}
            className={`type-btn${state.activeType === key ? " active" : ""}`}
            onClick={() => mutate((d) => { d.activeType = key; })}
          >
            <strong>{BINDER_TYPES[key].label}</strong>
            <span>{BINDER_TYPES[key].sub}</span>
          </button>
        ))}
      </div>

      <div className="page-tabs">
        {pages.map((p, idx) => (
          <div
            key={idx}
            className={`page-tab${idx === pageIdx ? " active" : ""}`}
            title="Double-click to rename"
            onClick={() => mutate((d) => { d.activePageIndex[d.activeType] = idx; })}
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
                  if (name && name !== p.name) mutate((d) => { d.pages[d.activeType][idx].name = name; });
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
              const t = d.activeType;
              d.pages[t].push(blankPage(BINDER_TYPES[t].count, d.pages[t].length + 1));
              d.activePageIndex[t] = d.pages[t].length - 1;
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
                const t = d.activeType;
                d.pages[t].splice(d.activePageIndex[t], 1);
                d.activePageIndex[t] = Math.max(0, d.activePageIndex[t] - 1);
              });
            }}
          >
            Delete page
          </button>
        )}
      </div>

      <div className="binder-page">
        <div className={`grid ${BINDER_TYPES[state.activeType].gridClass}`}>
          {page.slots.map((card, idx) => (
            <Pocket
              key={idx}
              index={idx}
              card={card}
              isEditing={editingIndex === idx}
              onEdit={() => setEditingIndex(idx)}
              onClear={() => setSlot(idx, null)}
              onSwap={(from) => swapSlots(from, idx)}
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
                const p = d.pages[d.activeType][d.activePageIndex[d.activeType]];
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
              key={`${state.activeType}-${pageIdx}-${editingIndex}`}
              card={page.slots[editingIndex]}
              onSave={(c) => setSlot(editingIndex, c)}
              onCancel={() => setEditingIndex(null)}
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

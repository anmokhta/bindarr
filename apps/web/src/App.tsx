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

type SaveStatus = "loading" | "saved" | "saving" | "error";

export default function App() {
  const [state, setState] = useState<PlannerState>(defaultState);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState<PlannerState | null>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(next).then(() => setStatus("saved")).catch(() => setStatus("error"));
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
        <h1>Binder Page Planner</h1>
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
      </header>

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
            onDoubleClick={(e) => {
              e.stopPropagation();
              const name = window.prompt("Page name", p.name);
              if (name?.trim()) mutate((d) => { d.pages[d.activeType][idx].name = name.trim(); });
            }}
          >
            {p.name}
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
              editing={editingIndex === idx}
              onEdit={() => setEditingIndex(idx)}
              onSave={(c) => setSlot(idx, c)}
              onCancelEdit={() => setEditingIndex(null)}
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
  );
}

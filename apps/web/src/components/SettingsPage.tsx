import { useEffect, useMemo, useState } from "react";
import { GAMES, type AppSettings, type GameId, type NavStyle } from "@bindarr/shared";
import { fetchCalls, fetchCallStats, fetchHealth, fetchVersionLatest, migratePokemontcgImages, takeWriteLease, type ApiCallRow, type HealthInfo, type VersionLatest } from "../api.js";
import NavStylesPage from "./NavStylesPage.js";
import SubNav from "./SubNav.js";

type Theme = "auto" | "light" | "dark";
type SettingsTab = "general" | "calls" | "nav-styles";

function tabFromUrl(): SettingsTab {
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "calls") return "calls";
  if (t === "nav-styles") return "nav-styles";
  return "general";
}

function urlForTab(tab: SettingsTab): string {
  if (tab === "calls") return "/settings?tab=calls";
  if (tab === "nav-styles") return "/settings?tab=nav-styles";
  return "/settings";
}

export function applyTheme(theme: Theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("bindarr-theme", theme); } catch { /* noop */ }
}

export function initialTheme(): Theme {
  try {
    const t = localStorage.getItem("bindarr-theme");
    if (t === "light" || t === "dark") return t;
  } catch { /* noop */ }
  return "auto";
}

const WINDOWS: { key: string; label: string }[] = [
  { key: "1h", label: "Last hour" },
  { key: "12h", label: "Last 12 hours" },
  { key: "24h", label: "Last day" },
  { key: "3d", label: "Last 3 days" },
  { key: "7d", label: "Last week" },
  { key: "30d", label: "Last month" },
];

const STATUS_OPTIONS = ["", "success", "error", "cache-hit"] as const;

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function callsToCsv(rows: ApiCallRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["createdAt", "day", "call", "game", "provider", "status", "httpStatus"];
  const lines = rows.map((r) =>
    [r.createdAt, r.day, r.call, r.game, r.provider, r.status, r.httpStatus ?? ""].map(esc).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function LogsTab() {
  const [range, setRange] = useState("24h");
  const [stats, setStats] = useState<{ windows: Record<string, number>; byGame: Record<string, number>; byProvider: Record<string, number> } | null>(null);
  const [calls, setCalls] = useState<ApiCallRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [gameFilter, setGameFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { fetchCallStats().then(setStats).catch(() => setStats(null)); }, []);
  useEffect(() => { fetchCalls(range).then(setCalls).catch(() => setCalls([])); }, [range]);

  const providers = useMemo(
    () => [...new Set(calls.map((c) => c.provider).filter(Boolean))].sort(),
    [calls],
  );
  const games = useMemo(
    () => [...new Set(calls.map((c) => c.game).filter(Boolean))].sort(),
    [calls],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (providerFilter && c.provider !== providerFilter) return false;
      if (gameFilter && c.game !== gameFilter) return false;
      if (q && !c.call.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [calls, statusFilter, providerFilter, gameFilter, search]);

  function exportJson() {
    downloadBlob(`bindarr-calls-${range}.json`, JSON.stringify(filtered, null, 2), "application/json");
  }

  function exportCsv() {
    downloadBlob(`bindarr-calls-${range}.csv`, callsToCsv(filtered), "text/csv");
  }

  return (
    <div>
      <p className="settings-text">
        External API call log (card lookups, artist search, image migration). Filters apply to the loaded time range; export downloads the filtered rows.
      </p>
      <div className="settings-tabs" role="tablist" aria-label="Time range">
        {WINDOWS.map((w) => (
          <button key={w.key} className={`game-tab${range === w.key ? " active" : ""}`} onClick={() => setRange(w.key)}>
            {w.label}: {stats?.windows[w.key] ?? "—"}
          </button>
        ))}
      </div>
      {stats && (
        <p className="settings-text">
          By game: {Object.entries(stats.byGame).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
          {"  "}By provider: {Object.entries(stats.byProvider).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
        </p>
      )}

      <div className="logs-filters">
        <div className="bank-flag-toggle" role="group" aria-label="Status filter">
          {STATUS_OPTIONS.map((id) => (
            <button
              key={id || "all"}
              type="button"
              className={`game-tab${statusFilter === id ? " active" : ""}`}
              onClick={() => setStatusFilter(id)}
            >
              {id || "All"}
            </button>
          ))}
        </div>
        <label className="bank-sort-control">
          <span>Provider</span>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} aria-label="Provider filter">
            <option value="">All</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="bank-sort-control">
          <span>Game</span>
          <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} aria-label="Game filter">
            <option value="">All</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="bank-sort-control logs-search">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by call…"
            aria-label="Search calls"
          />
        </label>
        <span className="bank-count">{filtered.length} of {calls.length}</span>
        <span className="export-import">
          <button type="button" className="btn btn-secondary btn-sm" disabled={filtered.length === 0} onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={filtered.length === 0} onClick={exportCsv}>
            Export CSV
          </button>
        </span>
      </div>

      {calls.length === 0 ? (
        <p className="bank-empty">No API calls in this window yet — card lookups will show up here.</p>
      ) : filtered.length === 0 ? (
        <p className="bank-empty">No calls match the current filters.</p>
      ) : (
        <table className="calls-table">
          <thead><tr><th>Time</th><th>Day</th><th>Call</th><th>Game</th><th>Provider</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.createdAt).toLocaleTimeString()}</td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td><code>{c.call}</code></td>
                <td>{c.game}</td>
                <td>{c.provider}</td>
                <td>{c.status}{c.httpStatus ? ` (${c.httpStatus})` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function SettingsPage({
  settings,
  onSaveSettings,
  onBack,
}: {
  settings?: AppSettings;
  onSaveSettings?: (next: AppSettings) => Promise<void>;
  onBack?: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [server, setServer] = useState<string>("Checking…");
  const [versionInfo, setVersionInfo] = useState<VersionLatest | null>(null);
  const [writeMode, setWriteMode] = useState<boolean | null>(null);
  const [writerInfo, setWriterInfo] = useState<HealthInfo["writer"]>(undefined);
  const [takingLease, setTakingLease] = useState(false);
  const [migratingImages, setMigratingImages] = useState(false);
  const [migrateNotice, setMigrateNotice] = useState("");
  const [tab, setTab] = useState<SettingsTab>(tabFromUrl);
  const visibleGames = settings?.visibleGames ?? ["pokemon", "misc"];
  const navStyle: NavStyle = settings?.navStyle ?? "segment";

  function selectTab(next: SettingsTab) {
    setTab(next);
    window.history.replaceState({}, "", urlForTab(next));
  }

  function patchSettings(patch: Partial<AppSettings>) {
    if (!settings || !onSaveSettings) return;
    void onSaveSettings({ ...settings, ...patch });
  }

  function toggleGame(id: string, visible: boolean) {
    if (!settings) return;
    const next = visible
      ? [...new Set([...settings.visibleGames, id])]
      : settings.visibleGames.filter((g) => g !== id);
    patchSettings({ visibleGames: next });
  }

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    fetchHealth()
      .then((d) => {
        setServer(`Connected · ${d.service} · v${d.version ?? "?"} · ${new Date(d.time).toLocaleTimeString()}`);
        setWriteMode(d.writeMode ?? true);
        setWriterInfo(d.writeMode === false ? d.writer : undefined);
      })
      .catch(() => setServer("Not reachable — is the Bindarr server running?"));
    fetchVersionLatest().then(setVersionInfo).catch(() => setVersionInfo(null));
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

  return (
    <section className="page-section settings-page">
      <div className="settings-heading-row">
        {onBack && (
          <button className="settings-back" aria-label="Back" onClick={onBack}>←</button>
        )}
        <h2 className="page-title">Settings</h2>
        {onBack && (
          <button className="settings-btn active" aria-label="Settings" title="Back to previous page" onClick={onBack} style={{ marginLeft: "auto" }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      <div className={`app-body nav-layout-${navStyle}`}>
        <SubNav
          style={navStyle}
          label="Settings sections"
          activeKey={tab}
          onSelect={(key) => selectTab(key as SettingsTab)}
          items={[
            { key: "general", label: "General" },
            { key: "nav-styles", label: "Nav styles" },
            { key: "calls", label: "Logs" },
          ]}
        />
        <div className="app-main">
          {tab === "calls" ? <LogsTab /> : tab === "nav-styles" ? (
            <NavStylesPage
              embedded
              navStyle={navStyle}
              onNavStyleChange={(style) => patchSettings({ navStyle: style })}
            />
          ) : (
          <>
          <div className="settings-group">
            <h3>Appearance</h3>
            <label className="settings-row">
              <span>Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                <option value="auto">Match system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <p className="settings-text">
              Subsection tab chrome is under Settings → Nav styles.
            </p>
          </div>

          <div className="settings-group">
            <h3>Games</h3>
            <p className="settings-text">Choose which game banks show up. Each game gets its own bank; only Pokémon has card lookup today.</p>
            {(Object.entries(GAMES) as [GameId, (typeof GAMES)[GameId]][]).map(([id, game]) => (
              <label key={id} className="settings-row">
                <span>
                  {game.label} Bank
                  {!game.implemented && <span className="settings-badge">not yet supported</span>}
                </span>
                <input
                  type="checkbox"
                  disabled={!game.implemented}
                  checked={game.implemented && visibleGames.includes(id)}
                  onChange={(e) => toggleGame(id, e.target.checked)}
                />
              </label>
            ))}
            <label className="settings-row">
              <span>Misc Bank <span className="settings-badge">sleeves, Carddass &amp; other items</span></span>
              <input
                type="checkbox"
                checked={visibleGames.includes("misc")}
                onChange={(e) => toggleGame("misc", e.target.checked)}
              />
            </label>
          </div>

          <div className="settings-group">
            <h3>Server</h3>
            <p className="settings-text">{server}</p>
            {writeMode === false && (
              <div className="settings-readonly">
                <p className="settings-text settings-warn">
                  Read-only — another Bindarr holds the write lease
                  {writerInfo?.hostname || writerInfo?.pid
                    ? ` (${[writerInfo.hostname, writerInfo.pid != null ? `pid ${writerInfo.pid}` : null].filter(Boolean).join(", ")})`
                    : ""}
                  . Soft recovery runs automatically when that lease goes stale; use Take write access only if nothing else is open.
                </p>
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
            {versionInfo && (
              <p className="settings-text">
                {versionInfo.updateAvailable && versionInfo.latest ? (
                  <>
                    Update available: <strong>v{versionInfo.latest}</strong>
                    {versionInfo.htmlUrl && (
                      <>
                        {" · "}
                        <a href={versionInfo.htmlUrl} target="_blank" rel="noreferrer">Release notes</a>
                      </>
                    )}
                    . Docker: pull/rebuild the image. Desktop: Help → Check for Updates…
                  </>
                ) : versionInfo.latest ? (
                  <>Up to date (v{versionInfo.current}).</>
                ) : (
                  <>Running v{versionInfo.current}{versionInfo.error === "no_releases" ? " · no GitHub releases published yet" : ""}.</>
                )}
              </p>
            )}
            <p className="settings-text">
              Binder data is stored server-side in SQLite at
              <code> ./data/bindarr.db </code>
              on the host (Docker bind-mount), or Electron app-data / a shared path you chose.
              Copy that file/folder to back up — see README.
            </p>
          </div>

          <div className="settings-group">
            <h3>Pokémon card lookup</h3>
            <p className="settings-text">
              Lookups run through your Bindarr server against the free
              <a href="https://tcgdex.dev/" target="_blank" rel="noreferrer"> TCGdex </a>
              API (via <code>@tcgdex/sdk</code>), with retries and a local cache so repeat
              searches keep working during API hiccups. No API key is required.
            </p>
            <p className="settings-text">
              Cards looked up before the TCGdex switch may still use
              <code> images.pokemontcg.io </code>
              URLs. Migrate them to TCGdex assets in one pass (bank + binder pockets).
            </p>
            <div className="bank-actions-row" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={migratingImages || writeMode === false}
                title={writeMode === false ? "Write access required" : undefined}
                onClick={() => {
                  void (async () => {
                    if (migratingImages) return;
                    const ok = window.confirm(
                      "Rewrite images.pokemontcg.io URLs on bank cards and binder pockets to TCGdex assets? This needs write access.",
                    );
                    if (!ok) return;
                    setMigratingImages(true);
                    setMigrateNotice("Migrating…");
                    try {
                      const r = await migratePokemontcgImages();
                      setMigrateNotice(
                        `Bank: ${r.bankUpdated} updated, ${r.bankSkipped} skipped, ${r.bankErrors} errors · Pockets: ${r.pocketsUpdated} updated, ${r.pocketsSkipped} skipped.`,
                      );
                    } catch (e) {
                      setMigrateNotice(e instanceof Error ? e.message : "Migration failed");
                    } finally {
                      setMigratingImages(false);
                    }
                  })();
                }}
              >
                {migratingImages ? "Migrating…" : "Migrate Pokémon image URLs"}
              </button>
            </div>
            {migrateNotice && <p className="import-notice" role="status">{migrateNotice}</p>}
          </div>

          <div className="settings-group">
            <h3>Security</h3>
            <p className="settings-text">
              Bindarr has no built-in accounts or passwords. Keep it on a trusted
              home network, or put a reverse proxy with authentication in front of it.
            </p>
          </div>
          </>
          )}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { GAMES, NAV_STYLES, type AppSettings, type GameId, type NavStyle } from "@bindarr/shared";
import { fetchCalls, fetchCallStats, type ApiCallRow } from "../api.js";
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

function CallsTab() {
  const [range, setRange] = useState("24h");
  const [stats, setStats] = useState<{ windows: Record<string, number>; byGame: Record<string, number>; byProvider: Record<string, number> } | null>(null);
  const [calls, setCalls] = useState<ApiCallRow[]>([]);

  useEffect(() => { fetchCallStats().then(setStats).catch(() => setStats(null)); }, []);
  useEffect(() => { fetchCalls(range).then(setCalls).catch(() => setCalls([])); }, [range]);

  return (
    <div>
      <p className="settings-text">
        External API calls made by this server (card lookups today; artist search will log here too).
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
      {calls.length === 0 ? (
        <p className="bank-empty">No API calls in this window yet — card lookups will show up here.</p>
      ) : (
        <table className="calls-table">
          <thead><tr><th>Time</th><th>Day</th><th>Call</th><th>Game</th><th>Provider</th><th>Status</th></tr></thead>
          <tbody>
            {calls.map((c) => (
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
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setServer(`Connected · ${d.service} · ${new Date(d.time).toLocaleTimeString()}`))
      .catch(() => setServer("Not reachable — is the Bindarr server running?"));
  }, []);

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

      <SubNav
        style={navStyle}
        label="Settings sections"
        activeKey={tab}
        onSelect={(key) => selectTab(key as SettingsTab)}
        items={[
          { key: "general", label: "General" },
          { key: "calls", label: "Calls" },
          { key: "nav-styles", label: "Nav styles" },
        ]}
      />

      {tab === "calls" ? <CallsTab /> : tab === "nav-styles" ? <NavStylesPage embedded /> : (
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
        <label className="settings-row">
          <span>Subsection nav</span>
          <select
            aria-label="Subsection nav"
            value={navStyle}
            onChange={(e) => patchSettings({ navStyle: e.target.value as NavStyle })}
          >
            {(Object.entries(NAV_STYLES) as [NavStyle, { label: string }][]).map(([id, meta]) => (
              <option key={id} value={id}>{meta.label}</option>
            ))}
          </select>
        </label>
        <p className="settings-text">
          Applies to Bank/Binders/Extras subsections and this Settings tab row.
          Compare all patterns (including retired ones) under Settings → Nav styles.
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
        <p className="settings-text">
          Binder data is stored server-side in SQLite at
          <code> ./data/bindarr.db </code>
          on the host (Docker bind-mount). Copy that folder to back up — see README.
        </p>
      </div>

      <div className="settings-group">
        <h3>Pokémon TCG lookup</h3>
        <p className="settings-text">
          Lookups run through your Bindarr server, which retries the free
          pokemontcg.io API and caches results — so repeat searches keep working
          during API hiccups. For higher rate limits, set
          <code> POKEMONTCG_API_KEY </code>
          on the server (free key from pokemontcg.io).
        </p>
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
    </section>
  );
}

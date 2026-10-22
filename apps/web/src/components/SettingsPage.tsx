import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";

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

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [server, setServer] = useState<string>("Checking…");

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setServer(`Connected · ${d.service} · ${new Date(d.time).toLocaleTimeString()}`))
      .catch(() => setServer("Not reachable — is the Bindarr server running?"));
  }, []);

  return (
    <section className="page-section">
      <h2 className="page-title">Settings</h2>

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
      </div>

      <div className="settings-group">
        <h3>Server</h3>
        <p className="settings-text">{server}</p>
        <p className="settings-text">
          Binder data is stored server-side in SQLite. Back up the Docker
          <code> /data </code>
          volume (see README) to keep a copy.
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
    </section>
  );
}

const { app, BrowserWindow, dialog, Menu, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const PORT = 17321;
let serverProcess = null;
let mainWindow = null;

function defaultDatabasePath() {
  return path.join(app.getPath("userData"), "bindarr.db");
}

function configPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return { setupComplete: false, databasePath: null };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

function looksLikeSqlite(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString("utf8", 0, 15) === "SQLite format 3";
  } catch {
    return false;
  }
}

async function chooseExistingDatabase() {
  const result = await dialog.showOpenDialog({
    title: "Choose Bindarr database",
    properties: ["openFile"],
    filters: [
      { name: "Bindarr database", extensions: ["db"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const chosen = result.filePaths[0];
  if (!looksLikeSqlite(chosen)) {
    await dialog.showMessageBox({
      type: "error",
      message: "Not a SQLite database",
      detail: `${chosen}\n\nPick a Bindarr bindarr.db file (for example from your Docker ./data folder).`,
    });
    return null;
  }
  return chosen;
}

async function ensureDatabaseConfigured() {
  let cfg = loadConfig();
  if (cfg.setupComplete && cfg.databasePath) {
    if (fs.existsSync(cfg.databasePath) || cfg.databasePath === defaultDatabasePath()) {
      return cfg.databasePath;
    }
    const missing = await dialog.showMessageBox({
      type: "warning",
      message: "Configured database is missing",
      detail: `${cfg.databasePath}\n\nChoose another file or create a new database in the standard location.`,
      buttons: ["Choose existing…", "Create new", "Quit"],
      defaultId: 0,
      cancelId: 2,
    });
    if (missing.response === 2) {
      app.quit();
      return null;
    }
    if (missing.response === 1) {
      const p = defaultDatabasePath();
      saveConfig({ setupComplete: true, databasePath: p });
      return p;
    }
    const chosen = await chooseExistingDatabase();
    if (!chosen) {
      app.quit();
      return null;
    }
    saveConfig({ setupComplete: true, databasePath: chosen });
    return chosen;
  }

  while (true) {
    const choice = await dialog.showMessageBox({
      type: "question",
      message: "Set up Bindarr database",
      detail:
        "Create a new database in the standard app-data folder, or use an existing Bindarr database in place (for example Docker ./data/bindarr.db).\n\n" +
        "Only one Bindarr process should write to a shared database at a time; the other will open read-only.",
      buttons: ["Create new database", "Use existing database…", "Quit"],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice.response === 2) {
      app.quit();
      return null;
    }
    if (choice.response === 0) {
      const p = defaultDatabasePath();
      saveConfig({ setupComplete: true, databasePath: p });
      return p;
    }
    const chosen = await chooseExistingDatabase();
    if (chosen) {
      saveConfig({ setupComplete: true, databasePath: chosen });
      return chosen;
    }
  }
}

async function changeDatabasePath() {
  const choice = await dialog.showMessageBox({
    type: "question",
    message: "Change Bindarr database",
    detail: "Bindarr will restart after you pick a location.",
    buttons: ["Create new database", "Use existing database…", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 2) return;
  let next = null;
  if (choice.response === 0) next = defaultDatabasePath();
  else next = await chooseExistingDatabase();
  if (!next) return;
  saveConfig({ setupComplete: true, databasePath: next });
  app.relaunch();
  app.exit(0);
}

/** Packaged: unpack backend (deps -> node_modules) into userData on first run. */
function packagedBackendDir() {
  const staged = path.join(app.getPath("userData"), "backend");
  const marker = path.join(staged, ".bindarr-version");
  const version = app.getVersion();
  if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== version) {
    fs.rmSync(staged, { recursive: true, force: true });
    const src = path.join(process.resourcesPath, "backend");
    fs.cpSync(src, staged, { recursive: true });
    fs.renameSync(path.join(staged, "deps"), path.join(staged, "node_modules"));
    fs.writeFileSync(marker, version);
  }
  return staged;
}

function backendEntry() {
  if (app.isPackaged) return path.join(packagedBackendDir(), "server", "index.js");
  return path.join(__dirname, "..", "..", "apps", "server", "dist", "index.js");
}

function webDist() {
  if (app.isPackaged) return path.join(packagedBackendDir(), "web");
  return path.join(__dirname, "..", "..", "apps", "web", "dist");
}

function startServer(databasePath) {
  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox("Bindarr backend missing", `Build first (npm run build).\nMissing: ${entry}`);
    app.quit();
    return;
  }
  const rootPkg = path.join(__dirname, "..", "..", "package.json");
  let appVersion = app.getVersion();
  try {
    appVersion = JSON.parse(fs.readFileSync(rootPkg, "utf8")).version || appVersion;
  } catch { /* packaged uses electron version from package.json */ }
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DATABASE_PATH: databasePath,
    WEB_DIST: webDist(),
    APP_VERSION: process.env.APP_VERSION || appVersion,
    GITHUB_REPO: process.env.GITHUB_REPO || "anmokhta/bindarr",
  };
  const runtime = app.isPackaged ? process.execPath : "node";
  serverProcess = spawn(runtime, [entry], { env, stdio: "inherit" });
  serverProcess.on("exit", (code) => {
    if (code && code !== 0) console.error(`Bindarr server exited with ${code}`);
  });
}

function waitForHealth(retries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (n > 0) setTimeout(() => attempt(n - 1), 200);
        else reject(new Error("Server did not become healthy"));
      }).on("error", () => {
        if (n > 0) setTimeout(() => attempt(n - 1), 200);
        else reject(new Error("Server did not become healthy"));
      });
    };
    attempt(retries);
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (e) {
    console.warn("electron-updater unavailable", e);
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", async (info) => {
    const res = await dialog.showMessageBox({
      type: "info",
      message: "Update available",
      detail: `Version ${info.version} is available. Download and install now?`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (res.response === 0) autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-not-available", () => {
    dialog.showMessageBox({ type: "info", message: "You're up to date", detail: `Bindarr ${app.getVersion()} is the latest release.` });
  });
  autoUpdater.on("update-downloaded", async () => {
    const res = await dialog.showMessageBox({
      type: "info",
      message: "Update ready",
      detail: "Restart Bindarr to install the update.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (res.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (err) => {
    dialog.showMessageBox({ type: "error", message: "Update check failed", detail: String(err) });
  });
  return autoUpdater;
}

function buildMenu(autoUpdater) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Database…",
          click: () => { void changeDatabasePath(); },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates…",
          click: async () => {
            if (!app.isPackaged || !autoUpdater) {
              await dialog.showMessageBox({
                type: "info",
                message: "Updates",
                detail: "Update checks are available in packaged desktop builds. See GitHub Releases, or Settings → Server in the app.",
              });
              return;
            }
            try {
              await autoUpdater.checkForUpdates();
            } catch (e) {
              dialog.showMessageBox({ type: "error", message: "Update check failed", detail: String(e) });
            }
          },
        },
        {
          label: "Open GitHub Releases",
          click: () => { void shell.openExternal("https://github.com/anmokhta/bindarr/releases"); },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const databasePath = await ensureDatabaseConfigured();
  if (!databasePath) return;

  startServer(databasePath);
  try {
    await waitForHealth();
  } catch (e) {
    dialog.showErrorBox("Bindarr failed to start", String(e));
    app.quit();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "Bindarr",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
}

app.whenReady().then(() => {
  const autoUpdater = setupAutoUpdater();
  buildMenu(autoUpdater);
  void createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
app.on("before-quit", () => { if (serverProcess) serverProcess.kill(); });

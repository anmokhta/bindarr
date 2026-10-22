const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const PORT = 17321;
let serverProcess = null;

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
  // Dev: repo root is two levels up from apps/desktop-electron
  return path.join(__dirname, "..", "..", "apps", "server", "dist", "index.js");
}

function webDist() {
  if (app.isPackaged) return path.join(packagedBackendDir(), "web");
  return path.join(__dirname, "..", "..", "apps", "web", "dist");
}

function startServer() {
  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox("Bindarr backend missing", `Build first (npm run build).\nMissing: ${entry}`);
    app.quit();
    return;
  }
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DATABASE_PATH: path.join(app.getPath("userData"), "bindarr.db"),
    WEB_DIST: webDist(),
  };
  // Dev: system `node` (matches how node_modules was installed). Packaged:
  // Electron-as-Node — prepare-backend.mjs rebuilds better-sqlite3 for Electron's ABI.
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

async function createWindow() {
  startServer();
  try {
    await waitForHealth();
  } catch (e) {
    dialog.showErrorBox("Bindarr failed to start", String(e));
    app.quit();
    return;
  }
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "Bindarr",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("before-quit", () => { if (serverProcess) serverProcess.kill(); });

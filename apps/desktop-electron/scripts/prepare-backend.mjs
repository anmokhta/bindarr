// Assemble a self-contained backend bundle for electron-builder:
// .backend/server/index.js (compiled Fastify server), .backend/web/* (built UI),
// .backend/node_modules/* (production deps incl. @bindarr/shared + better-sqlite3).
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(appDir, "..", "..");
const out = path.join(appDir, ".backend");

for (const p of ["apps/server/dist/index.js", "apps/web/dist/index.html", "packages/shared/dist/index.js"]) {
  if (!existsSync(path.join(root, p))) throw new Error(`Missing build output: ${p} — run npm run build first`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "server"), { recursive: true });
cpSync(path.join(root, "apps/server/dist"), path.join(out, "server"), { recursive: true });
cpSync(path.join(root, "apps/web/dist"), path.join(out, "web"), { recursive: true });

writeFileSync(path.join(out, "package.json"), JSON.stringify({
  name: "bindarr-backend-bundle",
  private: true,
  type: "module",
  dependencies: {
    "fastify": "^5.3.2",
    "@fastify/static": "^8.1.0",
    "better-sqlite3": "^11.9.1",
    "zod": "^3.24.3",
  },
}, null, 2));

execSync("npm install --omit=dev --ignore-scripts=false", { cwd: out, stdio: "inherit" });

// Rebuild native addons (better-sqlite3) against Electron's Node ABI — the
// packaged shell spawns the server with ELECTRON_RUN_AS_NODE, whose ABI
// differs from system Node.
const electronVersion = execSync("npx electron --version", { cwd: appDir, encoding: "utf8" }).trim().replace(/^v/, "");
const rebuildBin = path.join(root, "node_modules", ".bin", "electron-rebuild");
execSync(`"${rebuildBin}" -v ${electronVersion} -w better-sqlite3`, { cwd: out, stdio: "inherit" });

// Drop in the workspace shared package (not published to npm).
const sharedDest = path.join(out, "node_modules", "@bindarr", "shared");
mkdirSync(sharedDest, { recursive: true });
cpSync(path.join(root, "packages/shared/dist"), path.join(sharedDest, "dist"), { recursive: true });
cpSync(path.join(root, "packages/shared/package.json"), path.join(sharedDest, "package.json"));

// electron-builder strips directories literally named "node_modules" from
// extraResources, so ship it as "deps"; main.cjs renames it back on first run.
renameSync(path.join(out, "node_modules"), path.join(out, "deps"));
console.log(`Backend bundle ready at ${out}`);

import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultSettings,
  defaultState,
  parseAppSettings,
  parseBankItem,
  parsePlannerState,
  type BankItem,
  type PlannerState,
} from "@bindarr/shared";
import { randomUUID } from "node:crypto";
import { acquireWriteLease, type WriteLeaseInfo } from "./write-lease.js";

export interface ServerOptions {
  databasePath?: string;
  webDist?: string;
  logger?: boolean;
  /** Injectable for tests; defaults to global fetch. */
  tcgFetch?: typeof fetch;
  tcgApiKey?: string;
  /** Force write mode (tests / :memory:). When false, still attempts lease for file DBs. */
  skipWriteLease?: boolean;
  appVersion?: string;
  githubRepo?: string;
  /** Injectable GitHub fetch for version checks. */
  githubFetch?: typeof fetch;
}

export interface TcgCardResult {
  id: string;
  name: string;
  number: string;
  setName: string;
  imageSmall: string | null;
  artist: string | null;
  evolvesFrom: string | null;
  evolvesTo: string[];
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS planner_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lookup_cache (
    query TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bank_items (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_calls (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    provider TEXT NOT NULL,
    game TEXT NOT NULL,
    call TEXT NOT NULL,
    status TEXT NOT NULL,
    http_status INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_api_calls_created ON api_calls (created_at);
`;

export function openDb(databasePath: string, readonly = false) {
  if (databasePath !== ":memory:" && !readonly) mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new Database(databasePath, readonly ? { readonly: true, fileMustExist: true } : undefined);
  if (!readonly) {
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA_SQL);
  }
  return db;
}

function resolveAppVersion(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const rootPkg = resolve(dirname(fileURLToPath(import.meta.url)), "../../../package.json");
    return JSON.parse(readFileSync(rootPkg, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseSemver(v: string): number[] | null {
  const m = v.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

export async function buildApp(opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const databasePath = opts.databasePath ?? process.env.DATABASE_PATH ?? "./data/bindarr.db";
  const appVersion = resolveAppVersion(opts.appVersion);
  const githubRepo = opts.githubRepo ?? process.env.GITHUB_REPO ?? "anmokhta/bindarr";

  const lease = opts.skipWriteLease || databasePath === ":memory:"
    ? { writeMode: true, writer: null as WriteLeaseInfo | null, release: () => undefined }
    : acquireWriteLease(databasePath);

  let db: ReturnType<typeof openDb>;
  try {
    db = openDb(databasePath, !lease.writeMode);
  } catch (e) {
    lease.release();
    throw e;
  }

  const readState = (): { state: PlannerState; updatedAt: string | null } => {
    const row = db
      .prepare("SELECT state, updated_at FROM planner_state WHERE id = 1")
      .get() as { state: string; updated_at: string } | undefined;
    if (!row) return { state: defaultState(), updatedAt: null };
    return { state: parsePlannerState(JSON.parse(row.state)) ?? defaultState(), updatedAt: row.updated_at };
  };

  const requireWrite = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (lease.writeMode) return null;
    return reply.code(423).send({
      error: "Database is open read-only; another Bindarr holds the write lease",
      writer: lease.writer,
    });
  };

  app.get("/api/health", async () => ({
    ok: true,
    service: "bindarr",
    time: new Date().toISOString(),
    version: appVersion,
    writeMode: lease.writeMode,
    writer: lease.writeMode ? undefined : lease.writer ?? undefined,
  }));

  let latestCache: { at: number; payload: unknown } | null = null;
  const LATEST_TTL_MS = 60 * 60 * 1000;
  app.get("/api/version/latest", async (_req, reply) => {
    if (latestCache && Date.now() - latestCache.at < LATEST_TTL_MS) {
      return latestCache.payload;
    }
    const ghFetch = opts.githubFetch ?? fetch;
    try {
      const res = await ghFetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "bindarr",
          ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) {
        const payload = { latest: null, current: appVersion, updateAvailable: false, htmlUrl: null, error: "no_releases" };
        latestCache = { at: Date.now(), payload };
        return payload;
      }
      if (!res.ok) {
        return reply.code(502).send({ error: `GitHub Releases unavailable (HTTP ${res.status})`, current: appVersion });
      }
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name ?? "").replace(/^v/i, "") || null;
      const payload = {
        latest,
        current: appVersion,
        updateAvailable: latest ? isNewer(latest, appVersion) : false,
        htmlUrl: data.html_url ?? `https://github.com/${githubRepo}/releases`,
      };
      latestCache = { at: Date.now(), payload };
      return payload;
    } catch (e) {
      return reply.code(502).send({ error: String(e), current: appVersion });
    }
  });

  // Pokémon TCG lookup proxy. The upstream api.pokemontcg.io intermittently
  // returns 500/502 unauthenticated, so: retry with backoff, send an API key
  // when configured, request only needed fields, and cache every success in
  // SQLite (card data is immutable, so cached results stay valid and can be
  // served stale when the upstream is down).
  const tcgFetch = opts.tcgFetch ?? fetch;
  const tcgApiKey = opts.tcgApiKey ?? process.env.POKEMONTCG_API_KEY;

  /** Log one external API call. Reused by future providers (artist search). */
  const logApiCall = (entry: { provider: string; game: string; call: string; status: "success" | "error" | "cache-hit"; httpStatus?: number | null }) => {
    if (!lease.writeMode) return;
    db.prepare("INSERT INTO api_calls (id, created_at, provider, game, call, status, http_status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), new Date().toISOString(), entry.provider, entry.game, entry.call, entry.status, entry.httpStatus ?? null);
  };

  app.get("/api/lookup", async (req, reply) => {
    const { name, number } = (req.query ?? {}) as { name?: string; number?: string };
    const cleanName = (name ?? "").replace(/"/g, "").trim();
    if (!cleanName) return reply.code(400).send({ error: "A card name is required to search" });
    const cleanNumber = (number ?? "").trim();
    let q = `name:"${cleanName}"`;
    if (cleanNumber) q += ` number:${cleanNumber.replace(/[^\w-]/g, "")}`;
    const cacheKey = q;

    const cachedRow = () =>
      db.prepare("SELECT response FROM lookup_cache WHERE query = ?").get(cacheKey) as
        | { response: string }
        | undefined;

    const url =
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}` +
      `&pageSize=8&select=id,name,number,set,images,artist,evolvesFrom,evolvesTo`;
    const delays = [0, 600, 1800];
    let lastStatus = 0;
    for (const delay of delays) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await tcgFetch(url, {
          headers: {
            accept: "application/json",
            ...(tcgApiKey ? { "X-Api-Key": tcgApiKey } : {}),
          },
          signal: AbortSignal.timeout(12_000),
        });
        lastStatus = res.status;
        logApiCall({ provider: "pokemontcg", game: "pokemon", call: `cards?q=${q}`, status: res.ok ? "success" : "error", httpStatus: res.status });
        if (!res.ok) continue;
        const data = (await res.json()) as { data?: any[] };
        const cards: TcgCardResult[] = (data.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          number: c.number,
          setName: c.set?.name ?? "",
          imageSmall: c.images?.small ?? null,
          artist: c.artist ?? null,
          evolvesFrom: c.evolvesFrom ?? null,
          evolvesTo: Array.isArray(c.evolvesTo) ? c.evolvesTo : [],
        }));
        if (lease.writeMode) {
          db.prepare(
            `INSERT INTO lookup_cache (query, response, fetched_at) VALUES (?, ?, ?)
             ON CONFLICT(query) DO UPDATE SET response = excluded.response, fetched_at = excluded.fetched_at`,
          ).run(cacheKey, JSON.stringify(cards), new Date().toISOString());
        }
        return { cards, cached: false };
      } catch {
        lastStatus = 0;
        logApiCall({ provider: "pokemontcg", game: "pokemon", call: `cards?q=${q}`, status: "error" });
      }
    }

    const stale = cachedRow();
    if (stale) {
      logApiCall({ provider: "pokemontcg", game: "pokemon", call: `cards?q=${q}`, status: "cache-hit" });
      return { cards: JSON.parse(stale.response) as TcgCardResult[], cached: true };
    }
    return reply.code(502).send({
      error: `Pokémon TCG API is unavailable right now${lastStatus ? ` (HTTP ${lastStatus})` : ""} — try again in a moment`,
    });
  });

  // --- Card bank -------------------------------------------------------------
  app.get("/api/bank", async (req) => {
    const { game } = (req.query ?? {}) as { game?: string };
    const rows = (game
      ? db.prepare("SELECT data FROM bank_items WHERE game = ? ORDER BY updated_at DESC").all(game)
      : db.prepare("SELECT data FROM bank_items ORDER BY updated_at DESC").all()) as { data: string }[];
    return { items: rows.map((r) => JSON.parse(r.data)) as BankItem[] };
  });

  app.post("/api/bank", async (req, reply) => {
    if (requireWrite(reply)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const item = parseBankItem({ ...body, id: typeof body.id === "string" && body.id ? body.id : randomUUID() });
    if (!item) return reply.code(400).send({ error: "Invalid bank item" });
    db.prepare(
      `INSERT INTO bank_items (id, game, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET game = excluded.game, data = excluded.data, updated_at = excluded.updated_at`,
    ).run(item.id, item.game, JSON.stringify(item), new Date().toISOString());
    return { item };
  });

  app.put("/api/bank/:id", async (req, reply) => {
    if (requireWrite(reply)) return;
    const { id } = req.params as { id: string };
    const item = parseBankItem({ ...((req.body ?? {}) as Record<string, unknown>), id });
    if (!item) return reply.code(400).send({ error: "Invalid bank item" });
    const exists = db.prepare("SELECT id FROM bank_items WHERE id = ?").get(id);
    if (!exists) return reply.code(404).send({ error: "Bank item not found" });
    db.prepare("UPDATE bank_items SET game = ?, data = ?, updated_at = ? WHERE id = ?")
      .run(item.game, JSON.stringify(item), new Date().toISOString(), id);
    return { item };
  });

  app.delete("/api/bank/:id", async (req, reply) => {
    if (requireWrite(reply)) return;
    const { id } = req.params as { id: string };
    const result = db.prepare("DELETE FROM bank_items WHERE id = ?").run(id);
    if (!result.changes) return reply.code(404).send({ error: "Bank item not found" });
    return { ok: true };
  });

  app.post("/api/bank/import", async (req, reply) => {
    if (requireWrite(reply)) return;
    const body = (req.body ?? {}) as { items?: unknown[] };
    if (!Array.isArray(body.items)) return reply.code(400).send({ error: "Expected { items: [...] }" });
    const existing = (db.prepare("SELECT data FROM bank_items").all() as { data: string }[])
      .map((r) => JSON.parse(r.data) as BankItem);
    let created = 0;
    let updated = 0;
    for (const raw of body.items) {
      const parsed = parseBankItem({ ...(raw as Record<string, unknown>), id: ((raw as Record<string, unknown>).id as string) || randomUUID() });
      if (!parsed) continue;
      const match = existing.find((e) =>
        (parsed.apiId && e.game === parsed.game && e.apiId === parsed.apiId) ||
        (e.game === parsed.game && e.name.toLowerCase() === parsed.name.toLowerCase() && e.set === parsed.set && e.number === parsed.number),
      );
      if (match) {
        const merged: BankItem = { ...match, ...parsed, id: match.id };
        db.prepare("UPDATE bank_items SET game = ?, data = ?, updated_at = ? WHERE id = ?")
          .run(merged.game, JSON.stringify(merged), new Date().toISOString(), match.id);
        Object.assign(match, merged);
        updated++;
      } else {
        db.prepare("INSERT INTO bank_items (id, game, data, updated_at) VALUES (?, ?, ?, ?)")
          .run(parsed.id, parsed.game, JSON.stringify(parsed), new Date().toISOString());
        existing.push(parsed);
        created++;
      }
    }
    return { created, updated };
  });

  // --- API call tracking -------------------------------------------------------
  const CALL_WINDOWS: Record<string, number> = {
    "1h": 3_600_000, "12h": 43_200_000, "24h": 86_400_000,
    "3d": 259_200_000, "7d": 604_800_000, "30d": 2_592_000_000,
  };

  app.get("/api/calls/stats", async () => {
    const rows = db.prepare("SELECT created_at, provider, game FROM api_calls").all() as { created_at: string; provider: string; game: string }[];
    const now = Date.now();
    const windows: Record<string, number> = {};
    for (const [key, ms] of Object.entries(CALL_WINDOWS)) {
      windows[key] = rows.filter((r) => now - new Date(r.created_at).getTime() <= ms).length;
    }
    const tally = (key: "game" | "provider") => {
      const out: Record<string, number> = {};
      for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1;
      return out;
    };
    return { windows, byGame: tally("game"), byProvider: tally("provider"), total: rows.length };
  });

  app.get("/api/calls", async (req) => {
    const { range } = (req.query ?? {}) as { range?: string };
    const ms = CALL_WINDOWS[range ?? "24h"] ?? CALL_WINDOWS["24h"];
    const since = new Date(Date.now() - ms).toISOString();
    const rows = db.prepare("SELECT * FROM api_calls WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200")
      .all(since) as { id: string; created_at: string; provider: string; game: string; call: string; status: string; http_status: number | null }[];
    return {
      calls: rows.map((r) => ({
        id: r.id, createdAt: r.created_at, day: r.created_at.slice(0, 10),
        provider: r.provider, game: r.game, call: r.call, status: r.status, httpStatus: r.http_status,
      })),
    };
  });

  // --- App settings ------------------------------------------------------------
  app.get("/api/settings", async () => {
    const row = db.prepare("SELECT data FROM app_settings WHERE id = 1").get() as { data: string } | undefined;
    return { settings: row ? parseAppSettings(JSON.parse(row.data)) : defaultSettings() };
  });

  app.put("/api/settings", async (req, reply) => {
    if (requireWrite(reply)) return;
    const settings = parseAppSettings((req.body as { settings?: unknown })?.settings ?? req.body);
    db.prepare(
      `INSERT INTO app_settings (id, data) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    ).run(JSON.stringify(settings));
    return { settings };
  });

  app.get("/api/state", async () => readState());

  app.put("/api/state", async (req, reply) => {
    if (requireWrite(reply)) return;
    const body = (req.body ?? {}) as { state?: unknown };
    const state = parsePlannerState(body.state ?? body);
    if (!state) return reply.code(400).send({ error: "Invalid planner state" });
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO planner_state (id, state, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(state), updatedAt);
    return { state, updatedAt };
  });

  app.addHook("onClose", async () => {
    lease.release();
    db.close();
  });

  // Production: serve the built web app from the same origin/port.
  const webDist = opts.webDist ?? process.env.WEB_DIST ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = await buildApp({ logger: true });
  await app.listen({ port, host });
}

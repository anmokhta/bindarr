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
import {
  acquireWriteLease,
  forceAcquireWriteLease,
  readWriteLeaseInfo,
  tryPromoteWriteLease,
  type WriteLease,
  type WriteLeaseInfo,
} from "./write-lease.js";

export interface ServerOptions {
  databasePath?: string;
  webDist?: string;
  logger?: boolean;
  /** Injectable for tests; defaults to global fetch. */
  tcgFetch?: typeof fetch;
  /** Force write mode (tests / :memory:). When false, still attempts lease for file DBs. */
  skipWriteLease?: boolean;
  appVersion?: string;
  githubRepo?: string;
  /** Injectable GitHub fetch for version checks. */
  githubFetch?: typeof fetch;
}

export type { TcgCardResult } from "./tcgdex-client.js";
import {
  createTcgdexClient,
  isPokemontcgImageUrl,
  isTcgdexImageUrl,
  type TcgCardResult,
} from "./tcgdex-client.js";

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

  let lease: WriteLease = opts.skipWriteLease || databasePath === ":memory:"
    ? { writeMode: true, writer: null as WriteLeaseInfo | null, instanceId: null, release: () => undefined }
    : acquireWriteLease(databasePath);

  let db: ReturnType<typeof openDb>;
  try {
    db = openDb(databasePath, !lease.writeMode);
  } catch (e) {
    lease.release();
    throw e;
  }

  const demoteToReader = (writer: WriteLeaseInfo | null) => {
    lease.release(); // stop heartbeat if we had claimed
    lease = { writeMode: false, writer, instanceId: null, release: () => undefined };
  };

  /** Confirm we still own the lock file; demote if someone else took over. */
  const stillOwnLease = (): boolean => {
    if (!lease.writeMode) return false;
    if (databasePath === ":memory:" || opts.skipWriteLease) return true;
    if (!lease.instanceId) return true;
    const current = readWriteLeaseInfo(databasePath);
    if (!current || current.instanceId === lease.instanceId) return true;
    demoteToReader(current);
    return false;
  };

  const promoteToWriter = (force: boolean): { ok: true } | { ok: false; error: string; writer?: WriteLeaseInfo | null } => {
    if (lease.writeMode && stillOwnLease()) return { ok: true };
    if (databasePath === ":memory:" || opts.skipWriteLease) {
      lease = { writeMode: true, writer: null, instanceId: null, release: () => undefined };
      return { ok: true };
    }

    const next = force ? forceAcquireWriteLease(databasePath) : tryPromoteWriteLease(databasePath);
    if (!next) {
      const writer = readWriteLeaseInfo(databasePath);
      return { ok: false, error: "Another Bindarr still holds the write lease", writer };
    }

    try {
      const prev = db;
      const nextDb = openDb(databasePath, false);
      try {
        prev.close();
      } catch {
        /* ignore close errors on readonly handle */
      }
      db = nextDb;
      lease.release();
      lease = next;
      return { ok: true };
    } catch (e) {
      next.release();
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const softPromoteIfNeeded = () => {
    if (lease.writeMode) return;
    promoteToWriter(false);
  };

  const readState = (): { state: PlannerState; updatedAt: string | null } => {
    const row = db
      .prepare("SELECT state, updated_at FROM planner_state WHERE id = 1")
      .get() as { state: string; updated_at: string } | undefined;
    if (!row) return { state: defaultState(), updatedAt: null };
    return { state: parsePlannerState(JSON.parse(row.state)) ?? defaultState(), updatedAt: row.updated_at };
  };

  const requireWrite = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (lease.writeMode && stillOwnLease()) return null;
    softPromoteIfNeeded();
    if (lease.writeMode && stillOwnLease()) return null;
    return reply.code(423).send({
      error: "Database is open read-only; another Bindarr holds the write lease",
      writer: lease.writer ?? readWriteLeaseInfo(databasePath),
    });
  };

  app.get("/api/health", async () => {
    softPromoteIfNeeded();
    if (lease.writeMode) stillOwnLease();
    const writerInfo = lease.writeMode ? undefined : (lease.writer ?? readWriteLeaseInfo(databasePath) ?? undefined);
    return {
      ok: true,
      service: "bindarr",
      time: new Date().toISOString(),
      version: appVersion,
      writeMode: lease.writeMode,
      writer: writerInfo,
    };
  });

  app.post("/api/write-lease/takeover", async (req, reply) => {
    const body = (req.body ?? {}) as { confirm?: boolean };
    if (body.confirm !== true) {
      return reply.code(400).send({
        error: "Pass { confirm: true } to take write access. Only do this if no other Bindarr is using this database.",
      });
    }
    if (lease.writeMode && stillOwnLease()) {
      return { writeMode: true, writer: lease.writer };
    }
    const result = promoteToWriter(true);
    if (!result.ok) {
      return reply.code(409).send({ error: result.error, writer: result.writer, writeMode: false });
    }
    return { writeMode: true, writer: lease.writer };
  });

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

  // Pokémon card lookup via @tcgdex/sdk. Retry with backoff and cache successes
  // in SQLite; serve stale cache when upstream is down.
  const tcg = createTcgdexClient(opts.tcgFetch);

  /** Log one external API call. Reused by artist search and migration. */
  const logApiCall = (entry: { provider: string; game: string; call: string; status: "success" | "error" | "cache-hit"; httpStatus?: number | null }) => {
    if (!lease.writeMode) return;
    db.prepare("INSERT INTO api_calls (id, created_at, provider, game, call, status, http_status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), new Date().toISOString(), entry.provider, entry.game, entry.call, entry.status, entry.httpStatus ?? null);
  };

  async function lookupWithCache(
    cacheKey: string,
    callLabel: string,
    run: () => Promise<TcgCardResult[]>,
  ): Promise<{ cards: TcgCardResult[]; cached: boolean } | { error: string; status: number }> {
    const cachedRow = () =>
      db.prepare("SELECT response FROM lookup_cache WHERE query = ?").get(cacheKey) as
        | { response: string }
        | undefined;

    const delays = [0, 600, 1800];
    let lastStatus = 0;
    for (const delay of delays) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const cards = await run();
        logApiCall({ provider: "tcgdex", game: "pokemon", call: callLabel, status: "success", httpStatus: 200 });
        if (lease.writeMode) {
          db.prepare(
            `INSERT INTO lookup_cache (query, response, fetched_at) VALUES (?, ?, ?)
             ON CONFLICT(query) DO UPDATE SET response = excluded.response, fetched_at = excluded.fetched_at`,
          ).run(cacheKey, JSON.stringify(cards), new Date().toISOString());
        }
        return { cards, cached: false };
      } catch (e) {
        lastStatus = 0;
        logApiCall({ provider: "tcgdex", game: "pokemon", call: callLabel, status: "error" });
        // SDK may throw on HTTP errors; keep retrying
        void e;
      }
    }

    const stale = cachedRow();
    if (stale) {
      logApiCall({ provider: "tcgdex", game: "pokemon", call: callLabel, status: "cache-hit" });
      return { cards: JSON.parse(stale.response) as TcgCardResult[], cached: true };
    }
    return {
      status: 502,
      error: `TCGdex / Pokémon card API is unavailable right now${lastStatus ? ` (HTTP ${lastStatus})` : ""} — try again in a moment`,
    };
  }

  app.get("/api/lookup", async (req, reply) => {
    const { name, number, set } = (req.query ?? {}) as { name?: string; number?: string; set?: string };
    const cleanName = (name ?? "").replace(/"/g, "").trim();
    if (!cleanName) return reply.code(400).send({ error: "A card name is required to search" });
    const cleanNumber = (number ?? "").trim().replace(/[^\w-]/g, "");
    const cleanSet = (set ?? "").replace(/"/g, "").trim();
    const callLabel = `cards?name=${cleanName}${cleanNumber ? `&localId=${cleanNumber}` : ""}${cleanSet ? `&set.name=${cleanSet}` : ""}`;
    const cacheKey = `tcgdex:${callLabel}`;

    const result = await lookupWithCache(cacheKey, callLabel, () =>
      tcg.searchCards({ name: cleanName, number: cleanNumber, set: cleanSet, pageSize: 8 }),
    );
    if ("error" in result) return reply.code(result.status).send({ error: result.error });
    return result;
  });

  app.get("/api/lookup/artist", async (req, reply) => {
    const { name, page: pageRaw } = (req.query ?? {}) as { name?: string; page?: string };
    const cleanName = (name ?? "").replace(/"/g, "").trim();
    if (!cleanName) return reply.code(400).send({ error: "An artist name is required to search" });
    const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
    const pageSize = 24;
    const callLabel = `cards?illustrator=eq:${cleanName}&page=${page}`;
    const cacheKey = `tcgdex:${callLabel}`;

    const result = await lookupWithCache(cacheKey, callLabel, async () => {
      const { cards } = await tcg.searchByArtist({ illustrator: cleanName, page, pageSize });
      return cards;
    });
    if ("error" in result) return reply.code(result.status).send({ error: result.error });
    return { ...result, page, pageSize };
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

  /** Rewrite images.pokemontcg.io URLs on bank items and planner pockets to TCGdex assets. */
  app.post("/api/migrate/pokemontcg-images", async (_req, reply) => {
    if (requireWrite(reply)) return;

    const report = {
      bankUpdated: 0,
      bankSkipped: 0,
      bankErrors: 0,
      pocketsUpdated: 0,
      pocketsSkipped: 0,
    };

    async function resolveNewImage(item: {
      image: string | null;
      apiId: string | null;
      name: string;
      number: string;
      set: string;
    }): Promise<{ image: string; apiId: string | null } | null> {
      if (!isPokemontcgImageUrl(item.image)) return null;
      if (item.apiId) {
        const card = await tcg.getCardById(item.apiId);
        if (card?.imageSmall) {
          logApiCall({ provider: "tcgdex", game: "pokemon", call: `migrate:${item.apiId}`, status: "success", httpStatus: 200 });
          return { image: card.imageSmall, apiId: card.id || item.apiId };
        }
      }
      if (item.name.trim()) {
        const cards = await tcg.searchCards({
          name: item.name,
          number: item.number,
          set: item.set,
          pageSize: 1,
        });
        const card = cards[0];
        if (card?.imageSmall) {
          logApiCall({ provider: "tcgdex", game: "pokemon", call: `migrate:search:${item.name}`, status: "success", httpStatus: 200 });
          return { image: card.imageSmall, apiId: card.id || item.apiId };
        }
      }
      return null;
    }

    const bankRows = db.prepare("SELECT id, data FROM bank_items").all() as { id: string; data: string }[];
    for (const row of bankRows) {
      let item: BankItem;
      try {
        item = JSON.parse(row.data) as BankItem;
      } catch {
        report.bankErrors += 1;
        continue;
      }
      if (!isPokemontcgImageUrl(item.image)) {
        report.bankSkipped += 1;
        continue;
      }
      try {
        const next = await resolveNewImage({
          image: item.image,
          apiId: item.apiId,
          name: item.name,
          number: item.number ?? "",
          set: item.set ?? "",
        });
        if (!next) {
          report.bankSkipped += 1;
          continue;
        }
        const updated = { ...item, image: next.image, apiId: next.apiId ?? item.apiId };
        db.prepare("UPDATE bank_items SET data = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(updated), new Date().toISOString(), row.id);
        report.bankUpdated += 1;
      } catch {
        report.bankErrors += 1;
        logApiCall({ provider: "tcgdex", game: "pokemon", call: `migrate:bank:${row.id}`, status: "error" });
      }
    }

    const stateRow = db.prepare("SELECT state FROM planner_state WHERE id = 1").get() as { state: string } | undefined;
    if (stateRow) {
      const state = parsePlannerState(JSON.parse(stateRow.state));
      if (state) {
        let dirty = false;
        const bankById = new Map(
          (db.prepare("SELECT id, data FROM bank_items").all() as { id: string; data: string }[])
            .map((r) => {
              try {
                return [r.id, JSON.parse(r.data) as BankItem] as const;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Array<readonly [string, BankItem]>,
        );

        for (const binder of state.binders) {
          for (const page of binder.pages) {
            for (let i = 0; i < page.slots.length; i++) {
              const slot = page.slots[i];
              if (!slot || !isPokemontcgImageUrl(slot.image)) continue;
              try {
                const linked = slot.bankId ? bankById.get(slot.bankId) : undefined;
                if (linked?.image && isTcgdexImageUrl(linked.image)) {
                  page.slots[i] = { ...slot, image: linked.image };
                  dirty = true;
                  report.pocketsUpdated += 1;
                  continue;
                }
                const next = await resolveNewImage({
                  image: slot.image,
                  apiId: linked?.apiId ?? null,
                  name: slot.name,
                  number: linked?.number ?? "",
                  set: linked?.set ?? "",
                });
                if (!next) {
                  report.pocketsSkipped += 1;
                  continue;
                }
                page.slots[i] = { ...slot, image: next.image };
                dirty = true;
                report.pocketsUpdated += 1;
              } catch {
                report.pocketsSkipped += 1;
              }
            }
          }
        }

        if (dirty) {
          db.prepare(
            `INSERT INTO planner_state (id, state, updated_at) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
          ).run(JSON.stringify(state), new Date().toISOString());
        }
      }
    }

    return report;
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
    const rows = db.prepare("SELECT * FROM api_calls WHERE created_at >= ? ORDER BY created_at DESC LIMIT 2000")
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

import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultState, parsePlannerState, type PlannerState } from "@bindarr/shared";

export interface ServerOptions {
  databasePath?: string;
  webDist?: string;
  logger?: boolean;
  /** Injectable for tests; defaults to global fetch. */
  tcgFetch?: typeof fetch;
  tcgApiKey?: string;
}

export interface TcgCardResult {
  id: string;
  name: string;
  number: string;
  setName: string;
  imageSmall: string | null;
}

export function openDb(databasePath: string) {
  if (databasePath !== ":memory:") mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
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
  `);
  return db;
}

export async function buildApp(opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const db = openDb(opts.databasePath ?? process.env.DATABASE_PATH ?? "./data/bindarr.db");

  const readState = (): { state: PlannerState; updatedAt: string | null } => {
    const row = db
      .prepare("SELECT state, updated_at FROM planner_state WHERE id = 1")
      .get() as { state: string; updated_at: string } | undefined;
    if (!row) return { state: defaultState(), updatedAt: null };
    return { state: parsePlannerState(JSON.parse(row.state)) ?? defaultState(), updatedAt: row.updated_at };
  };

  app.get("/api/health", async () => ({ ok: true, service: "bindarr", time: new Date().toISOString() }));

  // Pokémon TCG lookup proxy. The upstream api.pokemontcg.io intermittently
  // returns 500/502 unauthenticated, so: retry with backoff, send an API key
  // when configured, request only needed fields, and cache every success in
  // SQLite (card data is immutable, so cached results stay valid and can be
  // served stale when the upstream is down).
  const tcgFetch = opts.tcgFetch ?? fetch;
  const tcgApiKey = opts.tcgApiKey ?? process.env.POKEMONTCG_API_KEY;

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
      `&pageSize=8&select=id,name,number,set,images`;
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
        if (!res.ok) continue;
        const data = (await res.json()) as { data?: any[] };
        const cards: TcgCardResult[] = (data.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          number: c.number,
          setName: c.set?.name ?? "",
          imageSmall: c.images?.small ?? null,
        }));
        db.prepare(
          `INSERT INTO lookup_cache (query, response, fetched_at) VALUES (?, ?, ?)
           ON CONFLICT(query) DO UPDATE SET response = excluded.response, fetched_at = excluded.fetched_at`,
        ).run(cacheKey, JSON.stringify(cards), new Date().toISOString());
        return { cards, cached: false };
      } catch {
        lastStatus = 0;
      }
    }

    const stale = cachedRow();
    if (stale) return { cards: JSON.parse(stale.response) as TcgCardResult[], cached: true };
    return reply.code(502).send({
      error: `Pokémon TCG API is unavailable right now${lastStatus ? ` (HTTP ${lastStatus})` : ""} — try again in a moment`,
    });
  });

  app.get("/api/state", async () => readState());

  app.put("/api/state", async (req, reply) => {
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

  app.addHook("onClose", async () => db.close());

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

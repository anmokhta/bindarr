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

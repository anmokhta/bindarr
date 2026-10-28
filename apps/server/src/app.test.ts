import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultState } from "@bindarr/shared";
import { buildApp } from "./index.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "bindarr-"));
  tempDirs.push(dir);
  return join(dir, "bindarr.db");
}

describe("server API", () => {
  it("health, default state, and PUT/GET round-trip", async () => {
    const app = await buildApp({ databasePath: ":memory:" });
    try {
      const health = await app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json().ok).toBe(true);
      expect(health.json().writeMode).toBe(true);
      expect(health.json().version).toBeTruthy();

      const initial = await app.inject({ method: "GET", url: "/api/state" });
      expect(initial.json().state).toEqual(defaultState());
      expect(initial.json().updatedAt).toBeNull();

      const modified = defaultState();
      modified.binders[0].pages[0].slots[0] = { name: "Pikachu", tag: "showcase", note: "Base #58", image: null };
      const put = await app.inject({ method: "PUT", url: "/api/state", payload: { state: modified } });
      expect(put.statusCode).toBe(200);
      expect(put.json().updatedAt).toBeTruthy();

      const after = await app.inject({ method: "GET", url: "/api/state" });
      expect(after.json().state.binders[0].pages[0].slots[0].name).toBe("Pikachu");

      // Legacy-shaped state migrates to named binders on write.
      const legacyPut = await app.inject({
        method: "PUT", url: "/api/state",
        payload: { state: { activeType: "3x3", activePageIndex: { "3x3": 0, "2x2": 0 }, pages: { "3x3": [{ name: "P", slots: [] }], "2x2": [{ name: "Q", slots: [] }] } } },
      });
      expect(legacyPut.statusCode).toBe(200);
      expect(legacyPut.json().state.binders.map((b: { name: string }) => b.name)).toEqual(["9-Pocket Binder", "4-Pocket Binder"]);

      const bad = await app.inject({ method: "PUT", url: "/api/state", payload: { state: { nope: 1 } } });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("lookup retries upstream failures, then serves the cached result", async () => {
    let listAttempts = 0;
    let failAll = false;
    const flakyFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (failAll) return new Response(null, { status: 502 });
      // Detail fetch: /v2/en/cards/{id} (no query string)
      if (/\/cards\/[^/?]+$/.test(url)) {
        return Response.json({
          id: "basep-1",
          localId: "1",
          name: "Pikachu",
          image: "https://assets.example/p",
          illustrator: "Ken Sugimori",
          set: { name: "Wizards Black Star Promos" },
          evolveFrom: null,
        });
      }
      listAttempts++;
      if (listAttempts < 3) return new Response(null, { status: 500 });
      return Response.json([
        { id: "basep-1", localId: "1", name: "Pikachu", image: "https://assets.example/p" },
      ]);
    }) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", tcgFetch: flakyFetch });
    try {
      const first = await app.inject({ method: "GET", url: "/api/lookup?name=Pikachu" });
      expect(first.statusCode).toBe(200);
      expect(first.json().cards[0]).toMatchObject({
        name: "Pikachu",
        setName: "Wizards Black Star Promos",
        imageSmall: "https://assets.example/p/low.webp",
        number: "1",
        artist: "Ken Sugimori",
      });
      expect(first.json().cached).toBe(false);
      expect(listAttempts).toBe(3);

      failAll = true;
      const stale = await app.inject({ method: "GET", url: "/api/lookup?name=Pikachu" });
      expect(stale.statusCode).toBe(200);
      expect(stale.json().cached).toBe(true);
      expect(stale.json().cards[0].name).toBe("Pikachu");
    } finally {
      await app.close();
    }

    // Upstream fully down on a fresh app sharing no DB would 502; with the
    // same in-memory DB gone, instead verify 502 + missing-name handling.
    const downFetch = (async () => new Response(null, { status: 502 })) as typeof fetch;
    const app2 = await buildApp({ databasePath: ":memory:", tcgFetch: downFetch });
    try {
      const down = await app2.inject({ method: "GET", url: "/api/lookup?name=Pikachu" });
      expect(down.statusCode).toBe(502);
      expect(down.json().error).toContain("unavailable");
      const noName = await app2.inject({ method: "GET", url: "/api/lookup" });
      expect(noName.statusCode).toBe(400);
    } finally {
      await app2.close();
    }
  }, 20_000);

  it("import dedupes on apiId and name/set/number, and logs lookup calls", async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (/\/cards\/[^/?]+$/.test(url)) {
        return Response.json({
          id: "base1-58",
          localId: "58",
          name: "Pikachu",
          image: "https://assets.example/p",
          illustrator: "Mitsuhiro Arita",
          set: { name: "Base" },
        });
      }
      return Response.json([
        { id: "base1-58", localId: "58", name: "Pikachu", image: "https://assets.example/p" },
      ]);
    }) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", tcgFetch: fakeFetch });
    try {
      const items = [
        { game: "pokemon", apiId: "base1-58", name: "Pikachu", set: "Base", number: "58", want: true, have: false },
        { game: "pokemon", name: "Pikachu", set: "Base", number: "58" },
      ];
      const first = await app.inject({ method: "POST", url: "/api/bank/import", payload: { items } });
      expect(first.json()).toEqual({ created: 1, updated: 1 });
      const second = await app.inject({ method: "POST", url: "/api/bank/import", payload: { items } });
      expect(second.json()).toEqual({ created: 0, updated: 2 });
      const bank = await app.inject({ method: "GET", url: "/api/bank?game=pokemon" });
      expect(bank.json().items).toHaveLength(1);

      await app.inject({ method: "GET", url: "/api/lookup?name=Pikachu" });
      const stats = await app.inject({ method: "GET", url: "/api/calls/stats" });
      expect(stats.json().windows["1h"]).toBe(1);
      expect(stats.json().windows["30d"]).toBe(1);
      expect(stats.json().byGame.pokemon).toBe(1);
      expect(stats.json().byProvider.tcgdex).toBe(1);
      const calls = await app.inject({ method: "GET", url: "/api/calls?range=24h" });
      expect(calls.json().calls[0]).toMatchObject({ status: "success", game: "pokemon", provider: "tcgdex" });
      expect(calls.json().calls[0].call).toContain("Pikachu");
      expect(calls.json().calls[0].day).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it("bank CRUD and settings round-trip", async () => {
    const app = await buildApp({ databasePath: ":memory:" });
    try {
      const created = await app.inject({
        method: "POST", url: "/api/bank",
        payload: { game: "pokemon", name: "Pikachu", set: "Base", number: "58", tags: ["holo"] },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().item.id;
      expect(id).toBeTruthy();

      const misc = await app.inject({
        method: "POST", url: "/api/bank",
        payload: { game: "misc", name: "Sleeve back", appliesToGame: "pokemon" },
      });
      expect(misc.statusCode).toBe(200);

      const pokemon = await app.inject({ method: "GET", url: "/api/bank?game=pokemon" });
      expect(pokemon.json().items).toHaveLength(1);
      const all = await app.inject({ method: "GET", url: "/api/bank" });
      expect(all.json().items).toHaveLength(2);

      const bad = await app.inject({ method: "POST", url: "/api/bank", payload: { game: "pokemon" } });
      expect(bad.statusCode).toBe(400);

      expect(created.json().item.createdAt).toBeTruthy();
      const createdAt = created.json().item.createdAt as string;

      const updated = await app.inject({
        method: "PUT", url: `/api/bank/${id}`,
        payload: { game: "pokemon", name: "Pikachu", set: "Base", number: "58", collection: "Favorites" },
      });
      expect(updated.json().item.collection).toBe("Favorites");
      expect(updated.json().item.createdAt).toBe(createdAt);

      const listed = await app.inject({ method: "GET", url: "/api/bank?game=pokemon" });
      expect(listed.json().items[0].createdAt).toBe(createdAt);

      const del = await app.inject({ method: "DELETE", url: `/api/bank/${id}` });
      expect(del.statusCode).toBe(200);
      const after = await app.inject({ method: "GET", url: "/api/bank?game=pokemon" });
      expect(after.json().items).toHaveLength(0);

      const settings = await app.inject({ method: "GET", url: "/api/settings" });
      expect(settings.json().settings.visibleGames).toEqual(["pokemon", "misc"]);
      await app.inject({ method: "PUT", url: "/api/settings", payload: { settings: { visibleGames: ["misc"] } } });
      const settings2 = await app.inject({ method: "GET", url: "/api/settings" });
      expect(settings2.json().settings.visibleGames).toEqual(["misc"]);
    } finally {
      await app.close();
    }
  });

  it("second process on the same DB file is read-only", async () => {
    const dbPath = tempDbPath();
    const writer = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    const reader = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    try {
      expect((await writer.inject({ method: "GET", url: "/api/health" })).json().writeMode).toBe(true);
      const readerHealth = await reader.inject({ method: "GET", url: "/api/health" });
      expect(readerHealth.json().writeMode).toBe(false);
      expect(readerHealth.json().writer?.pid).toBe(process.pid);

      const put = await reader.inject({ method: "PUT", url: "/api/state", payload: { state: defaultState() } });
      expect(put.statusCode).toBe(423);

      const get = await reader.inject({ method: "GET", url: "/api/state" });
      expect(get.statusCode).toBe(200);
    } finally {
      await reader.close();
      await writer.close();
    }
  });

  it("read-only instance can force-take the write lease", async () => {
    const dbPath = tempDbPath();
    const writer = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    const reader = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    try {
      expect((await reader.inject({ method: "GET", url: "/api/health" })).json().writeMode).toBe(false);

      const noConfirm = await reader.inject({ method: "POST", url: "/api/write-lease/takeover", payload: {} });
      expect(noConfirm.statusCode).toBe(400);

      const takeover = await reader.inject({
        method: "POST",
        url: "/api/write-lease/takeover",
        payload: { confirm: true },
      });
      expect(takeover.statusCode).toBe(200);
      expect(takeover.json().writeMode).toBe(true);

      const put = await reader.inject({ method: "PUT", url: "/api/state", payload: { state: defaultState() } });
      expect(put.statusCode).toBe(200);

      // Former writer should detect lock theft and refuse writes.
      const stolen = await writer.inject({ method: "PUT", url: "/api/state", payload: { state: defaultState() } });
      expect(stolen.statusCode).toBe(423);
    } finally {
      await reader.close();
      await writer.close();
    }
  });

  it("soft-promotes to writer after the previous writer releases", async () => {
    const dbPath = tempDbPath();
    const writer = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    const reader = await buildApp({ databasePath: dbPath, appVersion: "0.1.0" });
    try {
      expect((await reader.inject({ method: "GET", url: "/api/health" })).json().writeMode).toBe(false);
      await writer.close();

      const health = await reader.inject({ method: "GET", url: "/api/health" });
      expect(health.json().writeMode).toBe(true);

      const put = await reader.inject({ method: "PUT", url: "/api/state", payload: { state: defaultState() } });
      expect(put.statusCode).toBe(200);
    } finally {
      await reader.close();
    }
  });

  it("artist lookup returns illustrator cards and rejects missing name", async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (/\/cards\/[^/?]+$/.test(url)) {
        return Response.json({
          id: "base1-58",
          localId: "58",
          name: "Pikachu",
          image: "https://assets.example/p",
          illustrator: "Mitsuhiro Arita",
          set: { name: "Base" },
        });
      }
      if (url.includes("illustrator=")) {
        return Response.json([
          { id: "base1-58", localId: "58", name: "Pikachu", image: "https://assets.example/p" },
        ]);
      }
      return Response.json([]);
    }) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", tcgFetch: fakeFetch });
    try {
      const missing = await app.inject({ method: "GET", url: "/api/lookup/artist" });
      expect(missing.statusCode).toBe(400);

      const res = await app.inject({ method: "GET", url: "/api/lookup/artist?name=Mitsuhiro%20Arita" });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
      expect(res.json().pageSize).toBe(24);
      expect(res.json().cards[0]).toMatchObject({
        name: "Pikachu",
        artist: "Mitsuhiro Arita",
        imageSmall: "https://assets.example/p/low.webp",
        number: "58",
      });
    } finally {
      await app.close();
    }
  });

  it("migrates pokemontcg.io bank and pocket image URLs via apiId", async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/cards/base1-58")) {
        return Response.json({
          id: "base1-58",
          localId: "58",
          name: "Pikachu",
          image: "https://assets.tcgdex.net/en/base1/58",
          illustrator: "Mitsuhiro Arita",
          set: { name: "Base" },
        });
      }
      return Response.json([]);
    }) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", tcgFetch: fakeFetch });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/bank",
        payload: {
          game: "pokemon",
          name: "Pikachu",
          set: "Base",
          number: "58",
          apiId: "base1-58",
          image: "https://images.pokemontcg.io/base1/58.png",
        },
      });
      const bankId = created.json().item.id as string;

      const state = defaultState();
      state.binders[0].pages[0].slots[0] = {
        name: "Pikachu",
        tag: "none",
        note: "",
        image: "https://images.pokemontcg.io/base1/58.png",
        bankId,
      };
      await app.inject({ method: "PUT", url: "/api/state", payload: { state } });

      const migrate = await app.inject({ method: "POST", url: "/api/migrate/pokemontcg-images" });
      expect(migrate.statusCode).toBe(200);
      expect(migrate.json()).toMatchObject({
        bankUpdated: 1,
        pocketsUpdated: 1,
        bankErrors: 0,
      });

      const bank = await app.inject({ method: "GET", url: "/api/bank?game=pokemon" });
      expect(bank.json().items[0].image).toBe("https://assets.tcgdex.net/en/base1/58/low.webp");

      const after = await app.inject({ method: "GET", url: "/api/state" });
      expect(after.json().state.binders[0].pages[0].slots[0].image).toBe(
        "https://assets.tcgdex.net/en/base1/58/low.webp",
      );

      const again = await app.inject({ method: "POST", url: "/api/migrate/pokemontcg-images" });
      expect(again.json().bankUpdated).toBe(0);
      expect(again.json().pocketsUpdated).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("version/latest compares against GitHub release tag", async () => {
    const fakeGh = (async () => Response.json({
      tag_name: "v0.2.0",
      html_url: "https://github.com/anmokhta/bindarr/releases/tag/v0.2.0",
    })) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", appVersion: "0.1.0", githubFetch: fakeGh, githubRepo: "anmokhta/bindarr" });
    try {
      const res = await app.inject({ method: "GET", url: "/api/version/latest" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        current: "0.1.0",
        latest: "0.2.0",
        updateAvailable: true,
      });
    } finally {
      await app.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import { defaultState } from "@bindarr/shared";
import { buildApp } from "./index.js";

describe("server API", () => {
  it("health, default state, and PUT/GET round-trip", async () => {
    const app = await buildApp({ databasePath: ":memory:" });
    try {
      const health = await app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json().ok).toBe(true);

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
    let calls = 0;
    let failAll = false;
    const flakyFetch = (async () => {
      calls++;
      if (failAll) return new Response(null, { status: 502 });
      if (calls < 3) return new Response(null, { status: 500 });
      return Response.json({
        data: [{ id: "basep-1", name: "Pikachu", number: "1", set: { name: "Wizards Black Star Promos" }, images: { small: "https://img/1.png" } }],
      });
    }) as typeof fetch;
    const app = await buildApp({ databasePath: ":memory:", tcgFetch: flakyFetch });
    try {
      const first = await app.inject({ method: "GET", url: "/api/lookup?name=Pikachu" });
      expect(first.statusCode).toBe(200);
      expect(first.json().cards[0]).toMatchObject({ name: "Pikachu", setName: "Wizards Black Star Promos", imageSmall: "https://img/1.png" });
      expect(first.json().cached).toBe(false);
      expect(calls).toBe(3);

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
    const fakeFetch = (async () => Response.json({
      data: [{ id: "base1-58", name: "Pikachu", number: "58", set: { name: "Base" }, images: { small: "https://img/p.png" }, artist: "Mitsuhiro Arita" }],
    })) as typeof fetch;
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
      expect(stats.json().byProvider.pokemontcg).toBe(1);
      const calls = await app.inject({ method: "GET", url: "/api/calls?range=24h" });
      expect(calls.json().calls[0]).toMatchObject({ status: "success", game: "pokemon", provider: "pokemontcg" });
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

      const updated = await app.inject({
        method: "PUT", url: `/api/bank/${id}`,
        payload: { game: "pokemon", name: "Pikachu", set: "Base", number: "58", collection: "Favorites" },
      });
      expect(updated.json().item.collection).toBe("Favorites");

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
});

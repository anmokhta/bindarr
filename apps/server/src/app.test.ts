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
      modified.pages["3x3"][0].slots[0] = { name: "Pikachu", tag: "showcase", note: "Base #58", image: null };
      const put = await app.inject({ method: "PUT", url: "/api/state", payload: { state: modified } });
      expect(put.statusCode).toBe(200);
      expect(put.json().updatedAt).toBeTruthy();

      const after = await app.inject({ method: "GET", url: "/api/state" });
      expect(after.json().state.pages["3x3"][0].slots[0].name).toBe("Pikachu");

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
});

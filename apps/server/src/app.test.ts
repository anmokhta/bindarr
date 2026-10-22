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
});

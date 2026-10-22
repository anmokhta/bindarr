import { describe, expect, it } from "vitest";
import { bankItemToSlot, defaultSettings, defaultState, parseAppSettings, parseBankItem, parsePlannerState } from "./index.js";

describe("defaultState", () => {
  it("creates one blank page per binder type with correct slot counts", () => {
    const s = defaultState();
    expect(s.pages["3x3"][0].slots).toHaveLength(9);
    expect(s.pages["2x2"][0].slots).toHaveLength(4);
    expect(s.pages["3x3"][0].slots.every((x) => x === null)).toBe(true);
  });
});

describe("parsePlannerState", () => {
  it("round-trips the default state", () => {
    expect(parsePlannerState(defaultState())).toEqual(defaultState());
  });
  it("rejects garbage", () => {
    expect(parsePlannerState(null)).toBeNull();
    expect(parsePlannerState({ pages: {} })).toBeNull();
  });
  it("accepts slots with and without bankId", () => {
    const s = defaultState();
    s.pages["3x3"][0].slots[0] = { name: "Pikachu", tag: "none", note: "", image: null, bankId: "abc" };
    expect(parsePlannerState(s)?.pages["3x3"][0].slots[0]).toMatchObject({ bankId: "abc" });
  });
});

describe("bank items & settings", () => {
  it("parses a minimal bank item with defaults and converts to a slot", () => {
    const item = parseBankItem({ id: "1", game: "pokemon", name: "Pikachu", set: "Base", number: "58" })!;
    expect(item.tags).toEqual([]);
    expect(item.artist).toBeNull();
    const slot = bankItemToSlot(item);
    expect(slot).toMatchObject({ name: "Pikachu", note: "Base #58", bankId: "1" });
  });
  it("parses a misc item with extras", () => {
    const item = parseBankItem({ id: "2", game: "misc", name: "Cool sleeve back", appliesToGame: "pokemon", year: 1997 })!;
    expect(item.appliesToGame).toBe("pokemon");
    expect(item.year).toBe(1997);
  });
  it("rejects nameless bank items and falls back on bad settings", () => {
    expect(parseBankItem({ id: "x", game: "pokemon" })).toBeNull();
    expect(parseAppSettings({ nope: 1 })).toEqual(defaultSettings());
    expect(parseAppSettings({ visibleGames: ["misc"] }).visibleGames).toEqual(["misc"]);
  });
});

describe("parsePlannerState padding", () => {
  it("pads short slot arrays and clamps page index", () => {
    const s = defaultState();
    s.pages["3x3"][0].slots = [null];
    s.activePageIndex["3x3"] = 99;
    const parsed = parsePlannerState(s)!;
    expect(parsed.pages["3x3"][0].slots).toHaveLength(9);
    expect(parsed.activePageIndex["3x3"]).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { defaultState, parsePlannerState } from "./index.js";

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
  it("pads short slot arrays and clamps page index", () => {
    const s = defaultState();
    s.pages["3x3"][0].slots = [null];
    s.activePageIndex["3x3"] = 99;
    const parsed = parsePlannerState(s)!;
    expect(parsed.pages["3x3"][0].slots).toHaveLength(9);
    expect(parsed.activePageIndex["3x3"]).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { bankItemToSlot, defaultSettings, defaultState, makeBinder, parseAppSettings, parseBankItem, parsePlannerState, resizeBinderSheets, resolveSlotView, sheetCountOf, spreadCount, spreadIndexForSide, spreadSides, totalSlotsOf } from "./index.js";

describe("defaultState", () => {
  it("creates the two starter binders with correct slot counts", () => {
    const s = defaultState();
    expect(s.binders).toHaveLength(2);
    expect(s.binders[0].pages[0].slots).toHaveLength(9);
    expect(s.binders[1].pages[0].slots).toHaveLength(4);
    expect(s.activeBinderId).toBe(s.binders[0].id);
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
    s.binders[0].pages[0].slots[0] = { name: "Pikachu", tag: "none", note: "", image: null, bankId: "abc" };
    expect(parsePlannerState(s)?.binders[0].pages[0].slots[0]).toMatchObject({ bankId: "abc" });
  });
  it("migrates the legacy two-bucket state, preserving pages and selection", () => {
    const legacy = {
      activeType: "2x2",
      activePageIndex: { "3x3": 0, "2x2": 0 },
      pages: {
        "3x3": [{ name: "Main", slots: [{ name: "Pikachu", tag: "none", note: "", image: null }] }],
        "2x2": [{ name: "Thick", slots: [null, null] }],
      },
    };
    const parsed = parsePlannerState(legacy)!;
    expect(parsed.binders.map((b) => b.name)).toEqual(["9-Pocket Binder", "4-Pocket Binder"]);
    expect(parsed.binders[0].pages[0].slots).toHaveLength(9);
    expect(parsed.binders[0].pages[0].slots[0]).toMatchObject({ name: "Pikachu" });
    expect(parsed.binders[1].pages[0].slots).toHaveLength(4);
    expect(parsed.activeBinderId).toBe("legacy-2x2");
  });
  it("normalizes 4x3 binders to 12 slots and repairs a bad active id", () => {
    const parsed = parsePlannerState({
      activeBinderId: "missing",
      binders: [{ id: "b1", name: "Big", layout: "4x3", pages: [{ name: "P1", slots: [null] }], activePageIndex: 5, archivedAt: null }],
    })!;
    expect(parsed.binders[0].pages[0].slots).toHaveLength(12);
    expect(parsed.binders[0].activePageIndex).toBe(1); // clamped after odd-side padding
    expect(parsed.activeBinderId).toBe("b1");
  });
});

describe("binder sheets", () => {
  it("3 sheets in a 2x2 binder = 6 sides and 24 slots", () => {
    const b = makeBinder("s1", "Sheets", "2x2", 3);
    expect(sheetCountOf(b)).toBe(3);
    expect(b.pages).toHaveLength(6);
    expect(totalSlotsOf(b)).toBe(24);
  });
  it("grows in sheet pairs and shrinks only past empty sides", () => {
    const b = makeBinder("s2", "Grow", "3x3", 1);
    const grown = resizeBinderSheets(b, 3);
    expect(grown.ok && grown.binder.pages).toHaveLength(6);
    const withCard = makeBinder("s3", "Card", "2x2", 3);
    withCard.pages[5].slots[0] = { name: "Pikachu", tag: "none", note: "", image: null };
    const blocked = resizeBinderSheets(withCard, 2);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blockedPage).toBe("Page 6");
    expect(withCard.pages).toHaveLength(6);
    withCard.pages[5].slots[0] = null;
    const shrunk = resizeBinderSheets(withCard, 2);
    expect(shrunk.ok && shrunk.binder.pages).toHaveLength(4);
  });
  it("groups spreads as [0], [1,2], [3,4]", () => {
    expect([0, 1, 2, 3, 4, 5].map(spreadIndexForSide)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(spreadSides(0, 6)).toEqual([0]);
    expect(spreadSides(1, 6)).toEqual([1, 2]);
    expect(spreadSides(2, 6)).toEqual([3, 4]);
    expect(spreadCount(6)).toBe(4);
  });
});

describe("bank items & settings", () => {
  it("parses a minimal bank item with defaults and converts to a slot", () => {
    const item = parseBankItem({ id: "1", game: "pokemon", name: "Pikachu", set: "Base", number: "58" })!;
    expect(item.tags).toEqual([]);
    expect(item.artist).toBeNull();
    const slot = bankItemToSlot(item);
    expect(slot).toMatchObject({ name: "Pikachu", note: "Base #58", bankId: "1", tag: "none" });
    expect(bankItemToSlot(item, "showcase").tag).toBe("showcase");
  });
  it("resolveSlotView prefers live bank fields and keeps pocket tag", () => {
    const item = parseBankItem({
      id: "1",
      game: "pokemon",
      name: "Rayquaza",
      set: "EX",
      number: "22",
      image: "https://example.com/ray.png",
      artist: "Mitsuhiro Arita",
      have: true,
      want: false,
    })!;
    const slot = bankItemToSlot(item, "showcase");
    slot.name = "Stale name";
    slot.note = "Stale note";
    const renamed = { ...item, name: "Rayquaza V", note: "Custom note" };
    const view = resolveSlotView(slot, [renamed]);
    expect(view).toMatchObject({
      name: "Rayquaza V",
      note: "Custom note",
      image: "https://example.com/ray.png",
      tag: "showcase",
      linked: true,
      orphan: false,
      wishlistOnly: false,
      artist: "Mitsuhiro Arita",
    });
  });
  it("resolveSlotView marks orphans and falls back for legacy unlinked slots", () => {
    const orphan = resolveSlotView(
      { name: "Gone", tag: "none", note: "", image: null, bankId: "missing" },
      [],
    );
    expect(orphan).toMatchObject({ orphan: true, linked: false, name: "Missing bank card" });
    const legacy = resolveSlotView(
      { name: "Freeform", tag: "none", note: "old", image: null, bankId: null },
      [],
    );
    expect(legacy).toMatchObject({ name: "Freeform", note: "old", linked: false, orphan: false });
  });
  it("defaults old items to have=true want=false and allows both", () => {
    const legacy = parseBankItem({ id: "0", game: "pokemon", name: "Old Card" })!;
    expect(legacy.have).toBe(true);
    expect(legacy.want).toBe(false);
    const both = parseBankItem({ id: "3", game: "pokemon", name: "Dupe", have: true, want: true })!;
    expect(both.have && both.want).toBe(true);
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
    expect(parseAppSettings({ visibleGames: ["misc"] }).navStyle).toBe("segment");
    expect(parseAppSettings({ navStyle: "icons" }).navStyle).toBe("icons");
    expect(parseAppSettings({ navStyle: "pills" }).navStyle).toBe("segment");
  });
});

describe("parsePlannerState padding", () => {
  it("pads short slot arrays and clamps page index", () => {
    const s = defaultState();
    s.binders[0].pages[0].slots = [null];
    s.binders[0].activePageIndex = 99;
    const parsed = parsePlannerState(s)!;
    expect(parsed.binders[0].pages[0].slots).toHaveLength(9);
    expect(parsed.binders[0].activePageIndex).toBe(1); // two sides per sheet now
  });
});

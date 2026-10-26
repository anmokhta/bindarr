import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BankItem } from "@bindarr/shared";
import type { TcgCard } from "./api.js";

vi.mock("./api.js", () => ({
  lookupCards: vi.fn(),
}));

import { lookupCards } from "./api.js";
import {
  applyFirstLookupToItem,
  filterByImage,
  lookupCardsWithFallbacks,
  needsImageEnrich,
  sortBankItems,
  stripBracketTerms,
} from "./bankEnrich.js";

const lookupMock = vi.mocked(lookupCards);

function item(partial: Partial<BankItem> & Pick<BankItem, "id" | "name">): BankItem {
  return {
    game: "pokemon",
    have: true,
    want: false,
    set: "",
    number: "",
    artist: null,
    evolutionLine: null,
    collection: null,
    tags: [],
    image: null,
    note: "",
    apiId: null,
    appliesToGame: null,
    maker: null,
    year: null,
    language: null,
    condition: null,
    ...partial,
  };
}

const tcg: TcgCard = {
  id: "base1-58",
  name: "Pikachu",
  number: "58",
  setName: "Base",
  imageSmall: "https://images.pokemontcg.io/base1/58.png",
  artist: "Mitsuhiro Arita",
  evolvesFrom: null,
  evolvesTo: ["Raichu"],
};

describe("stripBracketTerms", () => {
  it("removes bracket segments", () => {
    expect(stripBracketTerms("Archeops [Fossil Museum Exclusive]")).toBe("Archeops");
    expect(stripBracketTerms("Sylveon [Holo] #keep")).toBe("Sylveon #keep");
    expect(stripBracketTerms("Plain Name")).toBe("Plain Name");
  });
});

describe("lookupCardsWithFallbacks", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("returns first results when non-empty", async () => {
    lookupMock.mockResolvedValueOnce([tcg]);
    const out = await lookupCardsWithFallbacks({ name: "Pikachu [Holo]", number: "58", set: "Base" });
    expect(out).toEqual([tcg]);
    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect(lookupMock).toHaveBeenCalledWith("Pikachu [Holo]", "58", "Base");
  });

  it("retries without brackets when first call is empty", async () => {
    lookupMock.mockResolvedValueOnce([]).mockResolvedValueOnce([tcg]);
    const out = await lookupCardsWithFallbacks({
      name: "Archeops [Fossil Museum Exclusive]",
      number: "51",
      set: "Promo",
    });
    expect(out).toEqual([tcg]);
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(lookupMock).toHaveBeenNthCalledWith(1, "Archeops [Fossil Museum Exclusive]", "51", "Promo");
    expect(lookupMock).toHaveBeenNthCalledWith(2, "Archeops", "51", "Promo");
  });

  it("retries without set when strip+set is still empty (Promo / Vaporeon)", async () => {
    lookupMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([tcg]);
    const out = await lookupCardsWithFallbacks({
      name: "Vaporeon [Cosmos Holo]",
      number: "168",
      set: "Promo",
    });
    expect(out).toEqual([tcg]);
    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(lookupMock).toHaveBeenNthCalledWith(1, "Vaporeon [Cosmos Holo]", "168", "Promo");
    expect(lookupMock).toHaveBeenNthCalledWith(2, "Vaporeon", "168", "Promo");
    expect(lookupMock).toHaveBeenNthCalledWith(3, "Vaporeon", "168", "");
  });

  it("retries without set when name has no brackets but set misses", async () => {
    lookupMock.mockResolvedValueOnce([]).mockResolvedValueOnce([tcg]);
    const out = await lookupCardsWithFallbacks({ name: "Archeops", number: "51", set: "Promo" });
    expect(out).toEqual([tcg]);
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(lookupMock).toHaveBeenNthCalledWith(1, "Archeops", "51", "Promo");
    expect(lookupMock).toHaveBeenNthCalledWith(2, "Archeops", "51", "");
  });

  it("does not retry without set when no set was given", async () => {
    lookupMock.mockResolvedValueOnce([]);
    const out = await lookupCardsWithFallbacks({ name: "Archeops", number: "51" });
    expect(out).toEqual([]);
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows errors without retrying", async () => {
    lookupMock.mockRejectedValueOnce(new Error("upstream down"));
    await expect(lookupCardsWithFallbacks({ name: "Pikachu [Holo]" })).rejects.toThrow("upstream down");
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });
});

describe("applyFirstLookupToItem", () => {
  it("fills image and empty fields from the first match", () => {
    const patch = applyFirstLookupToItem(item({ id: "1", name: "Pikachu" }), tcg);
    expect(patch.image).toBe(tcg.imageSmall);
    expect(patch.apiId).toBe("base1-58");
    expect(patch.set).toBe("Base");
    expect(patch.number).toBe("58");
    expect(patch.artist).toBe("Mitsuhiro Arita");
    expect(patch.evolutionLine).toBe("Pikachu");
  });

  it("does not overwrite non-empty fields other than filling missing image", () => {
    const existing = item({
      id: "1",
      name: "Pikachu",
      set: "Jungle",
      number: "60",
      artist: "Someone",
      evolutionLine: "Pichu",
      apiId: "keep-me",
      image: null,
    });
    const patch = applyFirstLookupToItem(existing, tcg);
    expect(patch.image).toBe(tcg.imageSmall);
    expect(patch.set).toBe("Jungle");
    expect(patch.number).toBe("60");
    expect(patch.artist).toBe("Someone");
    expect(patch.evolutionLine).toBe("Pichu");
    expect(patch.apiId).toBe("keep-me");
  });
});

describe("filterByImage / sortBankItems", () => {
  const sample = [
    item({ id: "1", name: "Zapdos", set: "Base", number: "16", artist: "Ken", image: "https://x" }),
    item({ id: "2", name: "Abra", set: "Base", number: "43", artist: null, image: null }),
    item({ id: "3", name: "Mew", set: "Promo", number: "SWSH050", artist: "Ann", image: "" }),
  ];

  it("filters with/without pictures", () => {
    expect(filterByImage(sample, "with").map((i) => i.id)).toEqual(["1"]);
    expect(filterByImage(sample, "without").map((i) => i.id).sort()).toEqual(["2", "3"]);
    expect(filterByImage(sample, "all")).toHaveLength(3);
  });

  it("sorts by name ascending", () => {
    expect(sortBankItems(sample, "name", "asc").map((i) => i.name)).toEqual(["Abra", "Mew", "Zapdos"]);
  });

  it("sorts numbers with mixed alphanumeric", () => {
    const nums = [
      item({ id: "a", name: "A", number: "10" }),
      item({ id: "b", name: "B", number: "2" }),
      item({ id: "c", name: "C", number: "SWSH050" }),
    ];
    expect(sortBankItems(nums, "number", "asc").map((i) => i.number)).toEqual(["2", "10", "SWSH050"]);
  });

  it("needsImageEnrich is true only when image is empty", () => {
    expect(needsImageEnrich(item({ id: "1", name: "A", image: null }))).toBe(true);
    expect(needsImageEnrich(item({ id: "2", name: "B", image: "" }))).toBe(true);
    expect(needsImageEnrich(item({ id: "3", name: "C", image: "https://x" }))).toBe(false);
  });
});

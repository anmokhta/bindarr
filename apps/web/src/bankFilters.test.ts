import { describe, expect, it } from "vitest";
import { emptyFilters, filterBankItems, type BankFilters } from "./components/BankPicker.js";
import type { BankItem } from "@bindarr/shared";

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
    createdAt: null,
    ...partial,
  };
}

describe("filterBankItems multi-select", () => {
  const items = [
    item({ id: "1", name: "Pikachu", set: "Base", artist: "Arita", tags: ["electric"] }),
    item({ id: "2", name: "Eevee", set: "SVP", artist: "Tami", tags: ["normal", "cute"] }),
    item({ id: "3", name: "Raikou", set: "Vivid Voltage", artist: "Arita", tags: ["electric"] }),
  ];

  it("empty facets match all", () => {
    expect(filterBankItems(items, emptyFilters)).toHaveLength(3);
  });

  it("ORs within a facet and ANDs across facets", () => {
    const f: BankFilters = { ...emptyFilters, artist: ["Arita", "Tami"], tag: ["electric"] };
    const out = filterBankItems(items, f);
    expect(out.map((i) => i.id).sort()).toEqual(["1", "3"]);
  });

  it("filters sets with multiple values", () => {
    const f: BankFilters = { ...emptyFilters, set: ["Base", "SVP"] };
    expect(filterBankItems(items, f).map((i) => i.id).sort()).toEqual(["1", "2"]);
  });
});

describe("filterBankItems include evolutions", () => {
  const items = [
    item({ id: "eevee", name: "Eevee", set: "SVP", evolutionLine: "Eevee" }),
    item({ id: "vape", name: "Dark Vaporeon", set: "Team Rocket", evolutionLine: "Eevee" }),
    item({ id: "jolteon", name: "Jolteon", set: "Jungle", evolutionLine: "Eevee" }),
    item({ id: "pika", name: "Pikachu", set: "Base", evolutionLine: "Pichu" }),
  ];

  it("default search ignores evolutionLine (only Eevee)", () => {
    const f: BankFilters = { ...emptyFilters, query: "eevee" };
    expect(filterBankItems(items, f).map((i) => i.id)).toEqual(["eevee"]);
  });

  it("include evolutions adds related cards", () => {
    const f: BankFilters = { ...emptyFilters, query: "eevee", includeEvolutions: true };
    expect(filterBankItems(items, f).map((i) => i.id).sort()).toEqual(["eevee", "jolteon", "vape"]);
  });

  it("name match still finds the named card", () => {
    const f: BankFilters = { ...emptyFilters, query: "vaporeon" };
    expect(filterBankItems(items, f).map((i) => i.id)).toEqual(["vape"]);
  });

  it("evolution-line facet still matches exact evolutionLine including Eevee itself", () => {
    const f: BankFilters = { ...emptyFilters, evolutionLine: ["Eevee"] };
    expect(filterBankItems(items, f).map((i) => i.id).sort()).toEqual(["eevee", "jolteon", "vape"]);
  });
});

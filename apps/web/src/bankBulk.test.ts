import { describe, expect, it } from "vitest";
import type { BankItem } from "@bindarr/shared";
import { addTags, parseTagList, removeTags, setCollection } from "./bankBulk.js";

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

describe("bankBulk helpers", () => {
  it("parseTagList splits and trims", () => {
    expect(parseTagList(" a, b ,a, ")).toEqual(["a", "b"]);
  });

  it("addTags merges unique tags case-insensitively", () => {
    const base = item({ id: "1", name: "Eevee", tags: ["Cute"] });
    expect(addTags(base, ["cute", "Promo"]).tags).toEqual(["Cute", "Promo"]);
  });

  it("removeTags strips listed tags", () => {
    const base = item({ id: "1", name: "Eevee", tags: ["Cute", "Promo"] });
    expect(removeTags(base, ["cute"]).tags).toEqual(["Promo"]);
  });

  it("setCollection sets or clears", () => {
    const base = item({ id: "1", name: "Eevee", collection: "Binder A" });
    expect(setCollection(base, "Binder B").collection).toBe("Binder B");
    expect(setCollection(base, "  ").collection).toBeNull();
    expect(setCollection(base, null).collection).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeCardLookupName,
  parseBankImportCsv,
  parsePriceChartingProductName,
  parsePriceChartingSet,
} from "./bankImport.js";

const HEADER =
  "id,product-name,console-name,price-in-pennies,include-string,condition-string,condition-id,sku,notes,cost-basis-in-pennies,quantity,date-entered,date-purchased,grading-company,grading-cert-id,folder";

describe("parsePriceChartingProductName", () => {
  it("splits plain number", () => {
    expect(parsePriceChartingProductName("Jolteon #20")).toEqual({ name: "Jolteon", number: "20" });
  });

  it("keeps promo-style numbers", () => {
    expect(parsePriceChartingProductName("Charizard V #SWSH050")).toEqual({
      name: "Charizard V",
      number: "SWSH050",
    });
  });

  it("keeps bracket variants in the name", () => {
    expect(parsePriceChartingProductName("Sylveon [Holo] #35")).toEqual({
      name: "Sylveon [Holo]",
      number: "35",
    });
    expect(parsePriceChartingProductName("Bayleef [1st Edition] #28")).toEqual({
      name: "Bayleef [1st Edition]",
      number: "28",
    });
  });
});

describe("normalizeCardLookupName", () => {
  it("normalizes LV.X spacing, Ex, and Kilowattrel typo", () => {
    expect(normalizeCardLookupName("Palkia G LV. X")).toBe("Palkia G LV.X");
    expect(normalizeCardLookupName("Flareon Ex")).toBe("Flareon ex");
    expect(normalizeCardLookupName("Iono's Killowattrel")).toBe("Iono's Kilowattrel");
  });
});

describe("parsePriceChartingSet", () => {
  it("strips Pokemon and Japanese prefixes", () => {
    expect(parsePriceChartingSet("Pokemon Jungle")).toBe("Jungle");
    expect(parsePriceChartingSet("Pokemon Japanese Terastal Festival")).toBe("Terastal Festival");
    expect(parsePriceChartingSet("Pokemon Scarlet & Violet 151")).toBe("Scarlet & Violet 151");
  });
});

describe("parseBankImportCsv PriceCharting", () => {
  it("maps collection rows into bank items", () => {
    const csv = [
      HEADER,
      "1099560,Jolteon #20,Pokemon Jungle,1000,Ungraded,Normal wear,1,,,0,1,2026-09-23,,,,",
      "1368342,Charizard V #SWSH050,Pokemon Promo,1518,Ungraded,Normal wear,1,,,0,1,2026-09-23,,,,",
      "3666999,Sylveon [Holo] #35,Pokemon Go,147,Ungraded,Normal wear,1,,,176,1,2026-09-23,,,,",
      "7980672,Flareon Ex #22,Pokemon Japanese Terastal Festival,243,Ungraded,Normal wear,1,,,0,1,2025-11-15,,,,",
      '5834844,Pikachu with Grey Felt Hat #85,Pokemon Promo,82320,Graded 8,Normal wear,2,,8.5 Beckett,59353,1,2026-09-07,2025-11-06,Beckett,,',
      "3667098,Eevee [Reverse Holo] #54,Pokemon Go,368,Ungraded,Normal wear,1,,,0,2,2026-09-23,,,,",
    ].join("\n");

    const { format, items } = parseBankImportCsv(csv, "pokemon");
    expect(format).toBe("pricecharting");
    expect(items).toHaveLength(6);

    expect(items[0]).toMatchObject({
      game: "pokemon",
      name: "Jolteon",
      set: "Jungle",
      number: "20",
      have: true,
      want: false,
      language: null,
    });
    expect(String(items[0].note)).toContain("Ungraded");

    expect(items[1]).toMatchObject({ name: "Charizard V", set: "Promo", number: "SWSH050" });
    expect(items[2]).toMatchObject({ name: "Sylveon [Holo]", set: "Go", number: "35" });
    expect(items[3]).toMatchObject({
      name: "Flareon ex",
      set: "Terastal Festival",
      number: "22",
      language: "ja",
    });

    expect(items[4]).toMatchObject({
      name: "Pikachu with Grey Felt Hat",
      set: "Promo",
      number: "85",
      have: true,
    });
    expect(String(items[4].note)).toMatch(/Graded 8/);
    expect(String(items[4].note)).toMatch(/Beckett/);

    expect(items[5]).toMatchObject({ name: "Eevee [Reverse Holo]", number: "54" });
    expect(String(items[5].note)).toMatch(/qty 2/);
  });

  it("marks Japanese console rows and normalizes LV.X / typos", () => {
    const csv = [
      HEADER,
      "1,Prime Catcher #62,Pokemon Japanese Cyber Judge,100,Ungraded,Normal wear,1,,,0,1,2026-09-23,,,,",
      "2,Gliscor LV. X #141,Pokemon Legends Awakened,100,Ungraded,Normal wear,1,,,0,1,2026-09-23,,,,",
      "3,Iono's Killowattrel #104,Pokemon Japanese Battle Partners,100,Ungraded,Normal wear,1,,,0,1,2026-09-23,,,,",
    ].join("\n");
    const { items } = parseBankImportCsv(csv, "pokemon");
    expect(items[0]).toMatchObject({
      name: "Prime Catcher",
      set: "Cyber Judge",
      number: "62",
      language: "ja",
    });
    expect(items[1]).toMatchObject({
      name: "Gliscor LV.X",
      set: "Legends Awakened",
      number: "141",
      language: null,
    });
    expect(items[2]).toMatchObject({
      name: "Iono's Kilowattrel",
      set: "Battle Partners",
      number: "104",
      language: "ja",
    });
  });

  it("still parses Bindarr-native CSV", () => {
    const csv = [
      "name,set,number,artist,have,want",
      "Pikachu,Base,58,Arita,true,false",
    ].join("\n");
    const { format, items } = parseBankImportCsv(csv, "pokemon");
    expect(format).toBe("bindarr");
    expect(items).toEqual([
      expect.objectContaining({
        name: "Pikachu",
        set: "Base",
        number: "58",
        artist: "Arita",
        have: true,
        want: false,
      }),
    ]);
  });
});

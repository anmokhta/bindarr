import { describe, expect, it } from "vitest";
import { isPokemontcgImageUrl, isTcgdexImageUrl, mapTcgdexCard } from "./tcgdex-client.js";

describe("tcgdex-client helpers", () => {
  it("maps brief + detail into TcgCardResult", () => {
    const card = mapTcgdexCard(
      { id: "base1-58", localId: "58", name: "Pikachu", image: "https://assets.tcgdex.net/en/base1/58" },
      {
        id: "base1-58",
        localId: "58",
        name: "Pikachu",
        image: "https://assets.tcgdex.net/en/base1/58",
        illustrator: "Mitsuhiro Arita",
        set: { name: "Base" },
        evolveTo: ["Raichu"],
      },
    );
    expect(card).toEqual({
      id: "base1-58",
      name: "Pikachu",
      number: "58",
      setName: "Base",
      imageSmall: "https://assets.tcgdex.net/en/base1/58/low.webp",
      artist: "Mitsuhiro Arita",
      evolvesFrom: null,
      evolvesTo: ["Raichu"],
    });
  });

  it("detects pokemontcg vs tcgdex image hosts", () => {
    expect(isPokemontcgImageUrl("https://images.pokemontcg.io/base1/58.png")).toBe(true);
    expect(isPokemontcgImageUrl("https://assets.tcgdex.net/en/base1/58/low.webp")).toBe(false);
    expect(isTcgdexImageUrl("https://assets.tcgdex.net/en/base1/58/low.webp")).toBe(true);
    expect(isTcgdexImageUrl("https://images.pokemontcg.io/base1/58.png")).toBe(false);
    expect(isPokemontcgImageUrl(null)).toBe(false);
  });
});

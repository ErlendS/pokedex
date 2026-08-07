import { describe, expect, it } from "vitest";
import { formatPokemonName, getPokemonQueryFromScan, getShinySpriteUrl, normalizePokemonName } from "./pokemon";

describe("Pokemon utilities", () => {
  it("accepts direct and PokeAPI scan values", () => {
    expect(getPokemonQueryFromScan(" Pokemon:Mr-Mime ")).toBe("mr-mime");
    expect(getPokemonQueryFromScan("https://pokeapi.co/api/v2/pokemon/25/")).toBe("25");
    expect(getPokemonQueryFromScan("https://example.com/api/v2/pokemon/25")).toBeNull();
  });

  it("normalizes and formats Pokemon names", () => {
    expect(normalizePokemonName("Mr. Mime")).toBe("mrmime");
    expect(formatPokemonName("mr-mime")).toBe("Mr Mime");
  });

  it("generates the expected shiny sprite path", () => {
    expect(getShinySpriteUrl(25)).toContain("/shiny/25.png");
  });
});

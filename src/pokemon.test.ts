import { describe, expect, it } from "vitest";
import { formatPokemonName, getAnimatedShinySpriteUrl, getAnimatedSpriteUrl, getNameSimilarity, getPokemonQueryFromScan, getShinySpriteUrl, getSpriteUrl, normalizePokemonName } from "./pokemon";

describe("Pokemon utilities", () => {
  it("accepts direct and PokeAPI scan values", () => {
    expect(getPokemonQueryFromScan(" Pokemon:Mr-Mime ")).toBe("mr-mime");
    expect(getPokemonQueryFromScan("https://pokeapi.co/api/v2/pokemon/25/")).toBe("25");
    expect(getPokemonQueryFromScan("https://example.com/api/v2/pokemon/25")).toBeNull();
    expect(getPokemonQueryFromScan("%")).toBeNull();
  });

  it("normalizes and formats Pokemon names", () => {
    expect(normalizePokemonName("Mr. Mime")).toBe("mrmime");
    expect(formatPokemonName("mr-mime")).toBe("Mr Mime");
  });

  it("generates the expected sprite paths", () => {
    expect(getSpriteUrl(25)).toContain("/25.png");
    expect(getAnimatedSpriteUrl(25)).toContain("/25.gif");
    expect(getShinySpriteUrl(25)).toContain("/shiny/25.png");
    expect(getAnimatedShinySpriteUrl(25)).toContain("/shiny/25.gif");
  });

  it("scores name similarity for fuzzy guess matching", () => {
    expect(getNameSimilarity("pikachu", "pikachu")).toBe(1);
    expect(getNameSimilarity("", "")).toBe(1);
    expect(getNameSimilarity("charizard", "charlzard")).toBeGreaterThanOrEqual(0.85);
    expect(getNameSimilarity("pikachu", "pikahcu")).toBeGreaterThanOrEqual(0.7);
    expect(getNameSimilarity("pikachu", "bulbasaur")).toBeLessThan(0.5);
  });
});

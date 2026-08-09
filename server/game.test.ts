import { describe, expect, it } from "vitest";
import {
  calculatePoints,
  createRoomCode,
  DEFAULT_VERSUS_GENERATIONS,
  DEFAULT_REVEAL_DURATION_MS,
  DEFAULT_ROUND_DURATION_MS,
  normalizeGuess,
  normalizeGenerationIds,
  pickPokemonIdForGenerations,
  serializeRound,
} from "./game.mjs";

describe("versus game rules", () => {
  it("creates a readable five-character room code", () => {
    expect(createRoomCode(new Set(), () => 0)).toBe("AAAAA");
  });

  it("normalizes guesses consistently", () => {
    expect(normalizeGuess("Mr. Mímé")).toBe("mrmime");
  });

  it("rewards fast answers and keeps a points floor", () => {
    expect(calculatePoints(1, 500)).toBe(95);
    expect(calculatePoints(8, 120_000)).toBe(20);
  });

  it("uses a 30 second round and a 15 second answer reveal", () => {
    expect(DEFAULT_ROUND_DURATION_MS).toBe(30_000);
    expect(DEFAULT_REVEAL_DURATION_MS).toBe(15_000);
  });

  it("normalizes the host generation selection and preserves at least one generation", () => {
    expect(normalizeGenerationIds([9, 3, 3, 100, "2"])).toEqual([3, 9]);
    expect(normalizeGenerationIds([])).toEqual(DEFAULT_VERSUS_GENERATIONS);
  });

  it("picks Pokémon only from the selected generations", () => {
    expect(pickPokemonIdForGenerations([3], () => 0)).toBe(252);
    expect(pickPokemonIdForGenerations([3], () => 0.9999)).toBe(386);
    expect(pickPokemonIdForGenerations([1, 9], () => 0.9999)).toBe(1025);
  });

  it("withholds Pokémon visuals and answers from phone controllers", () => {
    const round = {
      number: 2,
      startedAt: 1_000,
      endsAt: 31_000,
      status: "revealed",
      spriteUrl: "https://example.test/pikachu.png",
      typeNames: ["electric"],
      revealedAt: 31_000,
      revealUntil: 46_000,
      pokemonName: "pikachu",
    };

    expect(serializeRound(round)).toMatchObject({
      spriteUrl: round.spriteUrl,
      typeNames: ["electric"],
      answer: "pikachu",
    });
    expect(serializeRound(round, { controller: true })).toMatchObject({
      number: 2,
      spriteUrl: null,
      typeNames: [],
      answer: null,
    });
  });
});

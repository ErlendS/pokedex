import { describe, expect, it } from "vitest";
import {
  LEGENDARY_SKIN_COST,
  POKEDEX_SKIN_BY_ID,
  POKEDEX_SKINS,
  SKIN_PURCHASE_COSTS,
} from "./skins";

describe("Pokedex skin catalog", () => {
  it("has a stable catalog with a lookup entry for every skin", () => {
    expect(POKEDEX_SKINS).toHaveLength(204);
    expect(POKEDEX_SKIN_BY_ID.size).toBe(POKEDEX_SKINS.length);
    expect(POKEDEX_SKIN_BY_ID.get("classic")?.label).toBe("Classic Red");
  });

  it("makes every legendary skin discoverable as a flame or flower skin", () => {
    const legendarySkins = POKEDEX_SKINS.filter((skin) => skin.rarity === "Legendary");
    expect(legendarySkins).toHaveLength(20);
    expect(legendarySkins.filter((skin) => skin.legendaryEffect === "Flame")).toHaveLength(10);
    expect(legendarySkins.filter((skin) => skin.legendaryEffect === "Flower")).toHaveLength(10);
    expect(legendarySkins.every((skin) => skin.label.includes("Legendary"))).toBe(true);
  });

  it("uses the published rarity prices", () => {
    expect(SKIN_PURCHASE_COSTS.Legendary).toBe(LEGENDARY_SKIN_COST);
    expect(SKIN_PURCHASE_COSTS.Common).toBeLessThan(SKIN_PURCHASE_COSTS.Rare);
    expect(SKIN_PURCHASE_COSTS.Rare).toBeLessThan(SKIN_PURCHASE_COSTS.Unique);
    expect(SKIN_PURCHASE_COSTS.Unique).toBeLessThan(SKIN_PURCHASE_COSTS.Legendary);
  });
});

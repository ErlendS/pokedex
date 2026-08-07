export type SkinRarity = "Common" | "Rare" | "Unique" | "Legendary";
export type PokedexSkinId = string;

export type PokedexSkin = {
  id: PokedexSkinId;
  label: string;
  rarity: SkinRarity;
  weight: number;
  hue: number;
  saturation: number;
  lightness: number;
  metalness: number;
  roughness: number;
  legendaryEffect?: "Flame" | "Flower";
};

export const LEGENDARY_SKIN_COST = 1_000;

const rarityTraits: Record<SkinRarity, Pick<PokedexSkin, "weight" | "metalness" | "roughness">> = {
  Common: { weight: 55, metalness: 0.1, roughness: 0.44 },
  Rare: { weight: 25, metalness: 0.28, roughness: 0.3 },
  Unique: { weight: 8, metalness: 0.5, roughness: 0.22 },
  Legendary: { weight: 2, metalness: 0.78, roughness: 0.16 },
};

export const SKIN_PURCHASE_COSTS: Record<SkinRarity, number> = {
  Common: 250,
  Rare: 500,
  Unique: 750,
  Legendary: LEGENDARY_SKIN_COST,
};

const themes = [
  { name: "Crimson", hue: 358, saturation: 92, lightness: 38 }, { name: "Cobalt", hue: 216, saturation: 80, lightness: 38 },
  { name: "Verdant", hue: 132, saturation: 67, lightness: 30 }, { name: "Solar", hue: 43, saturation: 92, lightness: 43 },
  { name: "Violet", hue: 271, saturation: 76, lightness: 42 }, { name: "Coral", hue: 11, saturation: 86, lightness: 48 },
  { name: "Arctic", hue: 195, saturation: 80, lightness: 54 }, { name: "Obsidian", hue: 230, saturation: 28, lightness: 16 },
  { name: "Flower", hue: 329, saturation: 76, lightness: 50 }, { name: "Lightning", hue: 52, saturation: 96, lightness: 46 },
  { name: "Flame", hue: 12, saturation: 94, lightness: 45 }, { name: "Ultraviolet", hue: 290, saturation: 88, lightness: 43 },
];
const forms = ["Scout", "Ranger", "Circuit", "Aurora", "Comet", "Bloom", "Tide", "Ember", "Prism", "Phantom", "Relic", "Crown", "Nova", "Cipher", "Voyager", "Pulse", "Meteor"];
const rarities: SkinRarity[] = ["Common", "Common", "Common", "Common", "Rare", "Rare", "Rare", "Unique", "Unique", "Legendary"];

export const POKEDEX_SKINS: PokedexSkin[] = Array.from({ length: 204 }, (_, index) => {
  const theme = themes[index % themes.length];
  const form = forms[Math.floor(index / themes.length) % forms.length];
  const rarity = rarities[index % rarities.length];
  const legendaryEffect = rarity === "Legendary" ? (Math.floor(index / rarities.length) % 2 === 0 ? "Flame" : "Flower") : undefined;
  return {
    id: index === 0 ? "classic" : index === 1 ? "midnight" : `skin-${index + 1}`,
    label: index === 0 ? "Classic Red" : index === 1 ? "Midnight" : legendaryEffect ? `${legendaryEffect} Legendary ${form}` : `${theme.name} ${form}`,
    rarity,
    weight: rarityTraits[rarity].weight,
    hue: theme.hue,
    saturation: theme.saturation,
    lightness: Math.min(70, theme.lightness + (Math.floor(index / themes.length) % 3) * 5),
    metalness: rarityTraits[rarity].metalness,
    roughness: rarityTraits[rarity].roughness,
    legendaryEffect,
  };
});

export const POKEDEX_SKIN_BY_ID = new Map(POKEDEX_SKINS.map((skin) => [skin.id, skin]));

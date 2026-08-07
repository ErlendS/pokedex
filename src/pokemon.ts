const SPRITE_BASE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const ANIMATED_SPRITE_BASE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated";
const SCAN_VALUE = /^(?:pokemon:)?([a-z0-9][a-z0-9-]{0,39})$/i;

export function getPokemonQueryFromScan(rawValue: string) {
  const value = rawValue.trim();
  const directMatch = value.match(SCAN_VALUE);
  if (directMatch) return directMatch[1].toLowerCase();
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/^\/api\/v2\/pokemon\/([^/]+)\/?$/i);
    if (url.hostname === "pokeapi.co" && pathMatch) {
      const decodedValue = decodeURIComponent(pathMatch[1]);
      const urlMatch = decodedValue.match(SCAN_VALUE);
      return urlMatch ? urlMatch[1].toLowerCase() : null;
    }
  } catch {
    // Not a URL; the direct identifier check above already ran.
  }
  return null;
}

export const getSpriteUrl = (pokemonId: number) => `${SPRITE_BASE_URL}/${pokemonId}.png`;
export const getAnimatedSpriteUrl = (pokemonId: number) => `${ANIMATED_SPRITE_BASE_URL}/${pokemonId}.gif`;
export const getShinySpriteUrl = (pokemonId: number) => `${SPRITE_BASE_URL}/shiny/${pokemonId}.png`;
export const getAnimatedShinySpriteUrl = (pokemonId: number) => `${ANIMATED_SPRITE_BASE_URL}/shiny/${pokemonId}.gif`;

export function normalizePokemonName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatPokemonName(name: string) {
  return name.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

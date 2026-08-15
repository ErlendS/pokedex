export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DEFAULT_ROUND_DURATION_MS = 30_000;
export const DEFAULT_REVEAL_DURATION_MS = 15_000;
export const DEFAULT_VERSUS_GENERATIONS = [1, 2];
export const POKEMON_GENERATIONS = [
  { id: 1, start: 1, end: 151 },
  { id: 2, start: 152, end: 251 },
  { id: 3, start: 252, end: 386 },
  { id: 4, start: 387, end: 493 },
  { id: 5, start: 494, end: 649 },
  { id: 6, start: 650, end: 721 },
  { id: 7, start: 722, end: 809 },
  { id: 8, start: 810, end: 905 },
  { id: 9, start: 906, end: 1025 },
];

export function createRoomCode(existingCodes, random = Math.random) {
  let code;
  do code = Array.from({ length: 5 }, () => ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)]).join("");
  while (existingCodes.has(code));
  return code;
}

export function normalizeGuess(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function calculatePoints(correctPosition, elapsedMilliseconds) {
  return Math.max(20, 110 - correctPosition * 15 - Math.floor(elapsedMilliseconds / 1000) * 2);
}

export function normalizeGenerationIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_VERSUS_GENERATIONS];
  const validIds = new Set(POKEMON_GENERATIONS.map(({ id }) => id));
  const normalized = [...new Set(value.filter((id) => Number.isInteger(id) && validIds.has(id)))].sort((a, b) => a - b);
  return normalized.length > 0 ? normalized : [...DEFAULT_VERSUS_GENERATIONS];
}

export function pickPokemonIdForGenerations(generationIds, random = Math.random) {
  const normalized = normalizeGenerationIds(generationIds);
  const selected = POKEMON_GENERATIONS.filter(({ id }) => normalized.includes(id));
  const totalPokemon = selected.reduce((total, generation) => total + generation.end - generation.start + 1, 0);
  let offset = Math.min(totalPokemon - 1, Math.floor(random() * totalPokemon));
  for (const generation of selected) {
    const size = generation.end - generation.start + 1;
    if (offset < size) return generation.start + offset;
    offset -= size;
  }
  return selected[0].start;
}

export function serializeRound(round) {
  if (!round) return null;
  return {
    number: round.number,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    status: round.status,
    spriteUrl: round.spriteUrl,
    typeNames: round.typeNames,
    revealedAt: round.revealedAt ?? null,
    revealUntil: round.revealUntil ?? null,
    answer: round.status === "revealed" ? round.pokemonName : null,
  };
}

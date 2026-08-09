export const CAST_NAMESPACE = "urn:x-cast:tech.flawed.pokedex.versus";
export const VERSUS_GENERATIONS = [
  { id: 1, label: "Generation I" },
  { id: 2, label: "Generation II" },
  { id: 3, label: "Generation III" },
  { id: 4, label: "Generation IV" },
  { id: 5, label: "Generation V" },
  { id: 6, label: "Generation VI" },
  { id: 7, label: "Generation VII" },
  { id: 8, label: "Generation VIII" },
  { id: 9, label: "Generation IX" },
] as const;
export const DEFAULT_VERSUS_GENERATIONS = [1, 2];

export type VersusPlayer = { id: string; name: string; score: number };

export type VersusRound = {
  number: number;
  startedAt: number;
  endsAt: number;
  status: "active" | "revealed";
  spriteUrl: string | null;
  typeNames: string[];
  revealedAt: number | null;
  revealUntil: number | null;
  answer: string | null;
};

export type VersusServerMessage =
  | { type: "host:created"; code: string; playerId: string | null }
  | { type: "player:joined"; code: string; playerId: string }
  | { type: "display:joined"; code: string }
  | { type: "room:state"; code: string; players: VersusPlayer[]; round: VersusRound | null }
  | ({ type: "round:started"; cryUrl: string | null } & VersusRound)
  | ({ type: "round:revealed" } & VersusRound)
  | { type: "round:answer"; playerId: string; name: string; points: number }
  | { type: "guess:result"; correct: boolean; points?: number }
  | { type: "room:closed" }
  | { type: "error"; message: string };

export type VersusRoundVisual = {
  spriteUrl: string;
  typeNames: string[];
  concealed: boolean;
};

export function getVersusWebSocketUrl(location: Pick<Location, "protocol" | "host"> = window.location) {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/versus`;
}

export function formatVersusPokemonName(value: string | null) {
  return value
    ? value.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")
    : "Unknown Pokémon";
}

export function createVersusJoinUrl(code: string, location: Pick<Location, "origin" | "pathname"> = window.location) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("versus", code);
  return url.toString();
}

/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { Cloud, Html, OrbitControls, Sky, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import {
  LEGENDARY_SKIN_COST,
  POKEDEX_SKIN_BY_ID,
  POKEDEX_SKINS,
  SKIN_PURCHASE_COSTS,
  type PokedexSkin,
  type PokedexSkinId,
} from "./skins";
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector3,
} from "three";
import "./App.css";

type Pokemon = {
  id: number;
  name: string;
  types: Array<{
    slot: number;
    type: { name: string };
  }>;
  cries: {
    latest: string | null;
    legacy: string | null;
  };
  species: {
    name: string;
    url: string;
  };
};

type FlavorTextEntry = {
  flavor_text: string;
  language: {
    name: string;
  };
};

type PokemonSpecies = {
  flavor_text_entries: FlavorTextEntry[];
  habitat: { name: string } | null;
};

type PokemonDetail = {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: Array<{ slot: number; type: { name: string } }>;
  abilities: Array<{ ability: { name: string }; is_hidden: boolean }>;
  moves: Array<{ move: { name: string } }>;
  species: { url: string };
};

type PokemonDetailSpecies = {
  evolution_chain: { url: string };
};

type EvolutionChainNode = {
  species: { name: string };
  evolves_to: EvolutionChainNode[];
};

type EvolutionChain = {
  chain: EvolutionChainNode;
};

type PokemonState =
  | { status: "loading"; pokemon: null; error: ""; query: "" }
  | {
      status: "ready";
      pokemon: Pokemon;
      flavorText: string;
      habitat: string;
      error: "";
      query: string;
    }
  | { status: "error"; pokemon: null; error: string; query: "" };

type AppMode = "lookup" | "game";
type RoundResult = "guessing" | "correct" | "incorrect" | "timed-out";
type GameStats = {
  score: number;
  streak: number;
  correctAnswers: number;
};

type PokemonIndexEntry = {
  name: string;
  url: string;
};

type VoicePokemonCandidate = PokemonIndexEntry & {
  id: number;
};

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

type YouTubePlayer = {
  getIframe: () => HTMLIFrameElement;
  loadVideoById: (video: {
    videoId: string;
    startSeconds: number;
    endSeconds: number;
  }) => void;
  playVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
};

type YouTubePlayerEvent = {
  data: number;
};

type YouTubePlayerConstructor = new (
  elementId: string,
  options: {
    videoId: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: () => void;
      onStateChange: (event: YouTubePlayerEvent) => void;
      onError: () => void;
    };
  },
) => YouTubePlayer;

type VoiceRecognitionAlternative = {
  transcript: string;
};

type VoiceRecognitionResult = {
  isFinal: boolean;
  0: VoiceRecognitionAlternative;
};

type VoiceRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<VoiceRecognitionResult>;
};

type VoiceRecognitionErrorEvent = {
  error: string;
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
    YT?: {
      Player: YouTubePlayerConstructor;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
  }
}

const INITIAL_QUERY = "25";
const GAME_POKEMON_COUNT = 1_025;
const RECENT_GAME_POKEMON_WINDOW = 25;
const POKEDEX_SCREEN_POSITION: [number, number, number] = [0.053, 0.054, 0.685];
// Keep these references stable: passing fresh camera/target objects on every
// app update makes controls re-apply their defaults after unrelated actions
// such as selecting a generation.
const VIEWER_CAMERA = {
  position: [10.6, 3.15, 10.3] as [number, number, number],
  fov: 58,
};
const VIEWER_ORBIT_TARGET: [number, number, number] = [0, -0.9, -2.8];
const POKEDEX_MODEL_POSITION: [number, number, number] = [0.7, -0.7, 0.35];
const POKEDEX_MODEL_ROTATION_Y = -0.99;
const POKEDEX_MODEL_SCALE = 2.15;
const POKEDEX_CASING_BOUNDS = {
  min: [-0.1763, -1.3027, -1.0062] as [number, number, number],
  max: [0.7556, 1.1967, 1.0458] as [number, number, number],
};
const D_PAD_CENTER = {
  x: 0.078,
  y: -0.648,
  z: 0.345,
};
const D_PAD_SEGMENT_WIDTH = 0.12;
const D_PAD_SEGMENT_HEIGHT = 0.18;
const D_PAD_SEGMENT_TIP_HEIGHT = D_PAD_SEGMENT_HEIGHT * (55 / 167);
const SHOW_D_PAD_DEBUG_OVERLAY = false;
const FLAVOR_TEXT_FALLBACK = "No field notes available.";
const SPRITE_RENDER_SIZE = 96;
const SPRITE_HTML_SCALE = 0.15;
const SPRITE_BASE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const ANIMATED_SPRITE_BASE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated";
const NEXT_ROUND_DELAY_SECONDS = 3;
const ROUND_TIME_LIMIT_SECONDS = 20;
const MAX_ROUND_POINTS = 100;
const MINIMUM_STARTING_SCORE = 500;
const EXTRA_TIME_SECONDS = 5;
const EXTRA_TIME_HINT_COST = 100;
const SKIP_POKEMON_COST = 200;
const CONFETTI_UPGRADE_COST = 250;
const CONFETTI_MAX_LEVEL = 1_000;
const CONFETTI_DURATION_SECONDS = 5;
const NAME_REVEAL_UPGRADE_COST = 150;
const NAME_REVEAL_MAX_LEVEL = 10;
const UNCAUGHT_RADAR_COST = 1_000;
const SHINY_ROUND_CHANCE = 0.2;
const APP_MODE_STORAGE_KEY = "pokedex:mode";
const CAPTURED_POKEMON_STORAGE_KEY = "pokedex:captured-pokemon";
const SHINY_CAPTURED_POKEMON_STORAGE_KEY = "pokedex:shiny-captured-pokemon";
const GAME_GENERATIONS_STORAGE_KEY = "pokedex:game-generations";
const RECENT_GAME_POKEMON_STORAGE_KEY = "pokedex:recent-game-pokemon";
const GAME_SCORE_STORAGE_KEY = "pokedex:score";
const CONFETTI_UPGRADE_STORAGE_KEY = "pokedex:confetti-upgrade";
const NAME_REVEAL_UPGRADE_STORAGE_KEY = "pokedex:name-reveal-upgrade";
const COMPLETED_ROUNDS_STORAGE_KEY = "pokedex:completed-rounds";
const POKEDEX_SKINS_STORAGE_KEY = "pokedex:owned-skins";
const POKEDEX_EQUIPPED_SKIN_STORAGE_KEY = "pokedex:equipped-skin";
const UNCAUGHT_RADAR_STORAGE_KEY = "pokedex:uncaught-radar";
const INTRO_MUTED_STORAGE_KEY = "pokedex:intro-muted";
const COMPANION_POKEMON_STORAGE_KEY = "pokedex:companion-pokemon";
const WHOSE_THAT_POKEMON_VIDEO_ID = "EE-xtCF3T94";
const WHOSE_THAT_POKEMON_INTRO_SECONDS = 5;
const WHOSE_THAT_POKEMON_FALLBACK_MS =
  (WHOSE_THAT_POKEMON_INTRO_SECONDS + 1) * 1_000;

const GAME_GENERATIONS = [
  { id: 1, label: "Gen I", start: 1, end: 151 },
  { id: 2, label: "Gen II", start: 152, end: 251 },
  { id: 3, label: "Gen III", start: 252, end: 386 },
  { id: 4, label: "Gen IV", start: 387, end: 493 },
  { id: 5, label: "Gen V", start: 494, end: 649 },
  { id: 6, label: "Gen VI", start: 650, end: 721 },
  { id: 7, label: "Gen VII", start: 722, end: 809 },
  { id: 8, label: "Gen VIII", start: 810, end: 905 },
  { id: 9, label: "Gen IX", start: 906, end: GAME_POKEMON_COUNT },
] as const;

const DEFAULT_GAME_GENERATIONS = [1, 2];

function getSavedAppMode(): AppMode {
  const savedMode = window.localStorage.getItem(APP_MODE_STORAGE_KEY);

  return savedMode === "game" ? "game" : "lookup";
}

function getSavedGameScore() {
  const savedScore = Number(window.localStorage.getItem(GAME_SCORE_STORAGE_KEY));

  return Number.isFinite(savedScore)
    ? Math.max(MINIMUM_STARTING_SCORE, Math.floor(savedScore))
    : MINIMUM_STARTING_SCORE;
}

function getSavedConfettiLevel() {
  const savedValue = window.localStorage.getItem(CONFETTI_UPGRADE_STORAGE_KEY);

  // Migrate the original boolean upgrade into the first level.
  if (savedValue === "true") {
    return 1;
  }

  const savedLevel = Number(savedValue);
  return Number.isFinite(savedLevel)
    ? Math.min(CONFETTI_MAX_LEVEL, Math.max(0, Math.floor(savedLevel)))
    : 0;
}

function getSavedNameRevealLevel() {
  const savedLevel = Number(window.localStorage.getItem(NAME_REVEAL_UPGRADE_STORAGE_KEY));
  return Number.isFinite(savedLevel)
    ? Math.min(NAME_REVEAL_MAX_LEVEL, Math.max(0, Math.floor(savedLevel)))
    : 0;
}

function getSavedCompletedRounds() {
  const savedRounds = Number(window.localStorage.getItem(COMPLETED_ROUNDS_STORAGE_KEY));
  return Number.isInteger(savedRounds) && savedRounds >= 0 ? savedRounds : 0;
}
function getSavedOwnedSkins(): Set<PokedexSkinId> {
  try { const parsed: unknown = JSON.parse(window.localStorage.getItem(POKEDEX_SKINS_STORAGE_KEY) ?? '["classic"]'); return new Set<PokedexSkinId>(Array.isArray(parsed) ? parsed.filter((id): id is PokedexSkinId => POKEDEX_SKINS.some((skin) => skin.id === id)) : ["classic"]); } catch { return new Set<PokedexSkinId>(["classic"]); }
}

function maskPokemonName(name: string, revealedLetters: number) {
  let shown = 0;
  return [...formatPokemonName(name)].map((character) => {
    if (!/[a-z]/i.test(character)) return character;
    shown += 1;
    return shown <= revealedLetters ? character : "_";
  }).join(" ");
}

function getSavedGameGenerations() {
  try {
    const savedGenerations = window.localStorage.getItem(
      GAME_GENERATIONS_STORAGE_KEY,
    );
    const parsedGenerations: unknown = savedGenerations
      ? JSON.parse(savedGenerations)
      : DEFAULT_GAME_GENERATIONS;

    if (!Array.isArray(parsedGenerations)) {
      return DEFAULT_GAME_GENERATIONS;
    }

    const validGenerations = parsedGenerations.filter(
      (generationId): generationId is number =>
        typeof generationId === "number" &&
        GAME_GENERATIONS.some((generation) => generation.id === generationId),
    );

    return validGenerations.length > 0
      ? [...new Set(validGenerations)].sort((left, right) => left - right)
      : DEFAULT_GAME_GENERATIONS;
  } catch {
    return DEFAULT_GAME_GENERATIONS;
  }
}

function getSavedRecentGamePokemonIds() {
  try {
    const savedRecentPokemon = window.localStorage.getItem(
      RECENT_GAME_POKEMON_STORAGE_KEY,
    );
    const parsedRecentPokemon: unknown = savedRecentPokemon
      ? JSON.parse(savedRecentPokemon)
      : [];

    if (!Array.isArray(parsedRecentPokemon)) {
      return [];
    }

    return parsedRecentPokemon
      .filter(
        (pokemonId): pokemonId is number =>
          Number.isInteger(pokemonId) &&
          pokemonId >= 1 &&
          pokemonId <= GAME_POKEMON_COUNT,
      )
      .reduce<number[]>(
        (recentPokemonIds, pokemonId) =>
          [...recentPokemonIds.filter((recentId) => recentId !== pokemonId), pokemonId]
            .slice(-RECENT_GAME_POKEMON_WINDOW),
        [],
      );
  } catch {
    return [];
  }
}

function saveRecentGamePokemonIds(recentPokemonIds: readonly number[]) {
  window.localStorage.setItem(
    RECENT_GAME_POKEMON_STORAGE_KEY,
    JSON.stringify(recentPokemonIds.slice(-RECENT_GAME_POKEMON_WINDOW)),
  );
}

function getSavedCapturedPokemonIds() {
  try {
    const savedCaptures = window.localStorage.getItem(
      CAPTURED_POKEMON_STORAGE_KEY,
    );

    if (!savedCaptures) {
      return new Set<number>();
    }

    const parsedCaptures: unknown = JSON.parse(savedCaptures);

    if (!Array.isArray(parsedCaptures)) {
      return new Set<number>();
    }

    return new Set(
      parsedCaptures
        .map((pokemonId) =>
          typeof pokemonId === "string" ? Number(pokemonId) : pokemonId,
        )
        .filter(
          (pokemonId): pokemonId is number =>
            Number.isInteger(pokemonId) &&
            pokemonId >= 1 &&
            pokemonId <= GAME_POKEMON_COUNT,
        ),
    );
  } catch {
    return new Set<number>();
  }
}

function getSavedShinyCapturedPokemonIds() {
  try {
    const savedShinyCaptures = window.localStorage.getItem(
      SHINY_CAPTURED_POKEMON_STORAGE_KEY,
    );

    if (!savedShinyCaptures) {
      return new Set<number>();
    }

    const parsedCaptures: unknown = JSON.parse(savedShinyCaptures);

    if (!Array.isArray(parsedCaptures)) {
      return new Set<number>();
    }

    return new Set(
      parsedCaptures.filter(
        (pokemonId): pokemonId is number =>
          Number.isInteger(pokemonId) &&
          pokemonId >= 1 &&
          pokemonId <= GAME_POKEMON_COUNT,
      ),
    );
  } catch {
    return new Set<number>();
  }
}

function CapturedPokemonCollection({
  capturedPokemonIds,
  shinyCapturedPokemonIds,
  onClose,
  onChooseCompanion,
}: {
  capturedPokemonIds: Set<number>;
  shinyCapturedPokemonIds: Set<number>;
  onClose: () => void;
  onChooseCompanion: (pokemonId: number) => void;
}) {
  const [pokemonIndex, setPokemonIndex] = useState<PokemonIndexEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPokemonId, setSelectedPokemonId] = useState<number | null>(null);
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonDetail | null>(null);
  const [evolutionStages, setEvolutionStages] = useState<string[]>([]);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const controller = new AbortController();

    async function loadPokemonIndex() {
      try {
        const response = await fetch(
          `https://pokeapi.co/api/v2/pokemon?limit=${GAME_POKEMON_COUNT}&offset=0`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to load the Pokedex.");
        }

        const data = (await response.json()) as { results: PokemonIndexEntry[] };
        setPokemonIndex(data.results);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPokemonIndex([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadPokemonIndex();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedPokemonId === null) {
      return;
    }

    const controller = new AbortController();

    async function loadPokemonDetails() {
      try {
        const pokemonResponse = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${selectedPokemonId}`,
          { signal: controller.signal },
        );
        if (!pokemonResponse.ok) {
          throw new Error("Unable to load Pokemon details.");
        }
        const pokemon = (await pokemonResponse.json()) as PokemonDetail;
        const speciesResponse = await fetch(pokemon.species.url, {
          signal: controller.signal,
        });
        if (!speciesResponse.ok) {
          throw new Error("Unable to load Pokemon species.");
        }
        const species = (await speciesResponse.json()) as PokemonDetailSpecies;
        const chainResponse = await fetch(species.evolution_chain.url, {
          signal: controller.signal,
        });
        if (!chainResponse.ok) {
          throw new Error("Unable to load evolution chain.");
        }
        const evolutionChain = (await chainResponse.json()) as EvolutionChain;

        const stages: string[] = [];
        let currentStage: EvolutionChainNode[] = [evolutionChain.chain];
        while (currentStage.length > 0) {
          stages.push(
            currentStage
              .map((stage) => formatPokemonName(stage.species.name))
              .join(" / "),
          );
          currentStage = currentStage.flatMap((stage) => stage.evolves_to);
        }

        if (!controller.signal.aborted) {
          setSelectedPokemon(pokemon);
          setEvolutionStages(stages);
          setDetailState("idle");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDetailState("error");
        }
      }
    }

    void loadPokemonDetails();
    return () => controller.abort();
  }, [selectedPokemonId]);

  const selectPokemon = (pokemonId: number) => {
    setSelectedPokemon(null);
    setEvolutionStages([]);
    setDetailState("loading");
    setSelectedPokemonId(pokemonId);
  };

  const closePokemonDetails = () => {
    setSelectedPokemonId(null);
    setSelectedPokemon(null);
    setEvolutionStages([]);
    setDetailState("idle");
  };

  return (
    <div
      aria-labelledby="collection-title"
      aria-modal="true"
      className="collection-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="collection-dialog">
        <header className="collection-heading">
          <div>
            <p className="eyebrow">Your collection</p>
            <h2 id="collection-title">Pokédex captured</h2>
            <p>
              {capturedPokemonIds.size} of {GAME_POKEMON_COUNT} Pokémon caught
            </p>
          </div>
          <button aria-label="Close captured Pokemon" onClick={onClose} type="button">
            ×
          </button>
        </header>

        {isLoading ? <p className="collection-loading">Loading the Pokédex…</p> : null}
        {!isLoading && pokemonIndex.length === 0 ? (
          <p className="collection-loading">The Pokédex could not be loaded. Try again shortly.</p>
        ) : null}
        {pokemonIndex.length > 0 ? (
          <ol className="collection-grid">
            {pokemonIndex.map((pokemon, index) => {
              const pokemonId = index + 1;
              const isCaptured = capturedPokemonIds.has(pokemonId);
              const isShinyCaptured = shinyCapturedPokemonIds.has(pokemonId);

              return (
                <li
                  className={isCaptured ? (isShinyCaptured ? "is-captured is-shiny" : "is-captured") : "is-unknown"}
                  key={pokemon.url}
                >
                  <button
                    aria-label={`View details for ${isCaptured ? formatPokemonName(pokemon.name) : `Pokemon number ${pokemonId}`}`}
                    className="collection-card"
                    onClick={() => selectPokemon(pokemonId)}
                    type="button"
                  >
                    <img
                      alt={
                        isCaptured
                          ? `${formatPokemonName(pokemon.name)}${isShinyCaptured ? " (Shiny)" : ""}`
                          : "Unknown Pokemon silhouette"
                      }
                      loading="lazy"
                      src={isShinyCaptured ? getShinySpriteUrl(pokemonId) : getSpriteUrl(pokemonId)}
                    />
                    <span className="collection-number">#{String(pokemonId).padStart(3, "0")}</span>
                    <strong>
                      {isCaptured ? formatPokemonName(pokemon.name) : "???"}
                      {isShinyCaptured ? <em aria-label="Shiny captured"> ✦</em> : null}
                    </strong>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
        {selectedPokemonId !== null ? (
          <section aria-live="polite" className="pokemon-detail-panel">
            <button
              aria-label="Close Pokemon details"
              className="pokemon-detail-close"
              onClick={closePokemonDetails}
              type="button"
            >
              ×
            </button>
            {detailState === "loading" ? <p>Loading Pokédex data…</p> : null}
            {detailState === "error" ? (
              <p>Could not load this Pokémon’s details. Try another card.</p>
            ) : null}
            {selectedPokemon ? (
              <>
                <header className="pokemon-detail-heading">
                  <img
                    alt={formatPokemonName(selectedPokemon.name)}
                    src={
                      shinyCapturedPokemonIds.has(selectedPokemon.id)
                        ? getShinySpriteUrl(selectedPokemon.id)
                        : getSpriteUrl(selectedPokemon.id)
                    }
                  />
                  <div>
                    <p>Pokédex #{String(selectedPokemon.id).padStart(3, "0")}</p>
                    <h3>{formatPokemonName(selectedPokemon.name)}</h3>
                  </div>
                </header>
                <dl className="pokemon-detail-facts">
                  <div>
                    <dt>Type</dt>
                    <dd>{selectedPokemon.types
                      .slice()
                      .sort((left, right) => left.slot - right.slot)
                      .map((type) => formatPokemonName(type.type.name))
                      .join(" / ")}</dd>
                  </div>
                  <div><dt>Height</dt><dd>{(selectedPokemon.height / 10).toFixed(1)} m</dd></div>
                  <div><dt>Weight</dt><dd>{(selectedPokemon.weight / 10).toFixed(1)} kg</dd></div>
                  <div><dt>Abilities</dt><dd>{selectedPokemon.abilities.map((ability) => `${formatPokemonName(ability.ability.name)}${ability.is_hidden ? " (Hidden)" : ""}`).join(", ")}</dd></div>
                </dl>
                <div className="pokemon-detail-section">
                  <h4>Evolution chain</h4>
                  <p>{evolutionStages.join(" → ") || "No known evolution."}</p>
                </div>
                <div className="pokemon-detail-section">
                  <h4>Moves</h4>
                  <ul className="pokemon-detail-moves">
                    {selectedPokemon.moves.slice(0, 12).map((move) => (
                      <li key={move.move.name}>{formatPokemonName(move.move.name)}</li>
                    ))}
                  </ul>
                </div>
                <button className="hint-button" onClick={() => onChooseCompanion(selectedPokemon.id)} type="button">
                  Choose {formatPokemonName(selectedPokemon.name)} as companion
                </button>
              </>
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}
const POKEMON_SCAN_VALUE = /^(?:pokemon:)?([a-z0-9][a-z0-9-]{0,39})$/i;
const TYPE_SCREEN_COLORS: Record<string, [string, string, string]> = {
  bug: ["#dce96f", "#789b20", "#193d20"],
  dark: ["#a18b93", "#4d3f52", "#171925"],
  dragon: ["#b39cff", "#5c4bb0", "#211d5a"],
  electric: ["#fff3a1", "#e0a714", "#6d4810"],
  fairy: ["#ffd0e8", "#dd6ea9", "#6e285c"],
  fighting: ["#ffb193", "#c95239", "#5c2025"],
  fire: ["#ffd391", "#e56728", "#6d2419"],
  flying: ["#c5e6ff", "#639bd0", "#234d7a"],
  ghost: ["#c5b8f6", "#67589e", "#2d2255"],
  grass: ["#c9f49d", "#5faa55", "#194d35"],
  ground: ["#f1d19a", "#af7846", "#55352a"],
  ice: ["#c6f5f1", "#55bfc1", "#1e5a6a"],
  normal: ["#eee6cf", "#a89573", "#514633"],
  poison: ["#ebbcf0", "#9a4baf", "#49215c"],
  psychic: ["#ffbad1", "#d65f8b", "#6d204b"],
  rock: ["#e4d3a0", "#9a8149", "#493b25"],
  steel: ["#d9e6ef", "#7894a8", "#314b5d"],
  water: ["#b8ecff", "#4299d5", "#174b7e"],
};

function getPokemonQueryFromScan(rawValue: string) {
  const value = rawValue.trim();
  const directMatch = value.match(POKEMON_SCAN_VALUE);

  if (directMatch) {
    return directMatch[1].toLowerCase();
  }

  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/^\/api\/v2\/pokemon\/([^/]+)\/?$/i);

    if (url.hostname === "pokeapi.co" && pathMatch) {
      const decodedValue = decodeURIComponent(pathMatch[1]);
      const urlMatch = decodedValue.match(POKEMON_SCAN_VALUE);

      return urlMatch ? urlMatch[1].toLowerCase() : null;
    }
  } catch {
    // The scanned value is not a URL.
  }

  return null;
}

function normalizeFlavorText(flavorText: string) {
  return flavorText
    .replace(/[\n\r\t\f]+/g, " ")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/\bPOK[\u00c9\u00e9]MON\b/g, "Pokemon")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getEnglishFlavorText(species: PokemonSpecies) {
  const entries = species.flavor_text_entries.filter(
    (flavorTextEntry) => flavorTextEntry.language.name === "en",
  );
  const entry = entries[Math.floor(Math.random() * entries.length)];

  return entry ? normalizeFlavorText(entry.flavor_text) : FLAVOR_TEXT_FALLBACK;
}

function getSpriteUrl(pokemonId: number) {
  return `${SPRITE_BASE_URL}/${pokemonId}.png`;
}

function getAnimatedSpriteUrl(pokemonId: number) {
  return `${ANIMATED_SPRITE_BASE_URL}/${pokemonId}.gif`;
}

function getShinySpriteUrl(pokemonId: number) {
  return `${SPRITE_BASE_URL}/shiny/${pokemonId}.png`;
}

function getAnimatedShinySpriteUrl(pokemonId: number) {
  return `${ANIMATED_SPRITE_BASE_URL}/shiny/${pokemonId}.gif`;
}

function drawSkinPattern(
  canvas: HTMLCanvasElement,
  skin: PokedexSkin,
  phase: number,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { height, width } = canvas;
  const patternKinds = ["Flower", "Lightning", "Flame", "Math"] as const;
  const seed = [...skin.id].reduce((total, character) => total * 31 + character.charCodeAt(0), 17);
  const patternKind = patternKinds[Math.abs(seed) % patternKinds.length];
  const animatedPhase = phase * (0.72 + (Math.abs(seed) % 11) * 0.065) + seed * 0.019;
  context.clearRect(0, 0, width, height);
  context.lineWidth = 11;
  context.lineCap = "round";

  if (patternKind === "Flower") {
    for (let x = 48; x < width; x += 112) {
      for (let y = 44; y < height; y += 112) {
        const wobble = Math.sin(animatedPhase * 2 + x * 0.02 + y * 0.02) * (5 + Math.abs(seed % 5));
        context.save();
        context.translate(x + wobble, y);
        context.fillStyle = "hsl(48 100% 68%)";
        for (let petal = 0; petal < 6; petal += 1) {
          context.rotate(Math.PI / 3);
          context.beginPath();
          context.ellipse(0, -22, 11, 25, 0, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = "hsl(24 92% 42%)";
        context.beginPath();
        context.arc(0, 0, 12, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  } else if (patternKind === "Lightning") {
    context.strokeStyle = "hsl(54 100% 72%)";
    for (let x = -80; x < width + 80; x += 104) {
      const offset = (animatedPhase * (34 + Math.abs(seed % 27))) % 104;
      context.beginPath();
      context.moveTo(x + offset, -12);
      context.lineTo(x + 34 + offset, 80);
      context.lineTo(x - 8 + offset, 80);
      context.lineTo(x + 48 + offset, 184);
      context.lineTo(x + 12 + offset, 184);
      context.lineTo(x + 72 + offset, height + 12);
      context.stroke();
    }
  } else if (patternKind === "Flame") {
    for (let x = -20; x < width + 40; x += 58) {
      const heightOffset = 30 + Math.sin(animatedPhase * 3 + x * 0.05) * (13 + Math.abs(seed % 14));
      context.fillStyle = "hsl(42 100% 57%)";
      context.beginPath();
      context.moveTo(x, height + 8);
      context.bezierCurveTo(x - 26, height - heightOffset, x + 7, height - heightOffset * 2.9, x + 20, height - 96);
      context.bezierCurveTo(x + 51, height - heightOffset * 1.8, x + 36, height - 25, x + 48, height + 8);
      context.fill();
      context.fillStyle = "hsl(7 92% 50%)";
      context.beginPath();
      context.moveTo(x + 13, height + 8);
      context.bezierCurveTo(x, height - 18, x + 24, height - 68, x + 28, height - 78);
      context.bezierCurveTo(x + 44, height - 43, x + 30, height - 22, x + 39, height + 8);
      context.fill();
    }
  } else {
    context.strokeStyle = `hsl(${(skin.hue + 72) % 360} 92% 68%)`;
    for (let radius = 28; radius < width; radius += 34) {
      context.beginPath();
      context.arc(width / 2, height / 2, radius + Math.sin(animatedPhase * 2 + radius) * (3 + Math.abs(seed % 7)), 0, Math.PI * 2);
      context.stroke();
    }
    for (let x = 0; x < width; x += 38) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(width - x, height);
      context.stroke();
    }
  }
}

function createSkinPatternTexture(skin: PokedexSkin) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  drawSkinPattern(canvas, skin, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function getPokemonIdsForGenerations(generationIds: readonly number[]) {
  return GAME_GENERATIONS.filter((generation) =>
    generationIds.includes(generation.id),
  ).flatMap((generation) =>
    Array.from(
      { length: generation.end - generation.start + 1 },
      (_, index) => generation.start + index,
    ),
  );
}

function getRandomGamePokemonId(
  generationIds: readonly number[],
  recentPokemonIds: readonly number[] = [],
  capturedPokemonIds?: ReadonlySet<number>,
) {
  const recentPokemonIdSet = new Set(recentPokemonIds);
  const selectedPokemonIds = getPokemonIdsForGenerations(generationIds);
  const eligiblePokemonIds = selectedPokemonIds.filter(
    (pokemonId) => !recentPokemonIdSet.has(pokemonId),
  );
  const uncaughtPokemonIds = capturedPokemonIds
    ? eligiblePokemonIds.filter((pokemonId) => !capturedPokemonIds.has(pokemonId))
    : [];
  const allUncaughtPokemonIds = capturedPokemonIds
    ? selectedPokemonIds.filter((pokemonId) => !capturedPokemonIds.has(pokemonId))
    : [];

  // This fallback keeps the selector safe if the game pool is ever smaller
  // than the recent-round window.
  const pokemonIds =
    uncaughtPokemonIds.length > 0 ? uncaughtPokemonIds : allUncaughtPokemonIds.length > 0 ? allUncaughtPokemonIds : eligiblePokemonIds.length > 0
      ? eligiblePokemonIds
      : selectedPokemonIds;

  return pokemonIds[Math.floor(Math.random() * pokemonIds.length)];
}

function rememberGamePokemonId(
  recentPokemonIds: readonly number[],
  pokemonId: number,
) {
  return [...recentPokemonIds.filter((recentId) => recentId !== pokemonId), pokemonId]
    .slice(-RECENT_GAME_POKEMON_WINDOW);
}

function isEveningLocally() {
  const localHour = new Date().getHours();

  return localHour >= 18 || localHour < 6;
}

function playCorrectJingle() {
  const audioContext = new AudioContext();
  const now = audioContext.currentTime;

  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.09;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.13, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.13);
  });

  window.setTimeout(() => void audioContext.close(), 500);
}

function playIncorrectBuzz() {
  const audioContext = new AudioContext();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(180, now);
  oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.21);

  window.setTimeout(() => void audioContext.close(), 350);
}

function playShinyFlourish() {
  const audioContext = new AudioContext();
  const now = audioContext.currentTime;

  [659.25, 783.99, 987.77, 1_318.51].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.075;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.11, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.23);
  });

  window.setTimeout(() => void audioContext.close(), 650);
}

function WhosThatPokemonIntro({
  playbackKey,
  onComplete,
  isMuted,
}: {
  playbackKey: string | null;
  onComplete: () => void;
  isMuted: boolean;
}) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const completedPlaybackRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const completePlayback = useCallback(() => {
    if (!playbackKey || completedPlaybackRef.current === playbackKey) {
      return;
    }

    completedPlaybackRef.current = playbackKey;
    playerRef.current?.stopVideo();
    onCompleteRef.current();
  }, [playbackKey]);

  useEffect(() => {
    const initializePlayer = () => {
      if (!window.YT || playerRef.current) {
        return;
      }

      playerRef.current = new window.YT.Player("whos-that-pokemon-youtube", {
        videoId: WHOSE_THAT_POKEMON_VIDEO_ID,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            playerRef.current
              ?.getIframe()
              .setAttribute("allow", "autoplay; encrypted-media");
            setIsReady(true);
          },
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState.ENDED) {
              completePlayback();
            }
          },
          onError: completePlayback,
        },
      });
    };

    if (window.YT?.Player) {
      initializePlayer();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    window.onYouTubeIframeAPIReady = initializePlayer;
    document.head.append(script);

    return () => {
      window.onYouTubeIframeAPIReady = undefined;
      script.remove();
    };
  }, [completePlayback]);

  useEffect(() => {
    if (!playerRef.current) return;

    if (isMuted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
    }
  }, [isMuted]);

  useEffect(() => {
    if (!playbackKey || !isReady || !playerRef.current) {
      return;
    }

    completedPlaybackRef.current = null;
    if (isMuted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
    }
    playerRef.current.loadVideoById({
      videoId: WHOSE_THAT_POKEMON_VIDEO_ID,
      startSeconds: 0,
      endSeconds: WHOSE_THAT_POKEMON_INTRO_SECONDS,
    });
  }, [isMuted, isReady, playbackKey]);

  useEffect(() => {
    if (!playbackKey) {
      return;
    }

    const fallback = window.setTimeout(
      completePlayback,
      WHOSE_THAT_POKEMON_FALLBACK_MS,
    );

    return () => window.clearTimeout(fallback);
  }, [completePlayback, playbackKey]);

  return (
    <div aria-hidden="true" className="youtube-intro-player">
      <div id="whos-that-pokemon-youtube" />
    </div>
  );
}

function normalizePokemonName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const VOICE_NAME_ALIASES: Record<string, string> = {
  "far fetched": "farfetchd",
  "far fetched d": "farfetchd",
  "mister mime": "mrmime",
  "mime junior": "mimejr",
  "ho oh": "hooh",
  "porygon z": "porygonz",
  "type null": "typenull",
  "tapu koko": "tapukoko",
  "tapu lele": "tapulele",
  "tapu bulu": "tapubulu",
  "tapu fini": "tapufini",
  "nidoran female": "nidoranf",
  "nidoran f": "nidoranf",
  "nidoran male": "nidoranm",
  "nidoran m": "nidoranm",
  electrobuzz: "electabuzz",
  "om a night": "omanyte",
  "feraligato": "feraligatr",
  lydian: "ledian",
};

function normalizeVoicePokemonName(name: string) {
  const normalizedWords = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalizePokemonName(VOICE_NAME_ALIASES[normalizedWords] ?? normalizedWords);
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

function findVoicePokemonMatch(
  transcript: string,
  candidates: readonly VoicePokemonCandidate[],
) {
  const normalizedTranscript = normalizeVoicePokemonName(transcript);
  const transcriptWords = transcript
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const phrases = new Set<string>([normalizedTranscript]);

  for (let start = 0; start < transcriptWords.length; start += 1) {
    for (let end = start + 1; end <= Math.min(transcriptWords.length, start + 4); end += 1) {
      phrases.add(normalizeVoicePokemonName(transcriptWords.slice(start, end).join(" ")));
    }
  }

  let bestMatch: { candidate: VoicePokemonCandidate; distance: number; phrase: string } | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizePokemonName(candidate.name);

    for (const phrase of phrases) {
      if (!phrase) continue;
      const distance = levenshteinDistance(phrase, normalizedCandidate);

      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { candidate, distance, phrase };
      }
    }
  }

  if (!bestMatch) return null;

  const allowedDistance =
    bestMatch.phrase.length <= 4 || bestMatch.candidate.name.length <= 4
      ? 1
      : bestMatch.candidate.name.length <= 7
        ? 2
        : 3;

  return bestMatch.distance <= allowedDistance ? bestMatch.candidate : null;
}

function formatPokemonName(name: string) {
  return name
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    const lastLine = lines[maxLines - 1];
    let clippedLine = lastLine;

    while (
      clippedLine.length > 0 &&
      context.measureText(`${clippedLine}...`).width > maxWidth
    ) {
      clippedLine = clippedLine.slice(0, -1).trimEnd();
    }

    lines[maxLines - 1] = `${clippedLine}...`;
  }

  return lines;
}

function createFlavorTextTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 384;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font =
    "700 46px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  context.textBaseline = "top";

  const horizontalPadding = 32;
  const verticalPadding = 24;
  const fontSize = 46;
  const lineHeight = 56;
  const lines = wrapCanvasText(
    context,
    text,
    canvas.width - horizontalPadding * 2,
    6,
  );
  const textBlockHeight = (lines.length - 1) * lineHeight + fontSize;
  const top = Math.max(verticalPadding, (canvas.height - textBlockHeight) / 2);

  lines.forEach((line, index) => {
    context.fillText(line, horizontalPadding, top + index * lineHeight);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function createDPadSegmentShape() {
  const halfWidth = D_PAD_SEGMENT_WIDTH / 2;
  const shape = new Shape();

  shape.moveTo(0, 0);
  shape.lineTo(halfWidth, D_PAD_SEGMENT_TIP_HEIGHT);
  shape.lineTo(halfWidth, D_PAD_SEGMENT_HEIGHT);
  shape.lineTo(-halfWidth, D_PAD_SEGMENT_HEIGHT);
  shape.lineTo(-halfWidth, D_PAD_SEGMENT_TIP_HEIGHT);
  shape.lineTo(0, 0);

  return shape;
}

function createScreenGradientTexture(typeNames: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const primary = TYPE_SCREEN_COLORS[typeNames[0]] ?? TYPE_SCREEN_COLORS.normal;
  const secondary = TYPE_SCREEN_COLORS[typeNames[1] ?? typeNames[0]] ?? primary;
  const isWater = typeNames.includes("water") || typeNames.includes("ice");
  const isFire = typeNames.includes("fire");
  const isGrass = typeNames.includes("grass") || typeNames.includes("bug");
  const horizon = Math.round(canvas.height * 0.58);

  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, primary[0]);
  sky.addColorStop(1, secondary[0]);
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, horizon);

  context.fillStyle = isWater ? "#237cb5" : isFire ? "#74302a" : primary[2];
  context.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  context.globalAlpha = 0.72;
  context.fillStyle = "#ffffff";
  context.fillRect(58, 56, 86, 15);
  context.fillRect(76, 42, 50, 15);
  context.fillRect(326, 96, 112, 15);
  context.fillRect(350, 81, 58, 15);
  context.globalAlpha = 1;

  if (isWater) {
    context.strokeStyle = "#b8f4ff";
    context.lineWidth = 6;
    for (let y = horizon + 24; y < canvas.height; y += 34) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y - 8);
      context.stroke();
    }
  } else if (isFire) {
    context.fillStyle = "#3f2024";
    context.beginPath();
    context.moveTo(0, horizon + 26);
    context.lineTo(105, horizon - 58);
    context.lineTo(202, horizon + 24);
    context.lineTo(326, horizon - 86);
    context.lineTo(canvas.width, horizon + 22);
    context.closePath();
    context.fill();
    context.fillStyle = "#ffb12b";
    for (let x = 28; x < canvas.width; x += 92) {
      context.fillRect(x, canvas.height - 26, 44, 8);
    }
  } else {
    context.fillStyle = isGrass ? "#488f3f" : primary[1];
    context.fillRect(0, horizon, canvas.width, 28);
    context.fillStyle = isGrass ? "#236b32" : primary[2];
    context.fillRect(0, horizon + 28, canvas.width, canvas.height - horizon - 28);

    if (isGrass) {
      const tree = (x: number, y: number, size: number) => {
        context.fillStyle = "#5b3a26";
        context.fillRect(x + size * 0.43, y + size * 0.56, size * 0.16, size * 0.44);
        context.fillStyle = "#1c5830";
        context.fillRect(x + size * 0.12, y + size * 0.3, size * 0.76, size * 0.28);
        context.fillRect(x + size * 0.24, y + size * 0.12, size * 0.52, size * 0.26);
        context.fillStyle = "#3c9a45";
        context.fillRect(x + size * 0.28, y, size * 0.38, size * 0.22);
      };
      tree(22, horizon - 95, 78);
      tree(398, horizon - 112, 96);
    }
  }

  context.globalAlpha = 0.2;
  context.fillStyle = "#ffffff";
  for (let x = 0; x < canvas.width; x += 16) {
    context.fillRect(x, canvas.height - ((x * 7) % 56) - 12, 5, 12);
  }
  context.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function ScreenBackground({ typeNames }: { typeNames: string[] }) {
  const gradientTexture = useMemo(
    () => createScreenGradientTexture(typeNames),
    [typeNames],
  );

  useEffect(() => {
    return () => {
      gradientTexture?.dispose();
    };
  }, [gradientTexture]);

  return (
    <mesh position={[0, 0, -0.002]}>
      <planeGeometry args={[0.71, 0.55]} />
      <meshBasicMaterial map={gradientTexture} toneMapped={false} />
    </mesh>
  );
}

function PokemonSprite({
  animatedSpriteUrl,
  concealed,
  revealAmount,
  spriteUrl,
}: {
  animatedSpriteUrl: string;
  concealed: boolean;
  revealAmount: number;
  spriteUrl: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [failedAnimatedUrl, setFailedAnimatedUrl] = useState<string | null>(null);
  const displayUrl =
    failedAnimatedUrl === animatedSpriteUrl ? spriteUrl : animatedSpriteUrl;

  return (
    <Html
      center
      occlude
      key={animatedSpriteUrl ?? spriteUrl ?? "fallback-target"}
      position={[0, 0, 0.006]}
      scale={SPRITE_HTML_SCALE}
      style={{ pointerEvents: "none" }}
      transform
      zIndexRange={[10, 0]}
    >
      <img
        alt={concealed ? "Mystery Pokemon silhouette" : "Pokemon sprite"}
        className={isLoaded ? "pokemon-sprite is-loaded" : "pokemon-sprite"}
        draggable={false}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          if (displayUrl !== spriteUrl) {
            setFailedAnimatedUrl(animatedSpriteUrl);
          }
        }}
        src={displayUrl}
        style={{
          display: "block",
          filter: concealed ? `brightness(${revealAmount})` : "none",
          height: SPRITE_RENDER_SIZE,
          imageRendering: "pixelated",
          objectFit: "contain",
          opacity: isLoaded ? 1 : 0,
          width: SPRITE_RENDER_SIZE,
        }}
      />
    </Html>
  );
}

function FlavorTextOverlay({ text }: { text: string }) {
  const textTexture = useMemo(() => createFlavorTextTexture(text), [text]);

  useEffect(() => {
    return () => {
      textTexture?.dispose();
    };
  }, [textTexture]);

  if (!textTexture) {
    return null;
  }

  return (
    <mesh position={[1.3, 0.16, 0.19]} rotation={[0, -0.52, 0]}>
      <planeGeometry args={[0.72, 0.22]} />
      <meshBasicMaterial
        alphaTest={0.01}
        depthWrite={false}
        map={textTexture}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function PokedexScreen({
  animatedSpriteUrl,
  concealed,
  flavorText,
  revealAmount,
  showShinyIndicator,
  skin,
  spriteUrl,
  typeNames,
}: {
  animatedSpriteUrl: string | null;
  concealed: boolean;
  flavorText: string | null;
  revealAmount: number;
  showShinyIndicator: boolean;
  skin: PokedexSkin;
  spriteUrl: string | null;
  typeNames: string[];
}) {
  return (
    <group position={POKEDEX_SCREEN_POSITION} rotation={[0, Math.PI / 2, 0]}>
      <ScreenBackground typeNames={typeNames} />
      <LegendarySkinDecal skin={skin} />
      {spriteUrl ? (
        <PokemonSprite
          animatedSpriteUrl={animatedSpriteUrl ?? spriteUrl}
          concealed={concealed}
          revealAmount={revealAmount}
          key={spriteUrl}
          spriteUrl={spriteUrl}
        />
      ) : null}
      {showShinyIndicator ? <ShinySilhouetteIndicator /> : null}
      {flavorText ? <FlavorTextOverlay text={flavorText} /> : null}
    </group>
  );
}

function ShinySilhouetteIndicator() {
  const sparklesRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (sparklesRef.current) {
      sparklesRef.current.rotation.z += delta * 1.5;
    }
  });

  return (
    <group ref={sparklesRef} position={[0, 0, 0.02]}>
      {[
        [-0.29, 0.2], [0.29, 0.16], [-0.25, -0.2], [0.25, -0.18],
        [0, 0.27], [0, -0.27],
      ].map(([x, y], index) => (
        <mesh key={index} position={[x, y, 0]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.045, 0.045]} />
          <meshBasicMaterial color="#fff1a0" toneMapped={false} transparent opacity={0.95} />
        </mesh>
      ))}
      <pointLight color="#ffe47a" distance={0.7} intensity={1.2} />
    </group>
  );
}

function DPadControls({ onStep }: { onStep: (delta: -1 | 1) => void }) {
  const dPadSegmentShape = useMemo(() => createDPadSegmentShape(), []);
  const [pressedSegment, setPressedSegment] = useState<string | null>(null);
  const dPadSegments = [
    {
      name: "left",
      delta: -1,
      rotation: Math.PI / 2,
    },
    {
      name: "right",
      delta: 1,
      rotation: -Math.PI / 2,
    },
    {
      name: "up",
      delta: 1,
      rotation: 0,
    },
    {
      name: "down",
      delta: -1,
      rotation: Math.PI,
    },
  ] as const;

  return (
    <group
      position={[D_PAD_CENTER.x, D_PAD_CENTER.y, D_PAD_CENTER.z]}
      rotation={[0, Math.PI / 2, 0]}
    >
      {dPadSegments.map((segment, index) => (
        <mesh
          key={segment.name}
          position={[0, 0, index * 0.001 - (pressedSegment === segment.name ? 0.035 : 0)]}
          rotation={[0, 0, segment.rotation]}
          onClick={(event) => {
            event.stopPropagation();
            setPressedSegment(segment.name);
            window.setTimeout(() => setPressedSegment(null), 120);
            onStep(segment.delta);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
          }}
        >
          <shapeGeometry args={[dPadSegmentShape]} />
          <meshBasicMaterial
            color={SHOW_D_PAD_DEBUG_OVERLAY ? "#00d1ff" : "#ffffff"}
            depthWrite={false}
            opacity={SHOW_D_PAD_DEBUG_OVERLAY ? 0.38 : 0.12}
            side={DoubleSide}
            transparent
          />
        </mesh>
      ))}
      {SHOW_D_PAD_DEBUG_OVERLAY ? (
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[0.025, 20]} />
          <meshBasicMaterial color="#ff3860" depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function Rainfall({ enabled }: { enabled: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const drops = useMemo(
    () =>
      Array.from({ length: 96 }, (_, index) => ({
        x: ((index * 37) % 19) - 9.5,
        y: -3 + ((index * 53) % 82) / 10,
        z: -4.5 - ((index * 71) % 145) / 10,
        speed: 4.8 + (index % 5) * 0.42,
      })),
    [],
  );

  useFrame((_, delta) => {
    if (!enabled || !meshRef.current) return;

    drops.forEach((drop, index) => {
      drop.y -= delta * drop.speed;
      if (drop.y < -3.55) drop.y = 4.9 + (index % 7) * 0.18;
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(0.16, 0, 0);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!enabled) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, drops.length]}>
      <boxGeometry args={[0.018, 0.42, 0.018]} />
      <meshBasicMaterial color="#b9dcf0" transparent opacity={0.62} />
    </instancedMesh>
  );
}

function Snowfall() {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const flakes = useMemo(
    () =>
      Array.from({ length: 160 }, (_, index) => ({
        x: ((index * 29) % 19) - 9.5,
        y: -2.8 + ((index * 47) % 96) / 10,
        z: -4.5 - ((index * 61) % 145) / 10,
        speed: 0.45 + (index % 5) * 0.11,
      })),
    [],
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    flakes.forEach((flake, index) => {
      flake.y -= delta * flake.speed;
      if (flake.y < -3.55) flake.y = 5.4 + (index % 9) * 0.15;
      dummy.position.set(flake.x + Math.sin(flake.y * 2 + index) * 0.08, flake.y, flake.z);
      dummy.scale.setScalar(0.65 + (index % 4) * 0.12);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, flakes.length]}>
      <sphereGeometry args={[0.035, 5, 4]} />
      <meshBasicMaterial color="#f7fdff" transparent opacity={0.9} />
    </instancedMesh>
  );
}

function MoonlitSky() {
  const stars = useMemo(
    () => Array.from({ length: 34 }, (_, index) => ({
      x: -6.8 + ((index * 37) % 136) / 10,
      y: 0.4 + ((index * 29) % 42) / 10,
      z: -13.5 + (index % 6) * 0.22,
      size: 0.012 + (index % 4) * 0.007,
    })),
    [],
  );
  return (
    <group>
      <mesh position={[-4.9, 3.4, -11.8]}>
        <sphereGeometry args={[0.38, 12, 8]} />
        <meshBasicMaterial color="#dce8ff" toneMapped={false} />
      </mesh>
      {stars.map((star, index) => (
        <mesh key={index} position={[star.x, star.y, star.z]}>
          <sphereGeometry args={[star.size, 5, 4]} />
          <meshBasicMaterial color="#e6eeff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Fireflies() {
  const fireflies = useMemo(
    () => Array.from({ length: 24 }, (_, index) => ({
      x: -6 + ((index * 31) % 120) / 10,
      y: -2.3 + ((index * 17) % 34) / 10,
      z: -6.4 - ((index * 43) % 72) / 10,
      phase: index * 0.73,
    })),
    [],
  );

  return (
    <group>
      {fireflies.map((firefly, index) => (
        <Firefly key={index} {...firefly} />
      ))}
    </group>
  );
}

function Firefly({ x, y, z, phase }: { x: number; y: number; z: number; phase: number }) {
  const fireflyRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!fireflyRef.current) return;
    const time = clock.getElapsedTime() + phase;
    fireflyRef.current.position.set(x + Math.sin(time * 0.8) * 0.16, y + Math.cos(time * 1.1) * 0.13, z);
    fireflyRef.current.scale.setScalar(0.65 + (Math.sin(time * 3) + 1) * 0.22);
  });

  return (
    <mesh ref={fireflyRef} position={[x, y, z]}>
      <sphereGeometry args={[0.035, 6, 5]} />
      <meshBasicMaterial color="#e9ff8a" toneMapped={false} />
    </mesh>
  );
}

function LavaVolcano({
  phase = 0,
  position = [-4.8, -2.85, -12.6] as [number, number, number],
  scale = 1.7,
}: {
  phase?: number;
  position?: [number, number, number];
  scale?: number;
}) {
  const volcanoRef = useRef<Group>(null);
  const embers = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({
      angle: index * 2.399,
      phase: phase + index * 0.41,
      radius: 0.16 + (index % 5) * 0.075,
    })),
    [phase],
  );

  useFrame(({ clock }) => {
    if (volcanoRef.current) volcanoRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.12 + phase) * 0.08;
  });

  return (
    <group ref={volcanoRef} position={position} scale={scale}>
      <mesh scale={[1.5, 1.8, 1.3]}>
        <coneGeometry args={[1, 1.9, 9]} />
        <meshStandardMaterial color="#261d22" flatShading roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 18]} />
        <meshBasicMaterial color="#ff5a1f" toneMapped={false} />
      </mesh>
      {[-0.52, -0.2, 0.18, 0.48].map((x, index) => (
        <mesh key={x} position={[x, 0.25 - index * 0.16, 0.75]} rotation={[-1.02, 0, 0]} scale={[0.13, 1.05 - index * 0.12, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={index % 2 ? "#ff7c24" : "#ffcc40"} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
      {embers.map((ember, index) => <LavaEmber key={index} {...ember} />)}
    </group>
  );
}

function LavaEmber({ angle, phase, radius }: { angle: number; phase: number; radius: number }) {
  const emberRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!emberRef.current) return;
    const time = clock.getElapsedTime() + phase;
    const distance = radius + (Math.sin(time * 1.8) + 1) * 0.3;
    emberRef.current.position.set(Math.cos(angle + time * 0.45) * distance, 1.2 + Math.abs(Math.sin(time * 1.4)) * 1.55, Math.sin(angle + time * 0.45) * distance);
    emberRef.current.scale.setScalar(0.45 + Math.abs(Math.sin(time * 2.4)) * 0.5);
  });
  return <mesh ref={emberRef}><sphereGeometry args={[0.045, 6, 5]} /><meshBasicMaterial color="#ffca4d" toneMapped={false} /></mesh>;
}

function WindblownGrass({
  position,
  scale = 1,
  seed,
}: {
  position: [number, number, number];
  scale?: number;
  seed: number;
}) {
  const grassRef = useRef<Group>(null);
  const blades = useMemo(
    () => Array.from({ length: 24 }, (_, index) => ({
      x: ((index * 23 + seed * 11) % 100) / 100 - 0.5,
      z: ((index * 37 + seed * 7) % 100) / 100 - 0.5,
      height: 0.22 + ((index * 17 + seed) % 13) / 34,
      phase: index * 0.48 + seed,
    })),
    [seed],
  );

  useFrame(({ clock }) => {
    if (!grassRef.current) return;
    grassRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.72 + seed) * 0.055;
  });

  return (
    <group ref={grassRef} position={position} scale={scale}>
      {blades.map((blade, index) => (
        <mesh key={index} position={[blade.x, blade.height / 2, blade.z]} rotation={[0, 0, Math.sin(blade.phase) * 0.12]}>
          <planeGeometry args={[0.032, blade.height]} />
          <meshStandardMaterial color={index % 3 === 0 ? "#78a94e" : index % 3 === 1 ? "#4f873f" : "#9abb57"} side={DoubleSide} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function LandscapeTree({
  foliage,
  index,
  position,
}: {
  foliage: string;
  index: number;
  position: readonly [number, number, number];
}) {
  const treeRef = useRef<Group>(null);
  const phase = index * 0.84;

  useFrame(({ clock }) => {
    if (treeRef.current) {
      treeRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.65 + phase) * 0.022;
    }
  });

  return (
    <group ref={treeRef} position={[position[0], -2.68, position[1]]} scale={position[2]}>
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.13, 0.18, 1.3, 6]} />
        <meshStandardMaterial color="#65412a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <coneGeometry args={[0.8, 1.8, 7]} />
        <meshStandardMaterial color={index % 2 === 0 ? foliage : "#4d9750"} roughness={0.9} />
      </mesh>
      <mesh position={[0.12, 0.83, -0.04]} scale={[0.72, 0.72, 0.72]}>
        <coneGeometry args={[0.8, 1.8, 7]} />
        <meshStandardMaterial color="#5aa553" roughness={0.9} />
      </mesh>
    </group>
  );
}

const ScanEnvironment = memo(function ScanEnvironment({
  animatedSpriteUrl,
  concealed,
  habitat,
  isEvening,
  spriteUrl,
  typeNames,
}: {
  animatedSpriteUrl: string | null;
  concealed: boolean;
  habitat: string;
  isEvening: boolean;
  spriteUrl: string | null;
  typeNames: string[];
}) {
  const [isWetWeather, setIsWetWeather] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOsloWeather() {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=59.9139&longitude=10.7522&current=precipitation,weather_code&timezone=Europe%2FOslo",
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          current?: { precipitation?: number; weather_code?: number };
        };
        const code = data.current?.weather_code ?? 0;
        setIsWetWeather((data.current?.precipitation ?? 0) > 0.05 || code >= 51);
      } catch {
        // The landscape remains clear if the optional weather lookup is unavailable.
      }
    }
    void loadOsloWeather();
    return () => controller.abort();
  }, []);
  const habitatScene = {
    cave: { ground: "#6f7667", foliage: "#5d744d", water: false, mountains: true },
    forest: { ground: "#2f6e3c", foliage: "#24653a", water: false, mountains: false },
    grassland: { ground: "#5da34a", foliage: "#347c3c", water: false, mountains: false },
    mountain: { ground: "#6d8263", foliage: "#405f45", water: false, mountains: true },
    rare: { ground: "#568f48", foliage: "#427b4a", water: false, mountains: false },
    "rough-terrain": { ground: "#6f815a", foliage: "#4d7142", water: false, mountains: true },
    sea: { ground: "#2e7db0", foliage: "#367d5c", water: true, mountains: false },
    "waters-edge": { ground: "#d5bd77", foliage: "#467f48", water: true, mountains: false },
    urban: { ground: "#75838b", foliage: "#5e7968", water: false, mountains: false },
  }[habitat] ?? {
    ground: "#568f48",
    foliage: "#427b4a",
    water: false,
    mountains: false,
  };
  // The biome changes with a new Pokémon, never while the player is typing a
  // guess. PokeAPI type is deliberately a stronger signal than habitat so an
  // Ice Pokémon never appears in a sunny grassland and Dark stays moonlit.
  const primaryType = typeNames[0] ?? "normal";
  const typeScene = {
    bug: { ground: "#4d7c32", foliage: "#2f6c37", sky: "#8fc8ec", water: false, mountains: false, snow: false, storm: false, night: false },
    dark: { ground: "#18251f", foliage: "#172f2a", sky: "#080d21", water: false, mountains: true, snow: false, storm: false, night: true },
    dragon: { ground: "#584b63", foliage: "#415e53", sky: "#413451", water: false, mountains: true, snow: false, storm: false, night: true },
    electric: { ground: "#55634c", foliage: "#384f3c", sky: "#2c3750", water: false, mountains: false, snow: false, storm: true, night: false },
    fairy: { ground: "#8fba81", foliage: "#5d9a62", sky: "#d8b7dc", water: false, mountains: false, snow: false, storm: false, night: false },
    fighting: { ground: "#9c7147", foliage: "#72623f", sky: "#c98e63", water: false, mountains: true, snow: false, storm: false, night: false },
    fire: { ground: "#6b4435", foliage: "#744737", sky: "#9a4d44", water: false, mountains: true, snow: false, storm: false, night: false },
    flying: { ground: "#78ad79", foliage: "#4d8d66", sky: "#84bfe8", water: false, mountains: false, snow: false, storm: false, night: false },
    ghost: { ground: "#29323f", foliage: "#33415c", sky: "#16152f", water: false, mountains: true, snow: false, storm: false, night: true },
    grass: { ground: "#2f6e3c", foliage: "#24653a", sky: "#8fc8ec", water: false, mountains: false, snow: false, storm: false, night: false },
    ground: { ground: "#a48358", foliage: "#786f43", sky: "#d5ad73", water: false, mountains: true, snow: false, storm: false, night: false },
    ice: { ground: "#d7edf2", foliage: "#7caeb7", sky: "#aecce2", water: false, mountains: true, snow: true, storm: false, night: false },
    normal: { ground: habitatScene.ground, foliage: habitatScene.foliage, sky: "#8fc8ec", water: habitatScene.water, mountains: habitatScene.mountains, snow: false, storm: false, night: false },
    poison: { ground: "#5d4a6d", foliage: "#4e5d45", sky: "#76598c", water: false, mountains: false, snow: false, storm: false, night: true },
    psychic: { ground: "#a96985", foliage: "#825572", sky: "#925a94", water: false, mountains: false, snow: false, storm: false, night: true },
    rock: { ground: "#786d59", foliage: "#59634c", sky: "#8791a0", water: false, mountains: true, snow: false, storm: false, night: false },
    steel: { ground: "#61717a", foliage: "#536866", sky: "#7f99aa", water: false, mountains: true, snow: false, storm: false, night: false },
    water: { ground: "#d5bd77", foliage: "#467f48", sky: "#72bde2", water: true, mountains: false, snow: false, storm: false, night: false },
  } as const;
  const scene = typeScene[primaryType as keyof typeof typeScene] ?? typeScene.normal;
  const isNightBiome = isEvening || scene.night;
  const isDesertBiome = primaryType === "ground" || primaryType === "rock";
  const isVolcanicBiome = primaryType === "fire";
  const isCalmNightBiome = scene.night && !scene.storm;
  const denseForest = primaryType === "grass" || primaryType === "bug" || habitat === "forest" || habitat === "rare";
  const hasCountryRoad = !scene.water && primaryType !== "cave";
  const hasCottage = !scene.water && primaryType !== "cave" && !scene.mountains;
  // Coastlines and dual-type Water Pokémon still get the shared mountain
  // backdrop. Only a pure Water Pokémon is intentionally open-water.
  const isPureWaterPokemon = typeNames.length === 1 && typeNames[0] === "water";
  const hasDistantMountains = !isPureWaterPokemon;
  const hasWindblownGrass = !scene.water && !isDesertBiome && !isVolcanicBiome;
  const trees = (denseForest
    ? [
        [-6.1, -7.6, 1.28], [-5.0, -8.5, 1.06], [-4.1, -10.2, 1.42],
        [-2.7, -8.2, 1.08], [-1.7, -11.2, 1.34], [0.9, -10.6, 1.14],
        [2.2, -8.3, 1.23], [3.65, -9.4, 1.45], [4.8, -7.8, 1.04],
        [5.9, -10.9, 1.38],
      ]
    : [
        [-5.55, -8.35, 1.0], [-3.7, -10.45, 1.18], [-1.85, -11.8, 0.9],
        [3.85, -10.35, 1.12], [5.4, -8.45, 1.02],
      ]) as ReadonlyArray<readonly [number, number, number]>;
  const bushes = [
    [-4.65, -7.35, 0.42], [-3.05, -8.2, 0.3], [-1.35, -8.9, 0.38],
    [0.15, -8.35, 0.32], [3.15, -7.65, 0.44], [4.75, -8.75, 0.34],
  ] as const;
  const wildflowers = [
    [-5.8, -6.6], [-4.3, -7.4], [-3.35, -6.95], [-2.1, -8.25],
    [-0.8, -7.3], [1.15, -7.8], [2.3, -6.72], [3.65, -7.65], [5.3, -6.95],
  ] as const;
  const wildflowerPatches = [
    [-5.5, -5.9], [-4.6, -6.25], [-3.7, -5.75], [-2.8, -6.45],
    [-1.9, -5.95], [-0.9, -6.6], [-4.9, -8.1], [-3.95, -8.7],
    [-2.9, -9.25], [-1.75, -9.85], [3.85, -5.85], [4.75, -6.35],
    [5.65, -6.85], [3.75, -8.35], [4.75, -8.95], [5.85, -9.45],
    [-5.75, -9.3], [-4.75, -10.15], [4.15, -10.4], [5.25, -11.15],
  ] as const;
  const fencePosts = [
    [-4.8, -6.4], [-3.7, -6.95], [-2.6, -7.5], [2.95, -7.4], [4.15, -6.8],
    [5.3, -6.25],
  ] as const;
  const iceMountainRange: ReadonlyArray<readonly [number, number, number, string]> = [
    [-6.2, 1.15, 3.6, "#b8d5df"],
    [-2.9, 1.8, 4.8, "#dcecf0"],
    [1.4, 1.35, 4.1, "#c7e0e7"],
    [5.2, 0.95, 3.25, "#b2d0da"],
  ];
  const distantMountainRange: ReadonlyArray<readonly [number, number, number]> = [
    [-8.8, 0.7, 3.8], [-5.9, 1.35, 5.4], [-2.5, 0.9, 4.5],
    [0.6, 1.65, 6.1], [4.1, 0.82, 4.25], [7.4, 1.18, 5.15],
  ];
  const horizonMountainRange: ReadonlyArray<readonly [number, number, number]> = [
    [-10.5, 1.1, 5.8], [-7.2, 1.8, 7.2], [-3.8, 1.35, 6.4],
    [0.2, 2.25, 8.1], [4.3, 1.55, 6.9], [8.1, 1.9, 7.4],
  ];
  const sideMountainRange: ReadonlyArray<readonly [number, number, number]> = [
    [-5.6, 0.3, 1.65], [-3.9, 0.58, 2.15], [-2.1, 0.18, 1.35],
  ];
  const hasMeadow = !scene.water && !isDesertBiome && !isVolcanicBiome;

  return (
    <group>
      <Sky
        distance={450000}
        inclination={isNightBiome ? 0.53 : 0.5}
        azimuth={0.18}
        rayleigh={isNightBiome ? 1.2 : scene.storm ? 0.75 : 2}
        sunPosition={isNightBiome ? [-5, 0.35, -6] : scene.storm ? [-3, 1.1, -6] : [4, 2, -6]}
      />
      {isCalmNightBiome ? <MoonlitSky /> : (
        <>
          <Cloud
            position={[-4.1, 4.2, -10.5]}
            scale={0.78}
            speed={0.05}
            opacity={scene.storm ? 0.42 : isWetWeather ? 0.38 : 0.28}
          />
          <Cloud
            position={[3.9, 4.8, -12.8]}
            scale={0.62}
            speed={0.04}
            opacity={scene.storm ? 0.34 : isWetWeather ? 0.28 : 0.2}
          />
        </>
      )}
      {isCalmNightBiome ? <Fireflies /> : null}
      <mesh position={[0, -3.72, -9.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 48, 1, 1]} />
        <meshStandardMaterial color={scene.ground} roughness={1} />
      </mesh>
      {hasDistantMountains ? (
        <group position={[0, -1.15, -33]}>
          {horizonMountainRange.map(([x, y, scale], index) => (
            <mesh key={`horizon-mountain-${index}`} position={[x, y, -index * 0.7]} scale={[scale * 1.45, scale * 0.46, scale]}>
              <coneGeometry args={[1, 1.8, 7]} />
              <meshStandardMaterial color={scene.snow ? "#d9e9ee" : isVolcanicBiome ? "#241b22" : "#718a99"} depthWrite={false} flatShading roughness={1} transparent opacity={0.52} />
            </mesh>
          ))}
        </group>
      ) : null}
      {hasDistantMountains ? (
        <group position={[0, -1.55, -20.2]}>
          {distantMountainRange.map(([x, y, scale], index) => (
            <group key={`distant-mountain-${index}`} position={[x, y, -index * 0.45]} scale={[scale * 1.28, scale * 0.68, scale]}>
              <mesh>
                <coneGeometry args={[1, 1.8, 7]} />
                <meshStandardMaterial
                  color={scene.snow ? "#b5d1dc" : isVolcanicBiome ? "#2e2529" : index % 2 ? "#53665c" : "#6b7768"}
                  flatShading
                  roughness={0.95}
                />
              </mesh>
              {scene.snow ? (
                <mesh position={[0, 0.72, 0]} scale={[0.56, 0.4, 0.56]}>
                  <coneGeometry args={[1, 1.2, 7]} />
                  <meshStandardMaterial color="#f7fdff" flatShading roughness={0.98} />
                </mesh>
              ) : null}
            </group>
          ))}
        </group>
      ) : null}
      {hasDistantMountains ? (
        <group position={[-3.1, -2.65, -10.4]} rotation={[0, 0.18, 0]}>
          {sideMountainRange.map(([x, y, scale], index) => (
            <mesh key={`side-mountain-${index}`} position={[x, y, -index * 0.55]} scale={[scale * 1.2, scale * 0.92, scale]}>
              <coneGeometry args={[1, 1.8, 7]} />
              <meshStandardMaterial color={scene.snow ? "#bfd9e2" : isVolcanicBiome ? "#38262b" : index % 2 ? "#43564f" : "#526860"} flatShading roughness={1} />
            </mesh>
          ))}
        </group>
      ) : null}
      {isVolcanicBiome ? (
        <>
          <LavaVolcano />
          <LavaVolcano position={[0.9, -3.08, -17.8]} scale={1.12} phase={1.7} />
          <LavaVolcano position={[5.15, -3.2, -20.6]} scale={0.82} phase={3.1} />
        </>
      ) : null}
      {scene.water ? (
        <mesh position={[2.8, -3.65, -8.55]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[18, 20, 1, 1]} />
          <meshStandardMaterial color="#3b9ed3" metalness={0.1} roughness={0.38} />
        </mesh>
      ) : null}
      {hasCountryRoad ? (
        <group>
          <mesh position={[1.65, -3.695, -6.7]} rotation={[-Math.PI / 2, 0.12, 0]} receiveShadow>
            <planeGeometry args={[2.45, 13.2]} />
            <meshStandardMaterial color={isWetWeather ? "#6f6251" : "#a6835c"} roughness={isWetWeather ? 0.42 : 0.96} metalness={isWetWeather ? 0.12 : 0} />
          </mesh>
          <mesh position={[1.25, -3.695, -13.3]} rotation={[-Math.PI / 2, -0.08, 0]} receiveShadow>
            <planeGeometry args={[2.45, 9.8]} />
            <meshStandardMaterial color={isWetWeather ? "#6f6251" : "#a6835c"} roughness={isWetWeather ? 0.42 : 0.96} metalness={isWetWeather ? 0.12 : 0} />
          </mesh>
          <mesh position={[1.65, -3.676, -6.7]} rotation={[-Math.PI / 2, 0.12, 0]}>
            <planeGeometry args={[0.075, 13.3]} />
            <meshStandardMaterial color="#d6c39d" roughness={0.9} />
          </mesh>
          <mesh position={[1.25, -3.676, -13.3]} rotation={[-Math.PI / 2, -0.08, 0]}>
            <planeGeometry args={[0.075, 9.9]} />
            <meshStandardMaterial color="#d6c39d" roughness={0.9} />
          </mesh>
        </group>
      ) : null}
      {!isDesertBiome && !isVolcanicBiome && trees.map((tree, index) => (
        <LandscapeTree
          foliage={scene.foliage}
          index={index}
          key={`tree-${tree[0]}-${tree[1]}`}
          position={tree}
        />
      ))}
      {!isDesertBiome && !isVolcanicBiome && bushes.map(([x, z, scale]) => (
        <mesh key={`bush-${x}-${z}`} position={[x, -3.3, z]} scale={scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={scene.foliage} flatShading roughness={1} />
        </mesh>
      ))}
      {hasWindblownGrass ? (
        <>
          <WindblownGrass position={[-5.75, -3.48, -6.55]} scale={2.1} seed={1} />
          <WindblownGrass position={[-7.35, -3.48, -3.9]} scale={2.8} seed={6} />
          <WindblownGrass position={[-5.9, -3.48, -3.45]} scale={2.55} seed={7} />
          <WindblownGrass position={[-3.6, -3.48, -8.1]} scale={1.8} seed={2} />
          <WindblownGrass position={[0.1, -3.48, -9.25]} scale={2.4} seed={3} />
          <WindblownGrass position={[4.9, -3.48, -7.1]} scale={2.25} seed={4} />
          <WindblownGrass position={[5.55, -3.48, -10.6]} scale={1.9} seed={5} />
        </>
      ) : null}
      {hasWindblownGrass ? (
        <>
          <LandscapeTree foliage={scene.foliage} index={11} position={[-6.7, -4.6, 1.12]} />
          <LandscapeTree foliage={scene.foliage} index={12} position={[-5.55, -4.1, 0.84]} />
          <mesh position={[-6.1, -3.38, -3.75]} scale={[0.72, 0.42, 0.52]}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#53645b" flatShading roughness={1} />
          </mesh>
        </>
      ) : null}
      {hasMeadow && wildflowers.map(([x, z], index) => (
        <group key={`flower-${x}-${z}`} position={[x, -3.48, z]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.012, 0.02, 0.24, 4]} />
            <meshStandardMaterial color="#386d38" roughness={1} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <sphereGeometry args={[0.075, 5, 4]} />
            <meshStandardMaterial color={index % 3 === 0 ? "#f2d96b" : index % 3 === 1 ? "#f49bb3" : "#d8d0ff"} roughness={0.85} />
          </mesh>
        </group>
      ))}
      {hasMeadow && wildflowerPatches.map(([x, z], index) => (
        <group key={`flower-patch-${x}-${z}`} position={[x, -3.48, z]}>
          {[-0.15, 0, 0.15].map((offset, flowerIndex) => (
            <group key={offset} position={[offset, flowerIndex === 1 ? 0.04 : 0, flowerIndex === 1 ? 0.08 : -0.05]}>
              <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.01, 0.018, 0.2, 4]} />
                <meshStandardMaterial color="#386d38" roughness={1} />
              </mesh>
              <mesh position={[0, 0.22, 0]}>
                <sphereGeometry args={[0.065, 5, 4]} />
                <meshStandardMaterial color={index % 4 === 0 ? "#f2d96b" : index % 4 === 1 ? "#f49bb3" : index % 4 === 2 ? "#d8d0ff" : "#f7a45c"} roughness={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {hasCountryRoad ? fencePosts.map(([x, z], index) => (
        <group key={`fence-${x}-${z}`} position={[x, -3.35, z]}>
          <mesh>
            <boxGeometry args={[0.09, 0.6, 0.09]} />
            <meshStandardMaterial color="#75543a" roughness={1} />
          </mesh>
          {index > 0 ? <mesh position={[index < 3 ? 0.56 : -0.56, -0.05, 0.28]} rotation={[0, index < 3 ? 0.5 : -0.5, 0]}>
            <boxGeometry args={[1.28, 0.055, 0.055]} />
            <meshStandardMaterial color="#8d6746" roughness={1} />
          </mesh> : null}
        </group>
      )) : null}
      {[
        [-5.3, -7.2, 0.24],
        [-2.55, -7.85, 0.18],
        [1.3, -7.4, 0.22],
        [4.95, -7.3, 0.28],
      ].map(([x, z, scale]) => (
        <mesh key={`rock-${x}-${z}`} position={[x, -3.47, z]} scale={scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#65736b" flatShading roughness={1} />
        </mesh>
      ))}
      {hasDistantMountains ? (
        <group position={[0.7, -2.18, -12.8]}>
          {scene.snow ? (
            <group position={[0, 0.15, -2.4]}>
              {iceMountainRange.map(([x, y, scale, color], index) => (
                <group key={`ice-range-${index}`} position={[x, y, -index * 0.34]} scale={scale}>
                  <mesh>
                    <coneGeometry args={[1, 1.8, 7]} />
                    <meshStandardMaterial color={color} flatShading roughness={0.9} />
                  </mesh>
                  <mesh position={[0, 0.68, 0]} scale={[0.56, 0.38, 0.56]}>
                    <coneGeometry args={[1, 1.2, 7]} />
                    <meshStandardMaterial color="#f6fdff" flatShading roughness={0.96} />
                  </mesh>
                </group>
              ))}
            </group>
          ) : null}
          <mesh position={[-3.5, 0.55, 0]} scale={[2.4, 2.8, 1.5]}>
            <coneGeometry args={[1, 1.8, 6]} />
            <meshStandardMaterial color={scene.snow ? "#d8e9ef" : isVolcanicBiome ? "#3f3032" : "#66736a"} flatShading roughness={1} />
          </mesh>
          <mesh position={[0.25, 0.68, -0.5]} scale={[2.45, 2.8, 1.8]}>
            <coneGeometry args={[1, 1.8, 6]} />
            <meshStandardMaterial color={scene.snow ? "#b9d4df" : isVolcanicBiome ? "#35272a" : "#59675f"} flatShading roughness={1} />
          </mesh>
          <mesh position={[3.75, 0.4, 0]} scale={[1.9, 2.3, 1.3]}>
            <coneGeometry args={[1, 1.8, 6]} />
            <meshStandardMaterial color={scene.snow ? "#dfeff2" : isVolcanicBiome ? "#493337" : "#71806d"} flatShading roughness={1} />
          </mesh>
          {scene.snow ? <mesh position={[0.25, 3.2, -0.5]} scale={[1.55, 0.65, 1.02]}>
            <coneGeometry args={[1, 1.2, 6]} />
            <meshStandardMaterial color="#f5fbff" flatShading roughness={0.96} />
          </mesh> : null}
          {isVolcanicBiome ? <mesh position={[0.25, 2.35, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.44, 18]} />
            <meshBasicMaterial color="#ff6a2c" toneMapped={false} />
          </mesh> : null}
        </group>
      ) : null}
      {isDesertBiome ? (
        <group position={[-2.25, -2.55, -12.4]} rotation={[0, -0.12, 0]}>
          {[[0, 1.65], [2.45, 1.05], [-2.1, 0.86]].map(([x, scale], index) => (
            <mesh key={index} position={[x, 0.25, -index * 0.34]} scale={scale}>
              <coneGeometry args={[1.1, 1.85, 4]} />
              <meshStandardMaterial color={index === 0 ? "#d8b978" : "#c8a96e"} flatShading roughness={1} />
            </mesh>
          ))}
        </group>
      ) : null}
      {hasCottage ? (
        <group position={[-3.8, -2.67, -11.2]} rotation={[0, 0.34, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.35, 1.45, 1.7]} />
            <meshStandardMaterial color={habitat === "urban" ? "#b5a38c" : "#d4b17b"} roughness={0.92} />
          </mesh>
          <mesh position={[0, 1.04, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.7, 1.1, 4]} />
            <meshStandardMaterial color="#9a493c" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.35, 0.87]}>
            <boxGeometry args={[0.48, 0.76, 0.045]} />
            <meshStandardMaterial color="#65422d" roughness={0.9} />
          </mesh>
          <mesh position={[-0.72, 0.12, 0.88]}>
            <boxGeometry args={[0.44, 0.42, 0.05]} />
            <meshStandardMaterial color={isNightBiome ? "#ffd47a" : "#7bbbd0"} emissive={isNightBiome ? "#d89431" : "#000000"} emissiveIntensity={isNightBiome ? 0.8 : 0} />
          </mesh>
        </group>
      ) : null}
      <group position={[2.4, -1.1, -8.2]} scale={1.75}>
        <mesh castShadow>
          <sphereGeometry args={[0.82, 14, 10]} />
          <meshStandardMaterial color="#d9f0c5" roughness={0.72} />
        </mesh>
        <mesh position={[0, -0.88, 0]} castShadow>
          <cylinderGeometry args={[0.5, 0.74, 0.28, 10]} />
          <meshStandardMaterial color={scene.foliage} roughness={0.9} />
        </mesh>
        <ScanTargetSprite
          animatedSpriteUrl={animatedSpriteUrl}
          concealed={concealed}
          spriteUrl={spriteUrl}
        />
      </group>
      {scene.snow ? <Snowfall /> : null}
      <Rainfall enabled={isWetWeather && !isNightBiome && !scene.snow && !scene.storm} />
    </group>
  );
});

function ScanTargetSprite({
  animatedSpriteUrl,
  concealed,
  spriteUrl,
}: {
  animatedSpriteUrl: string | null;
  concealed: boolean;
  spriteUrl: string | null;
}) {
  const [failedAnimatedUrl, setFailedAnimatedUrl] = useState<string | null>(null);
  const displayUrl = failedAnimatedUrl === animatedSpriteUrl
    ? spriteUrl ?? getSpriteUrl(25)
    : animatedSpriteUrl ?? spriteUrl ?? getSpriteUrl(25);

  return (
    <Html
      center
      occlude
      key={displayUrl}
      position={[0, 0.55, 0.9]}
      scale={0.46}
      style={{ pointerEvents: "none" }}
      transform
      zIndexRange={[0, -1]}
    >
      <img
        alt=""
        draggable={false}
        onError={() => {
          if (displayUrl === animatedSpriteUrl) setFailedAnimatedUrl(animatedSpriteUrl);
        }}
        src={displayUrl}
        style={{
          display: "block",
          filter: concealed ? "brightness(0)" : "none",
          height: "150px",
          imageRendering: "pixelated",
          objectFit: "contain",
          width: "150px",
        }}
      />
    </Html>
  );
}

function CompanionPokemon({ pokemonId, shiny }: { pokemonId: number; shiny: boolean }) {
  const companionRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!companionRef.current) return;
    companionRef.current.position.y = -1.72 + Math.sin(clock.getElapsedTime() * 1.4) * 0.08;
    companionRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.1) * 0.05;
  });
  return (
    <group ref={companionRef} position={[-2.55, -1.72, -4.55]}>
      <Html center transform scale={0.55} style={{ pointerEvents: "none" }}>
        <img alt="Selected companion Pokemon" draggable={false} src={shiny ? getShinySpriteUrl(pokemonId) : getSpriteUrl(pokemonId)} style={{ display: "block", height: "130px", imageRendering: "pixelated", objectFit: "contain", width: "130px" }} />
      </Html>
    </group>
  );
}

function LegendarySkinDecal({ skin }: { skin: PokedexSkin }) {
  const trailRef = useRef<Group>(null);
  const isFlame = skin.legendaryEffect === "Flame";

  useFrame(({ clock }) => {
    if (!trailRef.current) return;
    const progress = (clock.getElapsedTime() * (isFlame ? 0.42 : 0.28)) % 1;
    trailRef.current.position.y = -0.19 + progress * 0.38;
    trailRef.current.rotation.z = isFlame ? Math.sin(clock.getElapsedTime() * 4) * 0.14 : clock.getElapsedTime() * 0.8;
  });

  if (skin.rarity !== "Legendary") return null;

  return (
    <group ref={trailRef} position={[0.19, -0.19, 0.018]}>
      {isFlame ? (
        <>
          {[[-0.045, 0], [0, 0.04], [0.045, -0.01]].map(([x, y], index) => (
            <mesh key={index} position={[x, y, 0]} scale={[0.045, 0.1 + index * 0.016, 1]}>
              <coneGeometry args={[1, 1.8, 5]} />
              <meshBasicMaterial color={index === 1 ? "#ffd34d" : "#ff652f"} toneMapped={false} transparent opacity={0.92} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {Array.from({ length: 20 }, (_, flowerIndex) => {
            const lane = (flowerIndex % 5) - 2;
            const vertical = -0.13 + Math.floor(flowerIndex / 5) * 0.087;
            const size = 0.46 + (flowerIndex % 3) * 0.1;
            return (
              <group key={flowerIndex} position={[lane * 0.055 + Math.sin(flowerIndex * 1.7) * 0.014, vertical, 0]} scale={size}>
                {Array.from({ length: 5 }, (_, petalIndex) => (
                  <mesh key={petalIndex} position={[Math.cos(petalIndex * (Math.PI * 2 / 5)) * 0.047, Math.sin(petalIndex * (Math.PI * 2 / 5)) * 0.047, 0]} scale={[0.028, 0.05, 1]} rotation={[0, 0, petalIndex * (Math.PI * 2 / 5)]}>
                    <sphereGeometry args={[1, 8, 6]} />
                    <meshBasicMaterial color={flowerIndex % 3 === 0 ? "#ffb1d1" : flowerIndex % 3 === 1 ? "#ff82bb" : "#dca6ff"} toneMapped={false} />
                  </mesh>
                ))}
                <mesh scale={0.024}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#ffd34d" toneMapped={false} /></mesh>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

function PokedexModel({
  animatedSpriteUrl,
  concealed,
  flavorText,
  revealAmount,
  skin,
  showShinyIndicator,
  onDPadStep,
  spriteUrl,
  typeNames,
}: {
  animatedSpriteUrl: string | null;
  concealed: boolean;
  flavorText: string | null;
  revealAmount: number;
  skin: PokedexSkinId;
  showShinyIndicator: boolean;
  onDPadStep: (delta: -1 | 1) => void;
  spriteUrl: string | null;
  typeNames: string[];
}) {
  const { scene } = useGLTF("/Pokedex.glb");
  const skinnedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => material.clone())
          : object.material.clone();
      }
    });
    return clone;
  }, [scene]);
  const legendaryFinishMaterialsRef = useRef<MeshStandardMaterial[]>([]);
  const selectedSkin = useMemo(
    () => POKEDEX_SKIN_BY_ID.get(skin) ?? POKEDEX_SKIN_BY_ID.get("classic")!,
    [skin],
  );
  const skinPatternTextureRef = useRef<CanvasTexture | null>(null);
  const skinPatternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const skinPatternTexture = createSkinPatternTexture(selectedSkin);
    skinPatternTextureRef.current = skinPatternTexture;
    skinPatternCanvasRef.current = skinPatternTexture.image as HTMLCanvasElement;
    const finishMaterials: MeshStandardMaterial[] = [];
    skinnedScene.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        if (
          material instanceof MeshStandardMaterial &&
          (material.name === "Red" || material.name === "Pinkish")
        ) {
          material.map = null;
          material.emissiveMap = selectedSkin.rarity === "Legendary"
            ? skinPatternTexture
            : null;
          material.color.setHSL(
            selectedSkin.hue / 360,
            selectedSkin.saturation / 100,
            selectedSkin.lightness / 100,
          );
          material.emissive.set("#ffffff");
          material.emissiveIntensity = selectedSkin.rarity === "Legendary" ? 1.1 : 0;
          material.metalness = selectedSkin.metalness;
          material.roughness = selectedSkin.roughness;
          material.needsUpdate = true;
          finishMaterials.push(material);
        }
      });
    });
    legendaryFinishMaterialsRef.current = finishMaterials;
    return () => {
      if (skinPatternTextureRef.current === skinPatternTexture) {
        skinPatternTextureRef.current = null;
        skinPatternCanvasRef.current = null;
      }
      skinPatternTexture.dispose();
    };
  }, [selectedSkin, skinnedScene]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const skinPatternTexture = skinPatternTextureRef.current;
    const skinPatternCanvas = skinPatternCanvasRef.current;
    if (selectedSkin.rarity !== "Legendary") return;
    if (skinPatternTexture && skinPatternCanvas) {
      drawSkinPattern(skinPatternCanvas, selectedSkin, elapsed);
      skinPatternTexture.needsUpdate = true;
    }

    const glow = 0.85 + (Math.sin(elapsed * 4) + 1) * 0.38;
    legendaryFinishMaterialsRef.current.forEach((material) => {
      material.color.setHSL(
        selectedSkin.hue / 360,
        selectedSkin.saturation / 100,
        selectedSkin.lightness / 100,
      );
      material.emissive.set("#ffffff");
      material.emissiveIntensity = glow;
    });
  });

  return (
    <group
      position={POKEDEX_MODEL_POSITION}
      rotation={[0, POKEDEX_MODEL_ROTATION_Y, 0]}
      scale={POKEDEX_MODEL_SCALE}
    >
      <primitive object={skinnedScene} />
      <PokedexScreen
        animatedSpriteUrl={animatedSpriteUrl}
        concealed={concealed}
        flavorText={flavorText}
        revealAmount={revealAmount}
        showShinyIndicator={showShinyIndicator}
        skin={selectedSkin}
        spriteUrl={spriteUrl}
        typeNames={typeNames}
      />
      <DPadControls onStep={onDPadStep} />
    </group>
  );
}

function WorldConfetti({
  level,
  seed,
  settled = false,
}: {
  level: number;
  seed: number;
  settled?: boolean;
}) {
  const particleCount = useMemo(() => {
    const hardwareThreads = navigator.hardwareConcurrency ?? 4;
    const adaptiveCap =
      hardwareThreads >= 8 ? 20_000 : hardwareThreads >= 6 ? 12_000 : 6_000;

    return settled
      ? Math.min(1_200, 120 + level * 2)
      : Math.min(adaptiveCap, 600 + level * 28);
  }, [level, settled]);
  const particleSystem = useMemo(() => {
    const geometry = new BufferGeometry();
    const colors = new Float32Array(particleCount * 3);
    const origins = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const landingTimes = new Float32Array(particleCount);
    const particleSizes = new Float32Array(particleCount);
    const spawnDelays = new Float32Array(particleCount);
    const emitters: Array<[number, number, number]> = [
      [-0.8, -0.5, 0.5],
      [1.25, -0.7, -0.4],
      [2.3, -1.1, -5.8],
      [-2.1, -1.5, -4.5],
      [0.4, -0.2, -2.2],
    ];
    const palette: Array<[number, number, number]> = [
      [1, 0.3, 0.36],
      [1, 0.86, 0.2],
      [0.25, 0.82, 1],
      [0.44, 0.96, 0.46],
      [0.78, 0.43, 1],
      [1, 0.55, 0.16],
    ];

    const random = (index: number, salt: number) => {
      const value = Math.sin(
        (index + 1) * (12.9898 + salt * 78.233) + seed * 0.000001,
      ) * 43_758.5453;
      return value - Math.floor(value);
    };

    for (let index = 0; index < particleCount; index += 1) {
      const offset = index * 3;
      const emitter = emitters[Math.floor(random(index, 1) * emitters.length)];
      const hue = palette[Math.floor(random(index, 2) * palette.length)];
      const angle = random(index, 3) * Math.PI * 2;
      const speed = 1.2 + random(index, 4) * 3.8;
      const verticalSpeed = 2.1 + random(index, 5) * 6.5;
      const originX = emitter[0] + (random(index, 6) - 0.5) * 0.56;
      const originY = emitter[1] + (random(index, 7) - 0.5) * 0.28;
      const originZ = emitter[2] + (random(index, 8) - 0.5) * 0.56;
      const impactTime =
        (verticalSpeed + Math.sqrt(verticalSpeed ** 2 + 2 * 4.8 * (originY + 3.64))) /
        4.8;

      origins.set([originX, originY, originZ], offset);
      velocities.set(
        [Math.cos(angle) * speed, verticalSpeed, Math.sin(angle) * speed],
        offset,
      );
      colors.set(hue, offset);
      landingTimes[index] = Math.min(CONFETTI_DURATION_SECONDS, impactTime);
      particleSizes[index] = 0.65 + random(index, 9) * 1.35;
      spawnDelays[index] = settled ? 0 : random(index, 10) * 2.4;
    }

    geometry.setAttribute("position", new Float32BufferAttribute(origins, 3));
    geometry.setAttribute("origin", new Float32BufferAttribute(origins, 3));
    geometry.setAttribute("velocity", new Float32BufferAttribute(velocities, 3));
    geometry.setAttribute("landingTime", new Float32BufferAttribute(landingTimes, 1));
    geometry.setAttribute("particleSize", new Float32BufferAttribute(particleSizes, 1));
    geometry.setAttribute("spawnDelay", new Float32BufferAttribute(spawnDelays, 1));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return { geometry };
  }, [particleCount, seed, settled]);
  const startedAt = useRef<number | null>(settled ? 0 : null);
  const materialRef = useRef<ShaderMaterial>(null);

  useEffect(() => () => particleSystem.geometry.dispose(), [particleSystem]);

  useFrame(({ clock }) => {
    if (startedAt.current === null) {
      startedAt.current = clock.getElapsedTime();
    }

    if (materialRef.current) {
      materialRef.current.uniforms.elapsed.value = Math.min(
        CONFETTI_DURATION_SECONDS,
        clock.getElapsedTime() - startedAt.current,
      );
    }
  });

  return (
    <points frustumCulled={false} geometry={particleSystem.geometry}>
      <shaderMaterial
        depthWrite={false}
        transparent
        fragmentShader={
          "varying vec3 vColor; void main() { float angle = vColor.r * 6.2831853 + vColor.g * 2.1; float c = cos(angle); float s = sin(angle); vec2 p = gl_PointCoord - vec2(0.5); p = mat2(c, -s, s, c) * p; vec2 halfSize = vec2(0.34, 0.115); vec2 edge = abs(p) - halfSize; float distanceToPaper = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0); float alpha = 1.0 - smoothstep(0.008, 0.036, distanceToPaper); if (alpha < 0.02) discard; float highlight = 0.84 + 0.16 * smoothstep(-halfSize.y, halfSize.y, p.y); gl_FragColor = vec4(vColor * highlight, alpha * 0.96); }"
        }
        ref={materialRef}
        uniforms={{
          elapsed: { value: 0 },
          modelPosition: { value: new Vector3(...POKEDEX_MODEL_POSITION) },
          modelRotationY: { value: POKEDEX_MODEL_ROTATION_Y },
          modelScale: { value: POKEDEX_MODEL_SCALE },
          casingMin: { value: new Vector3(...POKEDEX_CASING_BOUNDS.min) },
          casingMax: { value: new Vector3(...POKEDEX_CASING_BOUNDS.max) },
        }}
        vertexShader={
          "attribute vec3 origin; attribute vec3 velocity; attribute vec3 color; attribute float landingTime; attribute float particleSize; attribute float spawnDelay; uniform float elapsed; uniform vec3 modelPosition; uniform float modelRotationY; uniform float modelScale; uniform vec3 casingMin; uniform vec3 casingMax; varying vec3 vColor; vec3 toLocal(vec3 worldPoint) { vec3 point = (worldPoint - modelPosition) / modelScale; float c = cos(-modelRotationY); float s = sin(-modelRotationY); return vec3(c * point.x + s * point.z, point.y, -s * point.x + c * point.z); } vec3 toWorld(vec3 localPoint) { float c = cos(modelRotationY); float s = sin(modelRotationY); return modelPosition + modelScale * vec3(c * localPoint.x + s * localPoint.z, localPoint.y, -s * localPoint.x + c * localPoint.z); } void main() { float t = min(max(0.0, elapsed - spawnDelay), landingTime); vec3 worldPosition = origin + velocity * t; worldPosition.y = max(-3.64, origin.y + velocity.y * t - 2.4 * t * t); vec3 localPosition = toLocal(worldPosition); bool insideCasing = localPosition.x > casingMin.x && localPosition.x < casingMax.x && localPosition.y > casingMin.y && localPosition.y < casingMax.y && localPosition.z < casingMax.z && localPosition.z > casingMin.z - 2.5; if (insideCasing) { localPosition.z = casingMax.z + 0.025; localPosition.x += sin(origin.y * 17.0 + origin.z * 11.0) * 0.035; localPosition.y += cos(origin.x * 13.0 + origin.z * 7.0) * 0.022; worldPosition = toWorld(localPosition); } vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = clamp(15.0 * particleSize * (180.0 / -mvPosition.z), 3.0, 18.0); vColor = color; }"
        }
      />
    </points>
  );
}

useGLTF.preload("/Pokedex.glb");

function PokemonScanner({ onScan }: { onScan: (query: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<
    "requesting" | "scanning" | "error"
  >("requesting");
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream>(null);
  const animationFrameRef = useRef<number>(null);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const closeScanner = useCallback(() => {
    stopCamera();
    setIsOpen(false);
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function startScanner() {
      if (!window.BarcodeDetector) {
        setScannerStatus("error");
        setScannerMessage(
          "QR scanning is not available in this browser. Use the Pokemon search instead.",
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerStatus("error");
        setScannerMessage(
          "Camera access is not available here. Use the Pokemon search instead.",
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;

        if (!video) {
          stopCamera();
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (cancelled) {
          return;
        }

        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        setScannerStatus("scanning");
        setScannerMessage("Point the camera at a Pokemon QR code.");

        async function detectCode() {
          if (cancelled || !videoRef.current) {
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);

            for (const barcode of barcodes) {
              const query = getPokemonQueryFromScan(barcode.rawValue);

              if (query) {
                onScan(query);
                closeScanner();
                return;
              }
            }

            if (barcodes.length > 0) {
              setScannerMessage(
                "That code is not a Pokemon name, number, or PokeAPI link.",
              );
            }
          } catch {
            if (!cancelled) {
              stopCamera();
              setScannerStatus("error");
              setScannerMessage(
                "The camera code reader stopped working. Close this scanner and try again.",
              );
            }
            return;
          }

          animationFrameRef.current = window.requestAnimationFrame(detectCode);
        }

        animationFrameRef.current = window.requestAnimationFrame(detectCode);
      } catch (error) {
        if (cancelled) {
          return;
        }

        stopCamera();
        setScannerStatus("error");
        setScannerMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access or use the Pokemon search."
            : "Could not start the camera. Use the Pokemon search instead.",
        );
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [closeScanner, isOpen, onScan, stopCamera]);

  return (
    <>
      <div className="scanner-actions">
        <button
          className="scan-button"
          onClick={() => {
            setScannerStatus("requesting");
            setScannerMessage("Requesting camera access...");
            setIsOpen(true);
          }}
          type="button"
        >
          Scan Pokecode
        </button>
        <p className="scanner-help">
          Reads a QR code with a Pokemon name or number. It does not visually
          recognize Pokemon.
        </p>
      </div>

      {isOpen ? (
        <div className="scanner-backdrop">
          <section
            aria-labelledby="scanner-title"
            aria-modal="true"
            className="scanner-dialog"
            role="dialog"
          >
            <div className="scanner-heading">
              <div>
                <p className="eyebrow">Camera scanner</p>
                <h2 id="scanner-title">Scan a Pokecode</h2>
              </div>
              <button
                aria-label="Close scanner"
                className="scanner-close"
                onClick={closeScanner}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="camera-frame">
              <video
                aria-label="Camera preview"
                className="camera-preview"
                muted
                playsInline
                ref={videoRef}
              />
              {scannerStatus !== "scanning" ? (
                <div className="camera-placeholder">
                  {scannerStatus === "requesting"
                    ? "Starting camera..."
                    : "Camera unavailable"}
                </div>
              ) : null}
              {scannerStatus === "scanning" ? (
                <div aria-hidden="true" className="scan-target" />
              ) : null}
            </div>

            <p
              aria-live="polite"
              className={`scanner-status ${
                scannerStatus === "error" ? "error" : ""
              }`}
            >
              {scannerMessage}
            </p>
            <p className="scanner-format">
              Supported QR contents: <code>pikachu</code>, <code>25</code>, or a
              PokeAPI Pokemon URL.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}

function App() {
  const initialMode = getSavedAppMode();
  const [selectedGenerations, setSelectedGenerations] = useState<number[]>(
    getSavedGameGenerations,
  );
  const [savedRecentGamePokemonIds] = useState<number[]>(
    getSavedRecentGamePokemonIds,
  );
  const [mode, setMode] = useState<AppMode>(initialMode);
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [initialGamePokemonId] = useState<number | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState(
    initialGamePokemonId ? String(initialGamePokemonId) : INITIAL_QUERY,
  );
  const [guess, setGuess] = useState("");
  const [roundResult, setRoundResult] = useState<RoundResult>("guessing");
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [gameStats, setGameStats] = useState<GameStats>(() => ({
    score: getSavedGameScore(),
    streak: 0,
    correctAnswers: 0,
  }));
  const [capturedPokemonIds, setCapturedPokemonIds] = useState<Set<number>>(
    getSavedCapturedPokemonIds,
  );
  const [shinyCapturedPokemonIds, setShinyCapturedPokemonIds] = useState<Set<number>>(
    getSavedShinyCapturedPokemonIds,
  );
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [companionPokemonId, setCompanionPokemonId] = useState<number | null>(() => {
    const savedId = Number(window.localStorage.getItem(COMPANION_POKEMON_STORAGE_KEY));
    return Number.isInteger(savedId) && savedId >= 1 && savedId <= GAME_POKEMON_COUNT ? savedId : null;
  });
  const [nextRoundSeconds, setNextRoundSeconds] = useState<number | null>(null);
  const [roundSecondsRemaining, setRoundSecondsRemaining] = useState(
    ROUND_TIME_LIMIT_SECONDS,
  );
  const [roundElapsedSeconds, setRoundElapsedSeconds] = useState(0);
  const [completedRounds, setCompletedRounds] = useState(getSavedCompletedRounds);
  const [walletRewardMessage, setWalletRewardMessage] = useState("");
  const [ownedSkins, setOwnedSkins] = useState<Set<PokedexSkinId>>(
    () => getSavedOwnedSkins(),
  );
  const [equippedSkin, setEquippedSkin] = useState<PokedexSkinId>(() => (window.localStorage.getItem(POKEDEX_EQUIPPED_SKIN_STORAGE_KEY) as PokedexSkinId) || "classic");
  const [hasUncaughtRadar, setHasUncaughtRadar] = useState(() => window.localStorage.getItem(UNCAUGHT_RADAR_STORAGE_KEY) === "true");
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [nameRevealLevel, setNameRevealLevel] = useState(getSavedNameRevealLevel);
  const [hasBoughtExtraTime, setHasBoughtExtraTime] = useState(false);
  const [confettiLevel, setConfettiLevel] = useState(getSavedConfettiLevel);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiEventId, setConfettiEventId] = useState(0);
  const [settledConfetti, setSettledConfetti] = useState<
    Array<{ id: number; level: number }>
  >([]);
  const [showShinyCelebration, setShowShinyCelebration] = useState(false);
  const [isShinyRound, setIsShinyRound] = useState(
    () => initialMode === "game" && Math.random() < SHINY_ROUND_CHANCE,
  );
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "waiting" | "listening" | "unsupported" | "error"
  >("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isIntroMuted, setIsIntroMuted] = useState(
    () => window.localStorage.getItem(INTRO_MUTED_STORAGE_KEY) === "true",
  );
  const [voicePokemonIndex, setVoicePokemonIndex] = useState<
    VoicePokemonCandidate[]
  >([]);
  const [isCryComplete, setIsCryComplete] = useState(false);
  const guessInputRef = useRef<HTMLInputElement>(null);
  const guessRef = useRef("");
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const hasCountedCurrentRoundRef = useRef(false);
  const hasInitializedGameRef = useRef(false);
  const confettiLevelRef = useRef(confettiLevel);
  const recentGamePokemonIdsRef = useRef<number[]>(
    initialGamePokemonId
      ? rememberGamePokemonId(savedRecentGamePokemonIds, initialGamePokemonId)
      : savedRecentGamePokemonIds,
  );
  const [pokemonState, setPokemonState] = useState<PokemonState>({
    status: "loading",
    pokemon: null,
    error: "",
    query: "",
  });

  const startNewRound = useCallback((generationIds = selectedGenerations) => {
    setGuess("");
    guessRef.current = "";
    setRoundResult("guessing");
    setIsGamePaused(false);
    setNextRoundSeconds(null);
    setRoundSecondsRemaining(ROUND_TIME_LIMIT_SECONDS);
    const selectedIds = getPokemonIdsForGenerations(generationIds);
    const hasUncaughtEligiblePokemon = selectedIds.some(
      (pokemonId) => !capturedPokemonIds.has(pokemonId),
    );
    if (hasUncaughtRadar && !hasUncaughtEligiblePokemon) {
      setWalletRewardMessage("Radar: all selected Pokémon are already captured. Choose more generations.");
      return;
    }
    const nextPokemonId = getRandomGamePokemonId(
      generationIds,
      recentGamePokemonIdsRef.current,
      hasUncaughtRadar ? capturedPokemonIds : undefined,
    );
    recentGamePokemonIdsRef.current = rememberGamePokemonId(
      recentGamePokemonIdsRef.current,
      nextPokemonId,
    );
    saveRecentGamePokemonIds(recentGamePokemonIdsRef.current);
    setSubmittedQuery(String(nextPokemonId));
    setIsIntroComplete(false);
    setIsCryComplete(false);
    setIsHintVisible(false);
    setRoundElapsedSeconds(0);
    hasCountedCurrentRoundRef.current = false;
    setHasBoughtExtraTime(false);
    setIsShinyRound(Math.random() < SHINY_ROUND_CHANCE);
  }, [capturedPokemonIds, hasUncaughtRadar, selectedGenerations]);

  useEffect(() => {
    if (mode === "game" && !hasInitializedGameRef.current) {
      hasInitializedGameRef.current = true;
      startNewRound();
    }
  }, [mode, startNewRound]);

  useEffect(() => {
    saveRecentGamePokemonIds(recentGamePokemonIdsRef.current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVoicePokemonIndex() {
      try {
        const response = await fetch(
          `https://pokeapi.co/api/v2/pokemon?limit=${GAME_POKEMON_COUNT}&offset=0`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to load Pokemon names.");
        }

        const data = (await response.json()) as { results: PokemonIndexEntry[] };
        setVoicePokemonIndex(
          data.results.map((pokemon, index) => ({ ...pokemon, id: index + 1 })),
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setVoicePokemonIndex([]);
        }
      }
    }

    void loadVoicePokemonIndex();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(GAME_SCORE_STORAGE_KEY, String(gameStats.score));
  }, [gameStats.score]);

  useEffect(() => {
    window.localStorage.setItem(
      GAME_GENERATIONS_STORAGE_KEY,
      JSON.stringify(selectedGenerations),
    );
  }, [selectedGenerations]);

  useEffect(() => {
    window.localStorage.setItem(
      CAPTURED_POKEMON_STORAGE_KEY,
      JSON.stringify([...capturedPokemonIds].sort((left, right) => left - right)),
    );
  }, [capturedPokemonIds]);

  useEffect(() => {
    window.localStorage.setItem(
      SHINY_CAPTURED_POKEMON_STORAGE_KEY,
      JSON.stringify(
        [...shinyCapturedPokemonIds].sort((left, right) => left - right),
      ),
    );
  }, [shinyCapturedPokemonIds]);

  useEffect(() => {
    confettiLevelRef.current = confettiLevel;
    window.localStorage.setItem(
      CONFETTI_UPGRADE_STORAGE_KEY,
      String(confettiLevel),
    );
  }, [confettiLevel]);

  // Settled confetti deliberately lives only for the current session. Persisting it
  // made a reload reconstruct old bursts before the player had answered correctly.
  useEffect(() => {
    window.localStorage.removeItem("pokedex:settled-confetti");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(NAME_REVEAL_UPGRADE_STORAGE_KEY, String(nameRevealLevel));
  }, [nameRevealLevel]);

  useEffect(() => {
    window.localStorage.setItem(COMPLETED_ROUNDS_STORAGE_KEY, String(completedRounds));
  }, [completedRounds]);
  useEffect(() => { window.localStorage.setItem(POKEDEX_SKINS_STORAGE_KEY, JSON.stringify([...ownedSkins])); }, [ownedSkins]);
  useEffect(() => { window.localStorage.setItem(POKEDEX_EQUIPPED_SKIN_STORAGE_KEY, equippedSkin); }, [equippedSkin]);
  useEffect(() => {
    if (companionPokemonId === null) window.localStorage.removeItem(COMPANION_POKEMON_STORAGE_KEY);
    else window.localStorage.setItem(COMPANION_POKEMON_STORAGE_KEY, String(companionPokemonId));
  }, [companionPokemonId]);
  useEffect(() => { window.localStorage.setItem(UNCAUGHT_RADAR_STORAGE_KEY, String(hasUncaughtRadar)); }, [hasUncaughtRadar]);
  useEffect(() => { window.localStorage.setItem(INTRO_MUTED_STORAGE_KEY, String(isIntroMuted)); }, [isIntroMuted]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPokemon() {
      const normalizedQuery = submittedQuery.trim().toLowerCase();

      if (!normalizedQuery) {
        setPokemonState({
          status: "error",
          pokemon: null,
          error: "Enter a Pokemon name or number.",
          query: "",
        });
        return;
      }

      setPokemonState({ status: "loading", pokemon: null, error: "", query: "" });

      try {
        const response = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(
            normalizedQuery,
          )}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Pokemon not found.");
        }

        const pokemon = (await response.json()) as Pokemon;

        let flavorText = FLAVOR_TEXT_FALLBACK;
        let habitat = "rare";

        try {
          const speciesResponse = await fetch(pokemon.species.url, {
            signal: controller.signal,
          });

          if (speciesResponse.ok) {
            const species = (await speciesResponse.json()) as PokemonSpecies;
            flavorText = getEnglishFlavorText(species);
            habitat = species.habitat?.name ?? "rare";
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
        }

        setPokemonState({
          status: "ready",
          pokemon,
          flavorText,
          habitat,
          error: "",
          query: normalizedQuery,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPokemonState({
          status: "error",
          pokemon: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load that Pokemon.",
          query: "",
        });
      }
    }

    loadPokemon();

    return () => controller.abort();
  }, [submittedQuery]);

  useEffect(() => {
    if (
      mode !== "game" || isGamePaused ||
      roundResult !== "guessing" ||
      pokemonState.status !== "ready" ||
      pokemonState.query !== submittedQuery.trim().toLowerCase()
    ) {
      return;
    }

    if (!isIntroComplete) {
      return;
    }

    const cryUrl = pokemonState.pokemon.cries.latest ?? pokemonState.pokemon.cries.legacy;

    if (!cryUrl) {
      const completeWithoutCry = window.setTimeout(
        () => setIsCryComplete(true),
        0,
      );
      return () => window.clearTimeout(completeWithoutCry);
    }

    const cry = new Audio(cryUrl);
    const finishCry = () => setIsCryComplete(true);
    cry.addEventListener("ended", finishCry, { once: true });
    cry.addEventListener("error", finishCry, { once: true });
    cry.play().catch(finishCry);

    return () => {
      cry.removeEventListener("ended", finishCry);
      cry.removeEventListener("error", finishCry);
      cry.pause();
      cry.currentTime = 0;
    };
  }, [isGamePaused, isIntroComplete, mode, pokemonState, roundResult, submittedQuery]);

  const isGameRoundRevealed =
    roundResult !== "guessing";
  const introPlaybackKey =
    mode === "game" &&
    roundResult === "guessing" &&
    pokemonState.status === "ready" &&
    pokemonState.query === submittedQuery.trim().toLowerCase()
      ? `${pokemonState.pokemon.id}:${pokemonState.query}`
      : null;

  useEffect(() => {
    if (mode !== "game" || !isGameRoundRevealed) {
      return;
    }

    const kickoff = window.setTimeout(
      () => setNextRoundSeconds(NEXT_ROUND_DELAY_SECONDS),
      0,
    );
    const interval = window.setInterval(() => {
      setNextRoundSeconds((seconds) =>
        seconds === null || seconds <= 1 ? 1 : seconds - 1,
      );
    }, 1000);
    const timeout = window.setTimeout(() => {
      setGuess("");
      guessRef.current = "";
      setNextRoundSeconds(null);
      startNewRound();
    }, NEXT_ROUND_DELAY_SECONDS * 1_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.clearTimeout(kickoff);
    };
  }, [isGameRoundRevealed, isGamePaused, mode, startNewRound]);

  useEffect(() => {
    if (
      mode !== "game" || isGamePaused ||
      roundResult !== "guessing" ||
      pokemonState.status !== "ready" ||
      pokemonState.query !== submittedQuery.trim().toLowerCase()
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setRoundSecondsRemaining((seconds) => Math.max(0, seconds - 1));
      setRoundElapsedSeconds((seconds) => seconds + 1);
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isGamePaused, mode, pokemonState, roundResult, submittedQuery, roundSecondsRemaining]);

  useEffect(() => {
    if (
      mode !== "game" ||
      roundResult !== "guessing" ||
      pokemonState.status !== "ready" ||
      roundSecondsRemaining > 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRoundResult("timed-out");
      setGameStats((currentStats) => ({ ...currentStats, streak: 0 }));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [mode, pokemonState, roundResult, roundSecondsRemaining]);

  useEffect(() => {
    if (roundResult === "guessing" || hasCountedCurrentRoundRef.current) return;
    hasCountedCurrentRoundRef.current = true;
    const timeout = window.setTimeout(() => {
      setCompletedRounds((currentRounds) => {
        const nextRounds = currentRounds + 1;
        setGameStats((currentStats) => ({ ...currentStats, score: currentStats.score + 10_000 }));
        setWalletRewardMessage("Round complete! +10,000 wallet points.");
        return nextRounds;
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [roundResult]);

  useEffect(() => {
    if (
      mode === "game" &&
      roundResult === "guessing" &&
      pokemonState.status === "ready"
    ) {
      guessInputRef.current?.focus();
    }
  }, [mode, pokemonState, roundResult]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const currentPokemonIsCaptured =
    pokemonState.status === "ready" &&
    capturedPokemonIds.has(pokemonState.pokemon.id);
  const currentPokemonWasCapturedShiny =
    pokemonState.status === "ready" &&
    shinyCapturedPokemonIds.has(pokemonState.pokemon.id);
  // A caught shiny remains a shiny entry everywhere the player sees that
  // Pokémon. A newly rolled shiny still takes priority for the live round.
  const shouldDisplayShiny = isShinyRound || currentPokemonWasCapturedShiny;
  const isCurrentGamePokemonConcealed =
    mode === "game" && !isGameRoundRevealed && !currentPokemonIsCaptured;
  const spriteUrl =
    pokemonState.status === "ready"
      ? shouldDisplayShiny
        ? getShinySpriteUrl(pokemonState.pokemon.id)
        : getSpriteUrl(pokemonState.pokemon.id)
      : null;
  const animatedSpriteUrl =
    pokemonState.status === "ready"
      ? shouldDisplayShiny
        ? getAnimatedShinySpriteUrl(pokemonState.pokemon.id)
        : getAnimatedSpriteUrl(pokemonState.pokemon.id)
      : null;
  const typeNames = useMemo(
    () =>
      pokemonState.status === "ready"
        ? pokemonState.pokemon.types
            .slice()
            .sort((left, right) => left.slot - right.slot)
            .map((pokemonType) => pokemonType.type.name)
        : ["normal"],
    [pokemonState],
  );
  const habitat =
    pokemonState.status === "ready" ? pokemonState.habitat : "rare";
  const isEvening = isEveningLocally();
  const isNightEnvironment =
    isEvening ||
    typeNames.some((typeName) =>
      ["dark", "ghost", "dragon", "poison", "psychic"].includes(typeName),
    );
  const flavorText =
    pokemonState.status === "ready" &&
    (mode === "lookup" || isGameRoundRevealed)
      ? pokemonState.flavorText
      : null;
  const pokemonLabel =
    pokemonState.status === "ready"
      ? isCurrentGamePokemonConcealed
        ? "Mystery Pokemon"
        : `#${pokemonState.pokemon.id} ${formatPokemonName(pokemonState.pokemon.name)}`
      : pokemonState.status === "loading"
        ? "Loading Pokemon"
        : "No Pokemon loaded";
  const switchMode = (nextMode: AppMode) => {
    setMode(nextMode);

    if (nextMode === "game") {
      startNewRound();
      return;
    }

    setSubmittedQuery(query);
  };
  const toggleGeneration = (generationId: number) => {
    const isSelected = selectedGenerations.includes(generationId);

    if (isSelected && selectedGenerations.length === 1) {
      return;
    }

    const nextGenerations = isSelected
      ? selectedGenerations.filter((selectedId) => selectedId !== generationId)
      : [...selectedGenerations, generationId].sort((left, right) => left - right);

    setSelectedGenerations(nextGenerations);
  };
  const submitGuess = useCallback((submittedGuess = guessRef.current) => {
    if (isGamePaused || pokemonState.status !== "ready" || !submittedGuess.trim()) {
      return;
    }

    const isCorrect =
      normalizePokemonName(submittedGuess) ===
      normalizePokemonName(pokemonState.pokemon.name);

    setRoundResult(isCorrect ? "correct" : "incorrect");
    if (isCorrect) {
      playCorrectJingle();
      if (isShinyRound) {
        playShinyFlourish();
        setShowShinyCelebration(true);
        window.setTimeout(() => setShowShinyCelebration(false), 1_900);
      }
      setOwnedSkins((currentSkins) => {
        const unownedSkins = POKEDEX_SKINS.filter((skin) => !currentSkins.has(skin.id));
        if (unownedSkins.length === 0) return currentSkins;
        const totalWeight = unownedSkins.reduce((sum, skin) => sum + skin.weight, 0);
        let roll = Math.random() * totalWeight;
        const reward = unownedSkins.find((skin) => (roll -= skin.weight) <= 0) ?? unownedSkins[0];
        setWalletRewardMessage(`${reward.rarity} skin unlocked: ${reward.label}!`);
        return new Set([...currentSkins, reward.id]);
      });
      if (confettiLevel > 0) {
        const burstId = Date.now();
        setConfettiEventId(burstId);
        setShowConfetti(true);
        window.setTimeout(() => {
          setShowConfetti(false);
          setSettledConfetti((current) => [
            ...current,
            { id: burstId, level: confettiLevel },
          ]);
        }, 5_000);
      }
      setCapturedPokemonIds((currentCaptures) => {
        if (currentCaptures.has(pokemonState.pokemon.id)) {
          return currentCaptures;
        }

        const nextCaptures = new Set(currentCaptures);
        nextCaptures.add(pokemonState.pokemon.id);
        return nextCaptures;
      });
      if (isShinyRound) {
        setShinyCapturedPokemonIds((currentShinyCaptures) => {
          if (currentShinyCaptures.has(pokemonState.pokemon.id)) {
            return currentShinyCaptures;
          }

          const nextShinyCaptures = new Set(currentShinyCaptures);
          nextShinyCaptures.add(pokemonState.pokemon.id);
          return nextShinyCaptures;
        });
      }
    } else {
      playIncorrectBuzz();
    }
    setGameStats((currentStats) => {
      if (!isCorrect) {
        return { ...currentStats, streak: 0 };
      }

      const nextStreak = currentStats.streak + 1;
      const roundPoints = Math.ceil(
        (MAX_ROUND_POINTS * roundSecondsRemaining) / ROUND_TIME_LIMIT_SECONDS,
      ) * (isShinyRound ? 2 : 1);

      return {
        score: currentStats.score + roundPoints * nextStreak,
        streak: nextStreak,
        correctAnswers: currentStats.correctAnswers + 1,
      };
    });
  }, [confettiLevel, isGamePaused, isShinyRound, pokemonState, roundSecondsRemaining]);
  const buyExtraTime = () => {
    if (
      hasBoughtExtraTime ||
      roundResult !== "guessing" ||
      pokemonState.status !== "ready" ||
      gameStats.score < EXTRA_TIME_HINT_COST
    ) {
      return;
    }

    setGameStats((currentStats) => ({
      ...currentStats,
      score: currentStats.score - EXTRA_TIME_HINT_COST,
    }));
    setRoundSecondsRemaining((seconds) => seconds + EXTRA_TIME_SECONDS);
    setHasBoughtExtraTime(true);
  };
  const skipPokemon = () => {
    if (
      roundResult !== "guessing" ||
      pokemonState.status !== "ready" ||
      gameStats.score < SKIP_POKEMON_COST
    ) {
      return;
    }

    setGameStats((currentStats) => ({
      ...currentStats,
      score: currentStats.score - SKIP_POKEMON_COST,
      streak: 0,
    }));
    setWalletRewardMessage(`Skipped this Pokémon for ${SKIP_POKEMON_COST} points.`);
    startNewRound();
  };
  const buyConfettiUpgrade = () => {
    if (
      confettiLevel >= CONFETTI_MAX_LEVEL ||
      gameStats.score < CONFETTI_UPGRADE_COST
    ) {
      return;
    }

    setGameStats((currentStats) => ({
      ...currentStats,
      score: currentStats.score - CONFETTI_UPGRADE_COST,
    }));
    setConfettiLevel((currentLevel) => {
      const nextLevel = Math.min(
        CONFETTI_MAX_LEVEL,
        Math.max(currentLevel, confettiLevelRef.current) + 1,
      );
      confettiLevelRef.current = nextLevel;
      window.localStorage.setItem(
        CONFETTI_UPGRADE_STORAGE_KEY,
        String(nextLevel),
      );
      return nextLevel;
    });
  };
  const buyNameRevealUpgrade = () => {
    if (nameRevealLevel >= NAME_REVEAL_MAX_LEVEL || gameStats.score < NAME_REVEAL_UPGRADE_COST) return;
    setGameStats((currentStats) => ({ ...currentStats, score: currentStats.score - NAME_REVEAL_UPGRADE_COST }));
    setNameRevealLevel((currentLevel) => currentLevel + 1);
  };
  const buyOrEquipSkin = (skinId: PokedexSkinId) => {
    if (ownedSkins.has(skinId)) { setEquippedSkin(skinId); return; }
    const skin = POKEDEX_SKIN_BY_ID.get(skinId);
    if (!skin) return;
    const cost = SKIN_PURCHASE_COSTS[skin.rarity];
    if (gameStats.score < cost) return;
    setGameStats((stats) => ({ ...stats, score: stats.score - cost }));
    setOwnedSkins((skins) => new Set([...skins, skinId]));
    setEquippedSkin(skinId);
  };
  const buyUncaughtRadar = () => {
    if (hasUncaughtRadar || gameStats.score < UNCAUGHT_RADAR_COST) return;
    setGameStats((stats) => ({ ...stats, score: stats.score - UNCAUGHT_RADAR_COST }));
    setHasUncaughtRadar(true);
  };
  const selectedVoicePokemonCandidates = useMemo(() => {
    const selectedIds = new Set(getPokemonIdsForGenerations(selectedGenerations));
    return voicePokemonIndex.filter((pokemon) => selectedIds.has(pokemon.id));
  }, [selectedGenerations, voicePokemonIndex]);
  const canListenForVoiceGuess =
    mode === "game" &&
    !isGamePaused &&
    roundResult === "guessing" &&
    pokemonState.status === "ready" &&
    isIntroComplete &&
    isCryComplete;
  const startVoiceGuess = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceStatus("unsupported");
      setVoiceMessage("Voice guesses are not supported in this browser.");
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    // English Pokemon names are recognized most reliably with an English model.
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript.trim() ?? "";

      if (!transcript) {
        return;
      }

      setGuess(transcript);
      guessRef.current = transcript;

      if (result.isFinal) {
        const match = findVoicePokemonMatch(
          transcript,
          selectedVoicePokemonCandidates,
        );

        if (!match) {
          setVoiceStatus("listening");
          setVoiceMessage(`Heard “${transcript}”. Try saying a Pokemon name again.`);
          return;
        }

        const matchedName = formatPokemonName(match.name);
        setGuess(matchedName);
        guessRef.current = matchedName;
        setVoiceStatus("waiting");
        setVoiceMessage(`Heard ${matchedName}. Sending guess…`);
        recognition.stop();
        submitGuess(matchedName);
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === "not-allowed") {
        setVoiceEnabled(false);
      }
      setVoiceStatus(event.error === "not-allowed" ? "error" : "idle");
      setVoiceMessage(
        event.error === "not-allowed"
          ? "Microphone permission was not granted."
          : "Could not hear a guess. Try again.",
      );
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setVoiceStatus((currentStatus) =>
        currentStatus === "listening" ? "idle" : currentStatus,
      );
    };

    try {
      recognition.start();
      setVoiceStatus("listening");
      setVoiceMessage("Listening for a Pokemon name…");
    } catch {
      setVoiceStatus("error");
      setVoiceMessage("Voice guessing could not start. Try again.");
    }
  }, [selectedVoicePokemonCandidates, submitGuess]);
  const toggleVoiceGuess = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setVoiceStatus("idle");
      setVoiceMessage("Voice guesses are paused.");
      return;
    }

    setVoiceEnabled(true);
    if (canListenForVoiceGuess) {
      startVoiceGuess();
    } else {
      setVoiceStatus("waiting");
      setVoiceMessage("Now you wait — the Pokemon intro is playing.");
    }
  };
  useEffect(() => {
    if (!voiceEnabled) {
      return;
    }

    if (!canListenForVoiceGuess) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      const showWaitingState = window.setTimeout(() => {
        setVoiceStatus("waiting");
        setVoiceMessage("Now you wait — the Pokemon intro and cry are playing.");
      }, 0);
      return () => window.clearTimeout(showWaitingState);
    }

    if (!recognitionRef.current) {
      startVoiceGuess();
    }
  }, [canListenForVoiceGuess, startVoiceGuess, voiceEnabled]);
  const loadPokemonByOffset = (delta: -1 | 1) => {
    const fallbackId = Number.parseInt(submittedQuery, 10);
    const currentId =
      pokemonState.status === "ready"
        ? pokemonState.pokemon.id
        : Number.isNaN(fallbackId)
          ? Number.parseInt(INITIAL_QUERY, 10)
          : fallbackId;
    const nextQuery = String(Math.max(1, currentId + delta));

    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
  };
  const loadScannedPokemon = useCallback((scannedQuery: string) => {
    setQuery(scannedQuery);
    setSubmittedQuery(scannedQuery);
  }, []);
  const selectedPokemonIds = useMemo(
    () => getPokemonIdsForGenerations(selectedGenerations),
    [selectedGenerations],
  );
  const capturedPokemonCount = capturedPokemonIds.size;
  const selectedCapturedPokemonCount = selectedPokemonIds.filter((pokemonId) =>
    capturedPokemonIds.has(pokemonId),
  ).length;
  const capturedPokemonPercentage =
    (selectedCapturedPokemonCount / selectedPokemonIds.length) * 100;
  const equippedSkinDefinition = POKEDEX_SKIN_BY_ID.get(equippedSkin) ?? POKEDEX_SKIN_BY_ID.get("classic")!;
  const selectedGenerationLabel = GAME_GENERATIONS.filter((generation) =>
    selectedGenerations.includes(generation.id),
  )
    .map((generation) => generation.label)
    .join(" + ");
  const timedRevealAmount =
    mode === "game" &&
    roundResult === "guessing"
      ? (ROUND_TIME_LIMIT_SECONDS - roundSecondsRemaining) /
        ROUND_TIME_LIMIT_SECONDS
      : 0;
  const silhouetteRevealAmount = Math.max(
    isHintVisible ? 0.1 : 0,
    timedRevealAmount,
  );
  const maskedPokemonName =
    pokemonState.status === "ready"
      ? maskPokemonName(
          pokemonState.pokemon.name,
          isGameRoundRevealed
            ? pokemonState.pokemon.name.replace(/[^a-z]/gi, "").length
            : nameRevealLevel === 0
              ? 0
              : Math.min(
                pokemonState.pokemon.name.replace(/[^a-z]/gi, "").length - 1,
                Math.max(0, roundElapsedSeconds - 10),
              ),
        )
      : "";

  return (
    <>
      <WhosThatPokemonIntro
        isMuted={isIntroMuted}
        onComplete={() => setIsIntroComplete(true)}
        playbackKey={introPlaybackKey}
      />
      {showShinyCelebration ? (
        <div aria-hidden="true" className="shiny-fireworks">
          {Array.from({ length: 42 }, (_, index) => (
            <span key={index} style={{ "--firework-index": index } as CSSProperties} />
          ))}
        </div>
      ) : null}
      {isShinyRound && isGameRoundRevealed ? (
        <div aria-hidden="true" className="shiny-orbit">
          {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
        </div>
      ) : null}
      <main
        className={`pokedex-app skin-${equippedSkin}${showShinyCelebration ? " is-shaking" : ""}`}
        style={{
          "--skin-hue": equippedSkinDefinition.hue,
          "--skin-saturation": `${equippedSkinDefinition.saturation}%`,
          "--skin-lightness": `${equippedSkinDefinition.lightness}%`,
        } as CSSProperties}
      >
      <section className="viewer-shell" aria-label="Interactive Pokedex model">
        <Canvas shadows camera={VIEWER_CAMERA}>
          <color attach="background" args={[isNightEnvironment ? "#141b36" : "#8fc8ec"]} />
          <ambientLight intensity={isNightEnvironment ? 0.75 : 1.35} />
          <directionalLight
            castShadow
            color={isNightEnvironment ? "#efab72" : "#ffffff"}
            position={isNightEnvironment ? [-5, 1, 3] : [4, 4, 3]}
            intensity={isNightEnvironment ? 1.8 : 2.4}
          />
          <directionalLight
            color={isNightEnvironment ? "#6f89d9" : "#ffffff"}
            position={[-3, 2, -4]}
            intensity={isNightEnvironment ? 0.65 : 0.9}
          />
          <Suspense fallback={null}>
            {settledConfetti.map((burst) => (
              <WorldConfetti
                key={`settled-confetti-${burst.id}`}
                level={burst.level}
                seed={burst.id}
                settled
              />
            ))}
            {showConfetti ? (
              <WorldConfetti
                key={`world-confetti-${confettiLevel}-${confettiEventId}`}
                level={confettiLevel}
                seed={confettiEventId}
              />
            ) : null}
            <ScanEnvironment
              animatedSpriteUrl={animatedSpriteUrl}
              concealed={mode === "game" && !isGameRoundRevealed}
              habitat={habitat}
              isEvening={isEvening}
              key={
                `${mode === "game" && !isGameRoundRevealed ? "scan-target-silhouette" : "scan-target-visible"}-${animatedSpriteUrl ?? spriteUrl ?? "fallback"}`
              }
              spriteUrl={spriteUrl}
              typeNames={typeNames}
            />
            <PokedexModel
              animatedSpriteUrl={animatedSpriteUrl}
              concealed={isCurrentGamePokemonConcealed}
              flavorText={flavorText}
              revealAmount={silhouetteRevealAmount}
              skin={equippedSkin}
              showShinyIndicator={
                isCurrentGamePokemonConcealed && isShinyRound
              }
              onDPadStep={
                mode === "lookup" ? loadPokemonByOffset : () => startNewRound()
              }
              spriteUrl={spriteUrl}
              typeNames={typeNames}
            />
            {companionPokemonId !== null ? <CompanionPokemon pokemonId={companionPokemonId} shiny={shinyCapturedPokemonIds.has(companionPokemonId)} /> : null}
          </Suspense>
          <OrbitControls
            enablePan={true}
            maxDistance={16.5}
            maxPolarAngle={Math.PI / 2}
            minDistance={2.5}
            minPolarAngle={Math.PI / 4}
            target={VIEWER_ORBIT_TARGET}
          />
        </Canvas>
      </section>

      <section className="control-panel" aria-label="Pokedex controls">
        <div className="mode-switch" aria-label="Pokedex mode">
          <button
            aria-pressed={mode === "lookup"}
            onClick={() => switchMode("lookup")}
            type="button"
          >
            Pokedex
          </button>
          <button
            aria-pressed={mode === "game"}
            onClick={() => switchMode("game")}
            type="button"
          >
            Who's That Pokemon?
          </button>
        </div>

        <div>
          <p className="eyebrow">
            {mode === "game"
              ? `${selectedGenerationLabel} guessing game`
              : "Three.js Pokedex POC"}
          </p>
          <h1>{pokemonLabel}</h1>
          {pokemonState.status === "error" ? (
            <p className="status error">{pokemonState.error}</p>
          ) : mode === "game" ? (
            <>
              <p
                aria-live="polite"
                className={`status game-result ${roundResult}`}
              >
                {roundResult === "correct" && pokemonState.status === "ready"
                  ? `Correct! It's ${formatPokemonName(pokemonState.pokemon.name)}. +${Math.ceil(
                      (MAX_ROUND_POINTS * roundSecondsRemaining) /
                        ROUND_TIME_LIMIT_SECONDS,
                    ) * (isShinyRound ? 2 : 1)}${isShinyRound ? " shiny bonus points!" : " points."}`
                  : roundResult === "incorrect" &&
                      pokemonState.status === "ready"
                    ? `Not quite. It's ${formatPokemonName(pokemonState.pokemon.name)}.`
                    : roundResult === "timed-out" &&
                        pokemonState.status === "ready"
                      ? `Time's up! It was ${formatPokemonName(pokemonState.pokemon.name)}. No points this round.`
                    : "Listen to the cry, then name the Pokemon hiding on the Pokedex screen."}
                {nextRoundSeconds !== null
                  ? ` Next round in ${nextRoundSeconds}s.`
                  : ""}
              </p>
              <dl className="game-stats" aria-label="Current game session score">
                <div>
                  <dt>Score</dt>
                  <dd>{gameStats.score}</dd>
                </div>
                <div>
                  <dt>Streak</dt>
                  <dd>{gameStats.streak}</dd>
                </div>
                <div>
                  <dt>Correct</dt>
                  <dd>{gameStats.correctAnswers}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{isGameRoundRevealed ? "—" : `${roundSecondsRemaining}s`}</dd>
                </div>
              </dl>
              <button className="hint-button" onClick={() => setIsGamePaused((paused) => !paused)} type="button">
                {isGamePaused ? "Resume round" : "Pause round"}
              </button>
              <button
                aria-label={isIntroMuted ? "Unmute Who's That Pokemon intro" : "Mute Who's That Pokemon intro"}
                aria-pressed={isIntroMuted}
                className="hint-button"
                onClick={() => setIsIntroMuted((muted) => !muted)}
                type="button"
              >
                {isIntroMuted ? "Unmute intro" : "Mute intro"}
              </button>
              {isGamePaused ? <p className="wallet-reward">Round paused — timer and guesses are frozen.</p> : null}
              {walletRewardMessage ? (
                <p aria-live="polite" className="wallet-reward">
                  {walletRewardMessage}
                </p>
              ) : null}
              <fieldset className="generation-picker">
                <legend>Generations — applies next round</legend>
                <div className="generation-picker-options">
                  {GAME_GENERATIONS.map((generation) => {
                    const isSelected = selectedGenerations.includes(generation.id);
                    const isOnlySelection =
                      isSelected && selectedGenerations.length === 1;

                    return (
                      <button
                        aria-pressed={isSelected}
                        disabled={isOnlySelection}
                        key={generation.id}
                        onClick={() => toggleGeneration(generation.id)}
                        type="button"
                      >
                        {generation.label.replace("Gen ", "")}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="game-utilities">
                <button className="hint-button" disabled={hasUncaughtRadar || gameStats.score < UNCAUGHT_RADAR_COST} onClick={buyUncaughtRadar} type="button">{hasUncaughtRadar ? "Uncaught Radar active" : `Buy Uncaught Radar (${UNCAUGHT_RADAR_COST} pts)`}</button>
                <div className="skin-shop" aria-label="Pokedex skin shop">
                  <div className="skin-shop-heading">
                    <strong>Pokédex skin collection</strong>
                    <span>{ownedSkins.size} / {POKEDEX_SKINS.length} unlocked</span>
                  </div>
                  <div aria-label={`${ownedSkins.size} of ${POKEDEX_SKINS.length} skins unlocked`} className="skin-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={POKEDEX_SKINS.length} aria-valuenow={ownedSkins.size}>
                    <span style={{ width: `${(ownedSkins.size / POKEDEX_SKINS.length) * 100}%` }} />
                  </div>
                  <p className="skin-shop-copy">Win correct rounds for weighted drops, or buy skins by rarity. Legendary skins cost {LEGENDARY_SKIN_COST} points.</p>
                  <details className="skin-catalog">
                    <summary>Browse all {POKEDEX_SKINS.length} skins</summary>
                    <div className="skin-grid">
                      {POKEDEX_SKINS.map((skin) => {
                        const owned = ownedSkins.has(skin.id);
                        const cost = SKIN_PURCHASE_COSTS[skin.rarity];
                        return <button aria-pressed={equippedSkin === skin.id} className={`skin-card rarity-${skin.rarity.toLowerCase()}${equippedSkin === skin.id ? " is-equipped" : ""}`} disabled={!owned && gameStats.score < cost} key={skin.id} onClick={() => buyOrEquipSkin(skin.id)} type="button">
                          <span className="skin-swatch" style={{ background: `hsl(${skin.hue} ${skin.saturation}% ${skin.lightness}%)` }} />
                          <span className="skin-card-name">{skin.label}</span>
                          <span className="skin-rarity">{skin.rarity}</span>
                          <span className="skin-card-action">{equippedSkin === skin.id ? "Equipped" : owned ? "Equip" : `${cost} pts`}</span>
                        </button>;
                      })}
                    </div>
                  </details>
                </div>
                <button
                  aria-haspopup="dialog"
                  aria-label={`Open captured Pokemon collection. ${selectedCapturedPokemonCount} of ${selectedPokemonIds.length} selected Pokemon caught, ${capturedPokemonCount} caught overall.`}
                  className="capture-progress"
                  onClick={() => setIsCollectionOpen(true)}
                  type="button"
                >
                  <div className="capture-progress-heading">
                    <span>Pokédex captured</span>
                    <strong>
                      {selectedCapturedPokemonCount} / {selectedPokemonIds.length}
                    </strong>
                  </div>
                  <div
                    aria-valuemax={selectedPokemonIds.length}
                    aria-valuemin={0}
                    aria-valuenow={selectedCapturedPokemonCount}
                    aria-valuetext={`${selectedCapturedPokemonCount} of ${selectedPokemonIds.length} selected Pokemon captured; ${capturedPokemonCount} total Pokemon captured`}
                    className="capture-progress-track"
                    role="progressbar"
                  >
                    <span
                      className="capture-progress-fill"
                      style={{ width: `${capturedPokemonPercentage}%` }}
                    />
                  </div>
                </button>
                <button
                  className="hint-button"
                  disabled={
                    pokemonState.status !== "ready" ||
                    isGameRoundRevealed ||
                    isHintVisible
                  }
                  onClick={() => setIsHintVisible(true)}
                  type="button"
                >
                  {isHintVisible ? "Free reveal used" : "Free hint: reveal 10%"}
                </button>
                <button
                  className="hint-button"
                  disabled={
                    pokemonState.status !== "ready" ||
                    isGameRoundRevealed ||
                    gameStats.score < SKIP_POKEMON_COST
                  }
                  onClick={skipPokemon}
                  type="button"
                >
                  Skip Pokémon ({SKIP_POKEMON_COST} pts)
                </button>
                <button
                  className="hint-button"
                  disabled={
                    nameRevealLevel >= NAME_REVEAL_MAX_LEVEL ||
                    gameStats.score < NAME_REVEAL_UPGRADE_COST
                  }
                  onClick={buyNameRevealUpgrade}
                  type="button"
                >
                  {nameRevealLevel >= NAME_REVEAL_MAX_LEVEL
                    ? "Name reveal maxed"
                    : `Name reveal Lv. ${nameRevealLevel} → ${nameRevealLevel + 1} (${NAME_REVEAL_UPGRADE_COST} pts)`}
                </button>
                <button
                  className="hint-button"
                  disabled={
                    pokemonState.status !== "ready" ||
                    isGameRoundRevealed ||
                    hasBoughtExtraTime ||
                    gameStats.score < EXTRA_TIME_HINT_COST
                  }
                  onClick={buyExtraTime}
                  type="button"
                >
                  {hasBoughtExtraTime
                    ? `+${EXTRA_TIME_SECONDS}s used`
                    : `Buy +${EXTRA_TIME_SECONDS}s (${EXTRA_TIME_HINT_COST} pts)`}
                </button>
                <button
                  className="hint-button"
                  disabled={
                    confettiLevel >= CONFETTI_MAX_LEVEL ||
                    gameStats.score < CONFETTI_UPGRADE_COST
                  }
                  onClick={buyConfettiUpgrade}
                  type="button"
                >
                  {confettiLevel >= CONFETTI_MAX_LEVEL
                    ? "Confetti maxed (1000)"
                    : `Confetti Lv. ${confettiLevel} → ${confettiLevel + 1} (${CONFETTI_UPGRADE_COST} pts)`}
                </button>
              </div>
              <p aria-live="polite" className="first-letter-hint">
                Name reveal: <strong>{maskedPokemonName}</strong>
              </p>
            </>
          ) : (
            <p className="status">
              Sprite fetched from PokeAPI and rendered on the model display.
            </p>
          )}
        </div>

        {mode === "lookup" ? (
          <>
            <form
              className="lookup-form"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmittedQuery(query);
              }}
            >
              <label htmlFor="pokemon-query">Pokemon</label>
              <div className="lookup-row">
                <input
                  id="pokemon-query"
                  name="pokemon"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="pikachu or 25"
                  spellCheck="false"
                  value={query}
                />
                <button type="submit">Load</button>
              </div>
            </form>
            <PokemonScanner onScan={loadScannedPokemon} />
          </>
        ) : (
          <form
            className="lookup-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (isGameRoundRevealed) {
                startNewRound();
                return;
              }

              submitGuess();
            }}
          >
              <label htmlFor="pokemon-guess">Your guess</label>
              <div className="lookup-row">
              <input
                autoComplete="off"
                disabled={
                  pokemonState.status !== "ready" || isGameRoundRevealed
                }
                id="pokemon-guess"
                name="guess"
                onChange={(event) => {
                  const nextGuess = event.target.value;
                  setGuess(nextGuess);
                  guessRef.current = nextGuess;
                }}
                placeholder="Who's that Pokemon?"
                ref={guessInputRef}
                spellCheck="false"
                value={guess}
              />
              <button
                disabled={
                  pokemonState.status !== "ready" ||
                  (!isGameRoundRevealed && !guess.trim())
                }
                type="submit"
              >
                {isGameRoundRevealed
                  ? `Next (${nextRoundSeconds ?? NEXT_ROUND_DELAY_SECONDS}s)`
                  : "Guess"}
              </button>
            </div>
            <div className="voice-guess-controls">
              <button
                aria-pressed={voiceEnabled}
                className="voice-guess-button"
                disabled={
                  pokemonState.status !== "ready"
                }
                onClick={toggleVoiceGuess}
                type="button"
              >
                {voiceEnabled
                  ? voiceStatus === "listening"
                    ? "Stop listening"
                    : "Stop voice guesses"
                  : "Listen"}
              </button>
              <span aria-live="polite" className="voice-guess-status">
                {voiceMessage ||
                  (voiceEnabled
                    ? "Now you wait — listening resumes after the intro and cry."
                    : "Listen once, then say a Pokemon name each round.")}
              </span>
            </div>
          </form>
        )}
      </section>
      </main>
      {isCollectionOpen ? (
        <CapturedPokemonCollection
          capturedPokemonIds={capturedPokemonIds}
          shinyCapturedPokemonIds={shinyCapturedPokemonIds}
          onChooseCompanion={(pokemonId) => {
            setCompanionPokemonId(pokemonId);
            setIsCollectionOpen(false);
          }}
          onClose={() => setIsCollectionOpen(false)}
        />
      ) : null}
    </>
  );
}

export default App;

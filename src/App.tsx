/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Shape,
  SRGBColorSpace,
} from "three";
import "./App.css";

type Pokemon = {
  id: number;
  name: string;
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
};

type PokemonState =
  | { status: "loading"; pokemon: null; error: "" }
  | { status: "ready"; pokemon: Pokemon; flavorText: string; error: "" }
  | { status: "error"; pokemon: null; error: string };

const INITIAL_QUERY = "25";
const POKEDEX_SCREEN_POSITION: [number, number, number] = [0.053, 0.054, 0.685];
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
const SHOWDOWN_SPRITE_BASE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown";

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

function getShowdownSpriteUrl(pokemonId: number) {
  return `${SHOWDOWN_SPRITE_BASE_URL}/${pokemonId}.gif`;
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

function createScreenGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#d0fb9f");
  gradient.addColorStop(0.48, "#6cd87e");
  gradient.addColorStop(1, "#01351f");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function ScreenBackground() {
  const gradientTexture = useMemo(() => createScreenGradientTexture(), []);

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

function PokemonSprite({ spriteUrl }: { spriteUrl: string }) {
  return (
    <Html
      center
      position={[0, 0, 0.006]}
      scale={SPRITE_HTML_SCALE}
      style={{ pointerEvents: "none" }}
      transform
      zIndexRange={[10, 0]}
    >
      <img
        alt=""
        draggable={false}
        src={spriteUrl}
        style={{
          display: "block",
          height: SPRITE_RENDER_SIZE,
          imageRendering: "pixelated",
          objectFit: "contain",
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
  flavorText,
  spriteUrl,
}: {
  flavorText: string | null;
  spriteUrl: string | null;
}) {
  return (
    <group position={POKEDEX_SCREEN_POSITION} rotation={[0, Math.PI / 2, 0]}>
      <ScreenBackground />
      {spriteUrl ? (
        <PokemonSprite key={spriteUrl} spriteUrl={spriteUrl} />
      ) : null}
      {flavorText ? <FlavorTextOverlay text={flavorText} /> : null}
    </group>
  );
}

function DPadControls({ onStep }: { onStep: (delta: -1 | 1) => void }) {
  const dPadSegmentShape = useMemo(() => createDPadSegmentShape(), []);
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
          position={[0, 0, index * 0.001]}
          rotation={[0, 0, segment.rotation]}
          onClick={(event) => {
            event.stopPropagation();
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
            opacity={SHOW_D_PAD_DEBUG_OVERLAY ? 0.38 : 0}
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

function PokedexModel({
  flavorText,
  onDPadStep,
  spriteUrl,
}: {
  flavorText: string | null;
  onDPadStep: (delta: -1 | 1) => void;
  spriteUrl: string | null;
}) {
  const { scene } = useGLTF("/Pokedex.glb");

  return (
    <group rotation={[0, -0.22, 0]} scale={2.55}>
      <primitive object={scene} />
      <PokedexScreen flavorText={flavorText} spriteUrl={spriteUrl} />
      <DPadControls onStep={onDPadStep} />
    </group>
  );
}

useGLTF.preload("/Pokedex.glb");

function App() {
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState(INITIAL_QUERY);
  const [pokemonState, setPokemonState] = useState<PokemonState>({
    status: "loading",
    pokemon: null,
    error: "",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadPokemon() {
      const normalizedQuery = submittedQuery.trim().toLowerCase();

      if (!normalizedQuery) {
        setPokemonState({
          status: "error",
          pokemon: null,
          error: "Enter a Pokemon name or number.",
        });
        return;
      }

      setPokemonState({ status: "loading", pokemon: null, error: "" });

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

        try {
          const speciesResponse = await fetch(pokemon.species.url, {
            signal: controller.signal,
          });

          if (speciesResponse.ok) {
            const species = (await speciesResponse.json()) as PokemonSpecies;
            flavorText = getEnglishFlavorText(species);
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
        }

        setPokemonState({ status: "ready", pokemon, flavorText, error: "" });
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
        });
      }
    }

    loadPokemon();

    return () => controller.abort();
  }, [submittedQuery]);

  const spriteUrl =
    pokemonState.status === "ready"
      ? getShowdownSpriteUrl(pokemonState.pokemon.id)
      : null;
  const flavorText =
    pokemonState.status === "ready" ? pokemonState.flavorText : null;
  const pokemonLabel =
    pokemonState.status === "ready"
      ? `#${pokemonState.pokemon.id} ${pokemonState.pokemon.name}`
      : pokemonState.status === "loading"
        ? "Loading Pokemon"
        : "No Pokemon loaded";
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

  return (
    <main className="pokedex-app">
      <section className="viewer-shell" aria-label="Interactive Pokedex model">
        <Canvas camera={{ position: [5.5, 1.3, 2.6], fov: 56 }}>
          <color attach="background" args={["#e8f6f0"]} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[4, 4, 3]} intensity={2.4} />
          <directionalLight position={[-3, 2, -4]} intensity={0.9} />
          <Suspense fallback={null}>
            <PokedexModel
              flavorText={flavorText}
              onDPadStep={loadPokemonByOffset}
              spriteUrl={spriteUrl}
            />
          </Suspense>
          <OrbitControls
            enablePan={true}
            maxDistance={16.5}
            maxPolarAngle={Math.PI / 2}
            minDistance={2.5}
            minPolarAngle={Math.PI / 4}
            target={[0.7, 0.1, 0.2]}
          />
        </Canvas>
      </section>

      <section className="control-panel" aria-label="Pokemon lookup">
        <div>
          <p className="eyebrow">Three.js Pokedex POC</p>
          <h1>{pokemonLabel}</h1>
          {pokemonState.status === "error" ? (
            <p className="status error">{pokemonState.error}</p>
          ) : (
            <p className="status">
              Sprite fetched from PokeAPI and rendered on the model display.
            </p>
          )}
        </div>

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
      </section>
    </main>
  );
}

export default App;

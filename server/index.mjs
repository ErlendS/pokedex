import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
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

const port = Number(process.env.PORT || 8080);
const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const rooms = new Map();
const roundDurationMs = Number(process.env.VERSUS_ROUND_MS) || DEFAULT_ROUND_DURATION_MS;
const revealDurationMs = Number(process.env.VERSUS_REVEAL_MS) || DEFAULT_REVEAL_DURATION_MS;
const castAppId = "9DF86F21";
const castNamespace = "urn:x-cast:tech.flawed.pokedex.versus";

const send = (socket, message) => {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ ...message, serverNow: Date.now() }));
};
const broadcast = (room, message) => {
  const recipients = new Set([room.host, ...room.players.values().map((player) => player.socket), ...room.displays]);
  recipients.forEach((socket) => send(socket, message));
};
const viewerSockets = (room) => new Set([room.host, ...room.displays]);
const playerSockets = (room) => new Set([...room.players.values()].map((player) => player.socket));
const snapshot = (room, options) => ({
  type: "room:state",
  code: room.code,
  round: serializeRound(room.round, options),
  players: [...room.players.values()].map(({ id, name, score }) => ({ id, name, score })).sort((a, b) => b.score - a.score),
});
const broadcastState = (room) => {
  viewerSockets(room).forEach((socket) => send(socket, snapshot(room)));
  playerSockets(room).forEach((socket) => send(socket, snapshot(room, { controller: true })));
};
const broadcastRound = (room, type, viewerExtras = {}) => {
  viewerSockets(room).forEach((socket) => send(socket, { type, ...serializeRound(room.round), ...viewerExtras }));
  playerSockets(room).forEach((socket) => send(socket, { type, ...serializeRound(room.round, { controller: true }) }));
};
const closeRoom = (room) => {
  clearTimeout(room.roundTimer);
  broadcast(room, { type: "room:closed" });
  rooms.delete(room.code);
};

const closeRoomIfEmpty = (room) => {
  if (!room.host && room.players.size === 0 && room.displays.size === 0) closeRoom(room);
};

const loadRoundPokemon = async (generationIds) => {
  const forcedPokemonId = Number(process.env.VERSUS_POKEMON_ID);
  const pokemonId = Number.isInteger(forcedPokemonId) && forcedPokemonId > 0
    ? forcedPokemonId
    : pickPokemonIdForGenerations(generationIds);
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);
  if (!response.ok) throw new Error("Could not load Pokemon.");
  return response.json();
};

const startRound = async (room, { afterReveal = false } = {}) => {
  if (
    !rooms.has(room.code) ||
    room.players.size === 0 ||
    room.isStarting ||
    room.round?.status === "active" ||
    (room.round?.status === "revealed" && !afterReveal)
  ) return;
  room.isStarting = true;
  try {
    const pokemon = await loadRoundPokemon(room.generationIds);
    if (!rooms.has(room.code) || room.players.size === 0) return;
    clearTimeout(room.roundTimer);
    const startedAt = Date.now();
    room.roundNumber += 1;
    room.round = {
      number: room.roundNumber,
      pokemonId: pokemon.id,
      pokemonName: pokemon.name,
      spriteUrl: pokemon.sprites.front_default,
      typeNames: pokemon.types.map(({ type }) => type.name),
      startedAt,
      endsAt: startedAt + roundDurationMs,
      status: "active",
      correctCount: 0,
    };
    room.players.forEach((player) => { player.answeredRound = 0; });
    broadcastRound(room, "round:started", {
      cryUrl: pokemon.cries?.latest || pokemon.cries?.legacy || null,
    });
    broadcastState(room);
    room.roundTimer = setTimeout(() => revealRound(room), roundDurationMs);
  } catch {
    send(room.host, { type: "error", message: "Could not start round." });
    room.round = null;
    broadcastState(room);
  } finally {
    room.isStarting = false;
  }
};

const revealRound = (room) => {
  if (room.round?.status !== "active") return;
  clearTimeout(room.roundTimer);
  const revealedAt = Date.now();
  room.round.status = "revealed";
  room.round.revealedAt = revealedAt;
  room.round.revealUntil = revealedAt + revealDurationMs;
  broadcastRound(room, "round:revealed");
  broadcastState(room);
  room.roundTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (room.players.size === 0) {
      room.round = null;
      broadcastState(room);
      return;
    }
    void startRound(room, { afterReveal: true });
  }, revealDurationMs);
};

const revealIfEveryoneAnswered = (room) => {
  if (room.round?.status !== "active" || room.players.size === 0) return;
  const everyoneAnswered = [...room.players.values()]
    .every((player) => player.answeredRound === room.round.number);
  if (everyoneAnswered) revealRound(room);
};

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok\n");
    return;
  }
  if (request.url === "/api/cast-config") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ appId: castAppId, namespace: castNamespace, receiverPath: "/cast" }));
    return;
  }
  const pathname = new URL(request.url || "/", `http://${request.headers.host}`).pathname;
  const requestedPath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDir, requestedPath === "/" ? "index.html" : requestedPath);
  if (!existsSync(filePath) || extname(filePath) === "") filePath = join(distDir, "index.html");
  const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".glb": "model/gltf-binary" };
  response.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

const webSockets = new WebSocketServer({ server, path: "/versus" });
webSockets.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(socket, { type: "error", message: "Invalid message." }); }
    if (message.type === "host:create") {
      const code = createRoomCode(rooms);
      const room = {
        code,
        host: socket,
        players: new Map(),
        displays: new Set(),
        generationIds: [...DEFAULT_VERSUS_GENERATIONS],
        round: null,
        roundNumber: 0,
        roundTimer: null,
        isStarting: false,
      };
      rooms.set(code, room);
      socket.roomCode = code;
      socket.role = "host";
      send(socket, { type: "host:created", code, playerId: null });
      return send(socket, snapshot(room));
    }
    if (message.type === "player:join") {
      const code = String(message.code || "").toUpperCase();
      const room = rooms.get(code);
      const name = String(message.name || "").trim().slice(0, 24);
      if (!room || !name) return send(socket, { type: "error", message: "Match not found or name missing." });
      const id = crypto.randomUUID();
      room.players.set(id, { id, name, score: 0, socket, answeredRound: 0 });
      socket.roomCode = code;
      socket.playerId = id;
      socket.role = "player";
      send(socket, { type: "player:joined", code, playerId: id });
      return broadcastState(room);
    }
    if (message.type === "display:join") {
      const code = String(message.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(socket, { type: "error", message: "Match not found." });
      room.displays.add(socket);
      socket.roomCode = code;
      socket.role = "display";
      send(socket, { type: "display:joined", code });
      return send(socket, snapshot(room));
    }
    const room = rooms.get(socket.roomCode);
    if (!room) return send(socket, { type: "error", message: "Match not found." });
    if (message.type === "host:start" && socket.role === "host") {
      if (room.roundNumber === 0) room.generationIds = normalizeGenerationIds(message.generationIds);
      return void startRound(room);
    }
    if (message.type === "host:skip-reveal" && socket.role === "host" && room.round?.status === "revealed") {
      clearTimeout(room.roundTimer);
      return void startRound(room, { afterReveal: true });
    }
    if (message.type === "player:guess" && socket.playerId && room.round?.status === "active") {
      const player = room.players.get(socket.playerId);
      if (!player || player.answeredRound === room.round.number) return;
      const correct = normalizeGuess(message.guess) === normalizeGuess(room.round.pokemonName);
      player.answeredRound = room.round.number;
      let points = 0;
      if (correct) {
        room.round.correctCount += 1;
        points = calculatePoints(room.round.correctCount, Date.now() - room.round.startedAt);
        player.score += points;
        broadcast(room, { type: "round:answer", playerId: player.id, name: player.name, points });
      }
      send(socket, { type: "guess:result", correct, points });
      broadcastState(room);
      return revealIfEveryoneAnswered(room);
    }
  });
  socket.on("close", () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    if (socket.role === "host") room.host = null;
    if (socket.role === "display") room.displays.delete(socket);
    if (socket.playerId) room.players.delete(socket.playerId);
    broadcastState(room);
    revealIfEveryoneAnswered(room);
    closeRoomIfEmpty(room);
  });
});

server.listen(port, "0.0.0.0", () => console.log(`Pokedex listening on ${port}`));

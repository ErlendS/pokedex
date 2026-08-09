import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { calculatePoints, createRoomCode, normalizeGuess } from "./game.mjs";

const port = Number(process.env.PORT || 8080);
const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const rooms = new Map();

const send = (socket, message) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};
const broadcast = (room, message) => {
  send(room.host, message);
  room.players.forEach((player) => send(player.socket, message));
};
const snapshot = (room) => ({
  type: "room:state",
  code: room.code,
  round: room.round ? { number: room.round.number, startedAt: room.round.startedAt, status: room.round.status } : null,
  players: [...room.players.values()].map(({ id, name, score }) => ({ id, name, score })).sort((a, b) => b.score - a.score),
});
const closeRoom = (room) => {
  broadcast(room, { type: "room:closed" });
  rooms.delete(room.code);
};

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok\n");
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
      const room = { code, host: socket, players: new Map(), round: null, roundNumber: 0 };
      rooms.set(code, room);
      socket.roomCode = code;
      socket.role = "host";
      send(socket, { type: "host:created", code });
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
      return broadcast(room, snapshot(room));
    }
    const room = rooms.get(socket.roomCode);
    if (!room) return send(socket, { type: "error", message: "Match not found." });
    if (message.type === "host:start" && socket.role === "host") {
      const forcedPokemonId = Number(process.env.VERSUS_POKEMON_ID);
      const pokemonId = Number.isInteger(forcedPokemonId) && forcedPokemonId > 0
        ? forcedPokemonId
        : 1 + Math.floor(Math.random() * 251);
      const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);
      if (!pokemonResponse.ok) return send(socket, { type: "error", message: "Could not start round." });
      const pokemon = await pokemonResponse.json();
      room.roundNumber += 1;
      room.round = { number: room.roundNumber, pokemonId, pokemonName: pokemon.name, startedAt: Date.now(), status: "active", correctCount: 0 };
      room.players.forEach((player) => { player.answeredRound = 0; });
      broadcast(room, { type: "round:started", number: room.round.number, startedAt: room.round.startedAt, spriteUrl: pokemon.sprites.front_default, cryUrl: pokemon.cries?.latest || pokemon.cries?.legacy || null });
      return broadcast(room, snapshot(room));
    }
    if (message.type === "player:guess" && socket.role === "player" && room.round?.status === "active") {
      const player = room.players.get(socket.playerId);
      if (!player || player.answeredRound === room.round.number) return;
      const correct = normalizeGuess(message.guess) === normalizeGuess(room.round.pokemonName);
      if (!correct) return send(socket, { type: "guess:result", correct: false });
      player.answeredRound = room.round.number;
      room.round.correctCount += 1;
      const points = calculatePoints(room.round.correctCount, Date.now() - room.round.startedAt);
      player.score += points;
      send(socket, { type: "guess:result", correct: true, points });
      broadcast(room, { type: "round:answer", playerId: player.id, name: player.name, points });
      return broadcast(room, snapshot(room));
    }
  });
  socket.on("close", () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    if (socket.role === "host") return closeRoom(room);
    if (socket.playerId) room.players.delete(socket.playerId);
    broadcast(room, snapshot(room));
  });
});

server.listen(port, "0.0.0.0", () => console.log(`Pokedex listening on ${port}`));

export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

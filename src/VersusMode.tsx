import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Player = { id: string; name: string; score: number };
type Round = {
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
type ServerMessage =
  | { type: "host:created"; code: string }
  | { type: "player:joined"; code: string; playerId: string }
  | { type: "room:state"; code: string; players: Player[]; round: Round | null }
  | ({ type: "round:started"; cryUrl: string | null } & Round)
  | ({ type: "round:revealed" } & Round)
  | { type: "round:answer"; playerId: string; name: string; points: number }
  | { type: "guess:result"; correct: boolean; points?: number }
  | { type: "room:closed" }
  | { type: "error"; message: string };

const websocketUrl = () => `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/versus`;
const formatPokemonName = (value: string | null) =>
  value
    ? value.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")
    : "Ukjent Pokémon";

export function VersusMode({
  onRoundVisualChange,
}: {
  onRoundVisualChange: (visual: { spriteUrl: string; typeNames: string[]; concealed: boolean } | null) => void;
}) {
  const initialCode = useMemo(() => new URLSearchParams(window.location.search).get("versus")?.toUpperCase() ?? "", []);
  const [role, setRole] = useState<"choose" | "host" | "player">(initialCode ? "player" : "choose");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [answeredRoundNumber, setAnsweredRoundNumber] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback((nextRole: "host" | "player", joinCode = code, playerName = name) => {
    socketRef.current?.close();
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(JSON.stringify(nextRole === "host" ? { type: "host:create" } : { type: "player:join", code: joinCode, name: playerName }));
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage & { serverNow: number };
      setServerOffsetMs(message.serverNow - Date.now());
      if (message.type === "host:created" || message.type === "player:joined") setCode(message.code);
      if (message.type === "room:state") {
        setPlayers(message.players);
        setRound(message.round);
        if (message.round?.spriteUrl) {
          onRoundVisualChange({
            spriteUrl: message.round.spriteUrl,
            typeNames: message.round.typeNames,
            concealed: message.round.status === "active",
          });
        } else if (!message.round) {
          onRoundVisualChange(null);
        }
      }
      if (message.type === "round:started") {
        setRound(message);
        setGuess("");
        setAnsweredRoundNumber(null);
        setFeedback("Ny Pokémon — gjett raskest!");
        onRoundVisualChange(
          message.spriteUrl
            ? { spriteUrl: message.spriteUrl, typeNames: message.typeNames, concealed: true }
            : null,
        );
        if (message.cryUrl) void new Audio(message.cryUrl).play().catch(() => undefined);
      }
      if (message.type === "round:revealed") {
        setRound(message);
        setFeedback(`Svaret er ${formatPokemonName(message.answer)}.`);
        if (message.spriteUrl) {
          onRoundVisualChange({
            spriteUrl: message.spriteUrl,
            typeNames: message.typeNames,
            concealed: false,
          });
        }
      }
      if (message.type === "round:answer") setFeedback(`${message.name} var raskest: +${message.points}`);
      if (message.type === "guess:result") {
        setFeedback(message.correct ? `Riktig! +${message.points ?? 0} poeng` : "Svar registrert — venter på de andre.");
      }
      if (message.type === "room:closed") {
        setFeedback("Verten avsluttet kampen.");
        onRoundVisualChange(null);
      }
      if (message.type === "error") setFeedback(message.message);
    });
  }, [code, name, onRoundVisualChange]);

  useEffect(() => {
    if (!round) return;
    const timer = window.setInterval(() => setClockNow(Date.now() + serverOffsetMs), 100);
    return () => window.clearInterval(timer);
  }, [round, serverOffsetMs]);

  useEffect(() => () => {
    socketRef.current?.close();
    onRoundVisualChange(null);
  }, [onRoundVisualChange]);
  useEffect(() => {
    if (!code || role !== "host") return;
    const joinUrl = `${window.location.origin}${window.location.pathname}?versus=${code}`;
    void QRCode.toDataURL(joinUrl, { errorCorrectionLevel: "H", margin: 2, width: 260 }).then(setQrUrl);
  }, [code, role]);

  const startHosting = () => { setRole("host"); connect("host"); };
  const join = () => {
    if (!code.trim() || !name.trim()) return setFeedback("Skriv inn navn og kode.");
    setRole("player");
    connect("player", code.trim().toUpperCase(), name.trim());
  };
  const deadline = round?.status === "active" ? round.endsAt : round?.revealUntil;
  const phaseStartedAt = round?.status === "active" ? round.startedAt : round?.revealedAt;
  const phaseDuration = deadline && phaseStartedAt ? deadline - phaseStartedAt : 0;
  const remainingMs = deadline ? Math.max(0, deadline - clockNow) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingPercent = phaseDuration > 0 ? Math.max(0, Math.min(100, (remainingMs / phaseDuration) * 100)) : 0;
  const hasAnsweredCurrentRound = answeredRoundNumber === round?.number;
  const submitGuess = () => {
    if (!round || hasAnsweredCurrentRound || !guess.trim()) return;
    setAnsweredRoundNumber(round.number);
    socketRef.current?.send(JSON.stringify({ type: "player:guess", guess }));
  };

  return (
    <div className="versus-panel">
      <header className="versus-header">
        <p className="eyebrow">Live multiplayer</p>
        <h1>Versus Mode</h1>
        <p>Samme Pokémon. Samme øyeblikk. Raskeste riktige svar vinner.</p>
      </header>
      {role === "choose" ? (
        <section className="versus-choice">
          <button className="versus-primary" onClick={startHosting} type="button">Start en match</button>
          <button onClick={() => setRole("player")} type="button">Bli med</button>
        </section>
      ) : null}
      {role === "player" && !connected ? (
        <form className="versus-join" onSubmit={(event) => { event.preventDefault(); join(); }}>
          <label>Navn<input autoComplete="nickname" maxLength={24} onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label>Join-kode<input autoCapitalize="characters" maxLength={5} onChange={(event) => setCode(event.target.value.toUpperCase())} value={code} /></label>
          <button className="versus-primary" type="submit">Bli med i kampen</button>
        </form>
      ) : null}
      {role === "host" && code ? (
        <section className="versus-host">
          <div className="versus-code">
            <span>Join-kode</span>
            <strong>{code}</strong>
            {qrUrl ? (
              <div className="versus-qr">
                <img alt={`QR-kode for match ${code}`} src={qrUrl} />
                <span aria-hidden="true" className="versus-qr-mark" />
              </div>
            ) : null}
          </div>
          <button className="versus-primary" disabled={!connected || players.length === 0 || round !== null} onClick={() => socketRef.current?.send(JSON.stringify({ type: "host:start" }))} type="button">
            {round?.status === "active" ? "Runden pågår" : round?.status === "revealed" ? `Neste runde om ${remainingSeconds}s` : "Start runden"}
          </button>
        </section>
      ) : null}
      {(role === "host" || connected) ? (
        <section className="versus-arena">
          <div className="versus-round-indicator">
            <span aria-hidden="true" className={round?.status === "active" ? "is-live" : ""} />
            {round?.status === "active" ? `Runde ${round.number} pågår i 3D-scenen` : round?.status === "revealed" ? `Runde ${round.number} — fasit` : "Venter på neste Pokémon"}
          </div>
          {round && deadline ? (
            <div
              className={`versus-countdown is-${round.status}${round.status === "active" && remainingPercent <= 20 ? " is-urgent" : ""}`}
              data-deadline={deadline}
              data-started-at={phaseStartedAt ?? undefined}
            >
              <div className="versus-countdown-label">
                <span>{round.status === "active" ? "Tid igjen" : "Neste runde"}</span>
                <strong>{remainingSeconds}s</strong>
              </div>
              <div
                aria-label={round.status === "active" ? "Tid igjen i runden" : "Tid til neste runde"}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(remainingPercent)}
                className="versus-progress"
                role="progressbar"
              >
                <span style={{ width: `${remainingPercent}%` }} />
              </div>
            </div>
          ) : null}
          {round?.status === "revealed" && round.answer ? (
            <div className="versus-answer" aria-live="assertive">
              <span>Fasiten er</span>
              <strong>{formatPokemonName(round.answer)}</strong>
              <small>Vises i 15 sekunder før neste runde.</small>
            </div>
          ) : null}
          {role === "player" && round?.status === "active" ? (
            <form className="versus-guess" onSubmit={(event) => { event.preventDefault(); submitGuess(); }}>
              <input aria-label="Ditt Pokémon-svar" autoComplete="off" autoFocus disabled={hasAnsweredCurrentRound} onChange={(event) => setGuess(event.target.value)} placeholder="Hvem er Pokémonen?" value={guess} />
              <button className="versus-primary" disabled={hasAnsweredCurrentRound || !guess.trim()} type="submit">{hasAnsweredCurrentRound ? "Svart" : "Gjett"}</button>
            </form>
          ) : null}
          <p aria-live="polite">{feedback}</p>
          <ol className="versus-scoreboard">{players.map((player, index) => <li key={player.id}><span>{index + 1}. {player.name}</span><strong>{player.score}</strong></li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}

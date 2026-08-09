import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCastSender } from "./useCastSender";
import {
  createVersusJoinUrl,
  formatVersusPokemonName,
  getVersusWebSocketUrl,
  type VersusPlayer,
  type VersusRound,
  type VersusRoundVisual,
  type VersusServerMessage,
} from "./versus";

export function VersusMode({
  onRoundVisualChange,
}: {
  onRoundVisualChange: (visual: VersusRoundVisual | null) => void;
}) {
  const initialCode = useMemo(() => new URLSearchParams(window.location.search).get("versus")?.toUpperCase() ?? "", []);
  const [role, setRole] = useState<"choose" | "host-setup" | "host" | "player">(initialCode ? "player" : "choose");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<VersusPlayer[]>([]);
  const [round, setRound] = useState<VersusRound | null>(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [answeredRoundNumber, setAnsweredRoundNumber] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const { castRoom, error: castError, status: castStatus } = useCastSender(code);

  const connect = useCallback((nextRole: "host" | "player", joinCode = code, playerName = name) => {
    socketRef.current?.close();
    const socket = new WebSocket(getVersusWebSocketUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(JSON.stringify(nextRole === "host" ? { type: "host:create", name: playerName } : { type: "player:join", code: joinCode, name: playerName }));
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as VersusServerMessage & { serverNow: number };
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
        setFeedback("New Pokémon — be the fastest to guess!");
        onRoundVisualChange(
          message.spriteUrl
            ? { spriteUrl: message.spriteUrl, typeNames: message.typeNames, concealed: true }
            : null,
        );
        if (message.cryUrl) void new Audio(message.cryUrl).play().catch(() => undefined);
      }
      if (message.type === "round:revealed") {
        setRound(message);
        setFeedback(`The answer is ${formatVersusPokemonName(message.answer)}.`);
        if (message.spriteUrl) {
          onRoundVisualChange({
            spriteUrl: message.spriteUrl,
            typeNames: message.typeNames,
            concealed: false,
          });
        }
      }
      if (message.type === "round:answer") setFeedback(`${message.name} was fastest: +${message.points}`);
      if (message.type === "guess:result") {
        setFeedback(message.correct ? `Correct! +${message.points ?? 0} points` : "Answer submitted — waiting for the other players.");
      }
      if (message.type === "room:closed") {
        setFeedback("The host ended the match.");
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
    const joinUrl = createVersusJoinUrl(code, { origin: window.location.origin, pathname: "/" });
    void QRCode.toDataURL(joinUrl, { errorCorrectionLevel: "H", margin: 2, width: 260 }).then(setQrUrl);
  }, [code, role]);

  const startHosting = () => {
    if (!name.trim()) return setFeedback("Enter your name to create a match.");
    setRole("host");
    connect("host", "", name.trim());
  };
  const join = () => {
    if (!code.trim() || !name.trim()) return setFeedback("Enter your name and join code.");
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
        <p>Same Pokémon. Same moment. Fastest correct answer wins.</p>
      </header>
      {role === "choose" ? (
        <section className="versus-choice">
          <button className="versus-primary" onClick={() => setRole("host-setup")} type="button">Start a match</button>
          <button onClick={() => setRole("player")} type="button">Join</button>
        </section>
      ) : null}
      {role === "host-setup" ? (
        <form className="versus-join" onSubmit={(event) => { event.preventDefault(); startHosting(); }}>
          <label>Your name<input autoComplete="nickname" autoFocus maxLength={24} onChange={(event) => setName(event.target.value)} value={name} /></label>
          <button className="versus-primary" type="submit">Create match</button>
          <button onClick={() => setRole("choose")} type="button">Back</button>
        </form>
      ) : null}
      {role === "player" && !connected ? (
        <form className="versus-join" onSubmit={(event) => { event.preventDefault(); join(); }}>
          <label>Name<input autoComplete="nickname" maxLength={24} onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label>Join code<input autoCapitalize="characters" maxLength={5} onChange={(event) => setCode(event.target.value.toUpperCase())} value={code} /></label>
          <button className="versus-primary" type="submit">Join match</button>
        </form>
      ) : null}
      {role === "host" && code ? (
        <section className="versus-host">
          <div className="versus-code">
            <span>Join code</span>
            <strong>{code}</strong>
            {qrUrl ? (
              <div className="versus-qr">
                <img alt={`QR code for match ${code}`} src={qrUrl} />
                <span aria-hidden="true" className="versus-qr-mark" />
              </div>
            ) : null}
          </div>
          <button className="versus-primary" disabled={!connected || players.length === 0 || round !== null} onClick={() => socketRef.current?.send(JSON.stringify({ type: "host:start" }))} type="button">
            {round?.status === "active" ? "Round in progress" : round?.status === "revealed" ? `Next round in ${remainingSeconds}s` : "Start round"}
          </button>
          <button
            className="versus-cast-button"
            disabled={["loading", "unconfigured", "unavailable", "connecting"].includes(castStatus)}
            onClick={() => void castRoom()}
            type="button"
          >
            <span aria-hidden="true" className="versus-cast-icon" />
            {castStatus === "connected"
              ? "Casting to TV"
              : castStatus === "connecting"
                ? "Connecting to TV…"
                : castStatus === "unconfigured"
                  ? "Cast setup pending"
                  : "Cast to TV"}
          </button>
          {castError ? <p className="status error">{castError}</p> : null}
        </section>
      ) : null}
      {(role === "host" || connected) ? (
        <section className="versus-arena">
          <div className="versus-round-indicator">
            <span aria-hidden="true" className={round?.status === "active" ? "is-live" : ""} />
            {round?.status === "active" ? `Round ${round.number} is live in the 3D scene` : round?.status === "revealed" ? `Round ${round.number} — answer` : "Waiting for the next Pokémon"}
          </div>
          {round && deadline ? (
            <div
              className={`versus-countdown is-${round.status}${round.status === "active" && remainingPercent <= 20 ? " is-urgent" : ""}`}
              data-deadline={deadline}
              data-started-at={phaseStartedAt ?? undefined}
            >
              <div className="versus-countdown-label">
                <span>{round.status === "active" ? "Time remaining" : "Next round"}</span>
                <strong>{remainingSeconds}s</strong>
              </div>
              <div
                aria-label={round.status === "active" ? "Time remaining in round" : "Time until next round"}
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
              <span>The answer is</span>
              <strong>{formatVersusPokemonName(round.answer)}</strong>
              <small>Shown for 15 seconds before the next round.</small>
            </div>
          ) : null}
          {(role === "player" || role === "host") && round?.status === "active" ? (
            <form className="versus-guess" onSubmit={(event) => { event.preventDefault(); submitGuess(); }}>
              <input aria-label="Your Pokémon answer" autoComplete="off" autoFocus disabled={hasAnsweredCurrentRound} onChange={(event) => setGuess(event.target.value)} placeholder="Who's that Pokémon?" value={guess} />
              <button className="versus-primary" disabled={hasAnsweredCurrentRound || !guess.trim()} type="submit">{hasAnsweredCurrentRound ? "Answered" : "Guess"}</button>
            </form>
          ) : null}
          <p aria-live="polite">{feedback}</p>
          <ol className="versus-scoreboard">{players.map((player, index) => <li key={player.id}><span>{index + 1}. {player.name}</span><strong>{player.score}</strong></li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}

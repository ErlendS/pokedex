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
  onControllerModeChange,
  onRoundVisualChange,
}: {
  onControllerModeChange: (isController: boolean) => void;
  onRoundVisualChange: (visual: VersusRoundVisual | null) => void;
}) {
  const initialCode = useMemo(() => new URLSearchParams(window.location.search).get("versus")?.toUpperCase() ?? "", []);
  const [role, setRole] = useState<"choose" | "host" | "player">(initialCode ? "player" : "choose");
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
  const { castRoom, error: castError, status: castStatus } = useCastSender(code, role === "host");

  const connect = useCallback((nextRole: "host" | "player", joinCode = code, playerName = name) => {
    socketRef.current?.close();
    const socket = new WebSocket(getVersusWebSocketUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(nextRole === "host" ? { type: "host:create" } : { type: "player:join", code: joinCode, name: playerName }));
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as VersusServerMessage & { serverNow: number };
      setServerOffsetMs(message.serverNow - Date.now());
      if (message.type === "host:created" || message.type === "player:joined") {
        setCode(message.code);
        setConnected(true);
      }
      if (message.type === "room:state") {
        setPlayers(message.players);
        setRound(message.round);
        if (nextRole === "host" && message.round?.spriteUrl) {
          onRoundVisualChange({
            spriteUrl: message.round.spriteUrl,
            typeNames: message.round.typeNames,
            concealed: message.round.status === "active",
          });
        } else if (nextRole === "host" && !message.round) {
          onRoundVisualChange(null);
        }
      }
      if (message.type === "round:started") {
        setRound(message);
        setGuess("");
        setAnsweredRoundNumber(null);
        setFeedback(nextRole === "host" ? "New Pokémon — guesses are open!" : "Enter your guess, then submit it once.");
        if (nextRole === "host") {
          onRoundVisualChange(
            message.spriteUrl
              ? { spriteUrl: message.spriteUrl, typeNames: message.typeNames, concealed: true }
              : null,
          );
          if (message.cryUrl) void new Audio(message.cryUrl).play().catch(() => undefined);
        }
      }
      if (message.type === "round:revealed") {
        setRound(message);
        setFeedback(nextRole === "host"
          ? `The answer is ${formatVersusPokemonName(message.answer)}.`
          : "Round complete. Watch the main display for the answer.");
        if (nextRole === "host" && message.spriteUrl) {
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
    onControllerModeChange(role === "player");
  }, [onControllerModeChange, role]);
  useEffect(() => {
    if (!code || role !== "host") return;
    const joinUrl = createVersusJoinUrl(code, { origin: window.location.origin, pathname: "/" });
    void QRCode.toDataURL(joinUrl, { errorCorrectionLevel: "H", margin: 2, width: 260 }).then(setQrUrl);
  }, [code, role]);

  const startHosting = () => {
    setRole("host");
    connect("host", "", "");
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
        <p className="eyebrow">{role === "player" ? "Phone controller" : "Live multiplayer display"}</p>
        <h1>{role === "player" ? "Join Versus" : "Versus Mode"}</h1>
        <p>{role === "player" ? "Enter your name, then use this phone only to submit guesses." : "Show the Pokémon here. Players join and guess from their phones."}</p>
      </header>
      {role === "choose" ? (
        <section className="versus-choice">
          <button className="versus-primary" onClick={startHosting} type="button">Start a match</button>
          <button onClick={() => setRole("player")} type="button">Join</button>
        </section>
      ) : null}
      {role === "player" && !connected ? (
        <form className="versus-join" onSubmit={(event) => { event.preventDefault(); join(); }}>
          <label>Name<input autoComplete="nickname" maxLength={24} onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label>Join code<input autoCapitalize="characters" maxLength={5} onChange={(event) => setCode(event.target.value.toUpperCase())} value={code} /></label>
          <button className="versus-primary" type="submit">Join match</button>
          {initialCode ? null : <button onClick={() => setRole("choose")} type="button">Back</button>}
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
          {["ready", "connecting", "connected"].includes(castStatus) ? (
            <button
              className="versus-cast-button"
              disabled={castStatus === "connecting"}
              onClick={() => void castRoom()}
              type="button"
            >
              <span aria-hidden="true" className="versus-cast-icon" />
              {castStatus === "connected"
                ? "Casting to TV"
                : castStatus === "connecting"
                  ? "Connecting to TV…"
                  : "Cast to TV"}
            </button>
          ) : null}
          {castError ? <p className="status error">{castError}</p> : null}
        </section>
      ) : null}
      {(role === "host" || (role === "player" && connected)) ? (
        <section className="versus-arena">
          <div className="versus-round-indicator">
            <span aria-hidden="true" className={round?.status === "active" ? "is-live" : ""} />
            {round?.status === "active"
              ? role === "host" ? `Round ${round.number} is live on the display` : `Round ${round.number} — enter your guess`
              : round?.status === "revealed"
                ? role === "host" ? `Round ${round.number} — answer` : `Round ${round.number} complete`
                : role === "host" ? "Waiting for the next Pokémon" : `Connected as ${name}`}
          </div>
          {role === "host" && round && deadline ? (
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
          {role === "host" && round?.status === "revealed" && round.answer ? (
            <div className="versus-answer" aria-live="assertive">
              <span>The answer is</span>
              <strong>{formatVersusPokemonName(round.answer)}</strong>
              <small>Shown for 15 seconds before the next round.</small>
            </div>
          ) : null}
          {role === "player" && round?.status === "active" ? (
            <form className="versus-guess" onSubmit={(event) => { event.preventDefault(); submitGuess(); }}>
              <input aria-label="Your Pokémon answer" autoComplete="off" autoFocus disabled={hasAnsweredCurrentRound} onChange={(event) => setGuess(event.target.value)} placeholder="Who's that Pokémon?" value={guess} />
              <button className="versus-primary" disabled={hasAnsweredCurrentRound || !guess.trim()} type="submit">{hasAnsweredCurrentRound ? "Answered" : "Guess"}</button>
            </form>
          ) : null}
          <p aria-live="polite">{feedback}</p>
          {role === "host" ? (
            <ol className="versus-scoreboard">{players.map((player, index) => <li key={player.id}><span>{index + 1}. {player.name}</span><strong>{player.score}</strong></li>)}</ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

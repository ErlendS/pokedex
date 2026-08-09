import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initializeCastReceiver } from "./cast";
import {
  CAST_NAMESPACE,
  createVersusJoinUrl,
  formatVersusPokemonName,
  getVersusWebSocketUrl,
  type VersusPlayer,
  type VersusRound,
  type VersusRoundVisual,
  type VersusServerMessage,
} from "./versus";

export function CastReceiverMode({
  onRoundVisualChange,
}: {
  onRoundVisualChange: (visual: VersusRoundVisual | null) => void;
}) {
  const initialCode = useMemo(
    () => new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "",
    [],
  );
  const [code, setCode] = useState(initialCode);
  const [players, setPlayers] = useState<VersusPlayer[]>([]);
  const [round, setRound] = useState<VersusRound | null>(null);
  const [feedback, setFeedback] = useState(initialCode ? "Connecting to match…" : "Start a match on your phone, then cast it here.");
  const [qrUrl, setQrUrl] = useState("");
  const [clockNow, setClockNow] = useState(Date.now);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (initialCode) return;
    void initializeCastReceiver(CAST_NAMESPACE, setCode).catch(() => {
      setFeedback("Waiting for a Google Cast session.");
    });
  }, [initialCode]);

  const connectDisplay = useCallback((roomCode: string) => {
    socketRef.current?.close();
    const socket = new WebSocket(getVersusWebSocketUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "display:join", code: roomCode }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as VersusServerMessage & { serverNow: number };
      setServerOffsetMs(message.serverNow - Date.now());
      if (message.type === "display:joined") setFeedback("Match connected. Waiting for the host to start.");
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
        setFeedback("New Pokémon — guesses are open!");
        if (message.spriteUrl) {
          onRoundVisualChange({ spriteUrl: message.spriteUrl, typeNames: message.typeNames, concealed: true });
        }
        if (message.cryUrl) void new Audio(message.cryUrl).play().catch(() => undefined);
      }
      if (message.type === "round:revealed") {
        setRound(message);
        setFeedback(`The answer is ${formatVersusPokemonName(message.answer)}.`);
        if (message.spriteUrl) {
          onRoundVisualChange({ spriteUrl: message.spriteUrl, typeNames: message.typeNames, concealed: false });
        }
      }
      if (message.type === "round:answer") setFeedback(`${message.name} was fastest: +${message.points}`);
      if (message.type === "room:closed") {
        setFeedback("The match has ended.");
        setRound(null);
        setPlayers([]);
        onRoundVisualChange(null);
      }
      if (message.type === "error") setFeedback(message.message);
    });
    socket.addEventListener("close", () => setFeedback("Display disconnected. Cast the match again to reconnect."));
  }, [onRoundVisualChange]);

  useEffect(() => {
    if (!code) return;
    connectDisplay(code);
    const joinUrl = createVersusJoinUrl(code, { origin: window.location.origin, pathname: "/" });
    void QRCode.toDataURL(joinUrl, { errorCorrectionLevel: "H", margin: 2, width: 320 }).then(setQrUrl);
    return () => socketRef.current?.close();
  }, [code, connectDisplay]);

  useEffect(() => () => onRoundVisualChange(null), [onRoundVisualChange]);

  useEffect(() => {
    if (!round) return;
    const timer = window.setInterval(() => setClockNow(Date.now() + serverOffsetMs), 100);
    return () => window.clearInterval(timer);
  }, [round, serverOffsetMs]);

  const deadline = round?.status === "active" ? round.endsAt : round?.revealUntil;
  const phaseStartedAt = round?.status === "active" ? round.startedAt : round?.revealedAt;
  const phaseDuration = deadline && phaseStartedAt ? deadline - phaseStartedAt : 0;
  const remainingMs = deadline ? Math.max(0, deadline - clockNow) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingPercent = phaseDuration > 0 ? Math.max(0, Math.min(100, (remainingMs / phaseDuration) * 100)) : 0;

  return (
    <aside className="cast-receiver-panel" aria-label="Versus Cast display">
      <header className="cast-receiver-header">
        <p className="eyebrow">Live on TV</p>
        <h1>Pokédex Versus</h1>
        <p>{feedback}</p>
      </header>

      {code ? (
        <div className="cast-room-card">
          <div>
            <span>Join code</span>
            <strong>{code}</strong>
          </div>
          {qrUrl ? (
            <div className="versus-qr cast-receiver-qr">
              <img alt={`QR code for match ${code}`} src={qrUrl} />
              <span aria-hidden="true" className="versus-qr-mark" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cast-round-card">
        <div className="versus-round-indicator">
          <span aria-hidden="true" className={round?.status === "active" ? "is-live" : ""} />
          {round?.status === "active"
            ? `Round ${round.number} — guess now`
            : round?.status === "revealed"
              ? `Round ${round.number} — answer`
              : "Waiting for the first round"}
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
          <div className="versus-answer">
            <span>The answer is</span>
            <strong>{formatVersusPokemonName(round.answer)}</strong>
            <small>Next round starts in 15 seconds.</small>
          </div>
        ) : null}
      </div>

      <ol className="versus-scoreboard cast-scoreboard">
        {players.map((player, index) => (
          <li key={player.id}><span>{index + 1}. {player.name}</span><strong>{player.score}</strong></li>
        ))}
      </ol>
    </aside>
  );
}

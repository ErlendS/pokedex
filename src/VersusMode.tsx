import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Player = { id: string; name: string; score: number };
type Round = { number: number; startedAt: number; status: string };
type ServerMessage =
  | { type: "host:created"; code: string }
  | { type: "player:joined"; code: string; playerId: string }
  | { type: "room:state"; code: string; players: Player[]; round: Round | null }
  | { type: "round:started"; number: number; startedAt: number; spriteUrl: string | null; cryUrl: string | null; typeNames: string[] }
  | { type: "round:answer"; playerId: string; name: string; points: number }
  | { type: "guess:result"; correct: boolean; points?: number }
  | { type: "room:closed" }
  | { type: "error"; message: string };

const websocketUrl = () => `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/versus`;

export function VersusMode({
  onRoundVisualChange,
}: {
  onRoundVisualChange: (visual: { spriteUrl: string; typeNames: string[] } | null) => void;
}) {
  const initialCode = useMemo(() => new URLSearchParams(window.location.search).get("versus")?.toUpperCase() ?? "", []);
  const [role, setRole] = useState<"choose" | "host" | "player">(initialCode ? "player" : "choose");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [connected, setConnected] = useState(false);
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
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "host:created" || message.type === "player:joined") setCode(message.code);
      if (message.type === "room:state") { setPlayers(message.players); setRound(message.round); }
      if (message.type === "round:started") {
        setRound({ number: message.number, startedAt: message.startedAt, status: "active" });
        setSpriteUrl(message.spriteUrl);
        setGuess("");
        setFeedback("Ny Pokémon — gjett raskest!");
        onRoundVisualChange(
          message.spriteUrl
            ? { spriteUrl: message.spriteUrl, typeNames: message.typeNames }
            : null,
        );
        if (message.cryUrl) void new Audio(message.cryUrl).play().catch(() => undefined);
      }
      if (message.type === "round:answer") setFeedback(`${message.name} var raskest: +${message.points}`);
      if (message.type === "guess:result") setFeedback(message.correct ? `Riktig! +${message.points ?? 0} poeng` : "Ikke riktig — prøv igjen!");
      if (message.type === "room:closed") {
        setFeedback("Verten avsluttet kampen.");
        onRoundVisualChange(null);
      }
      if (message.type === "error") setFeedback(message.message);
    });
  }, [code, name, onRoundVisualChange]);

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
          <button className="versus-primary" disabled={!connected || players.length === 0} onClick={() => socketRef.current?.send(JSON.stringify({ type: "host:start" }))} type="button">{round ? "Neste Pokémon" : "Start runden"}</button>
        </section>
      ) : null}
      {(role === "host" || connected) ? (
        <section className="versus-arena">
          <div className="versus-round-indicator">
            <span aria-hidden="true" className={spriteUrl ? "is-live" : ""} />
            {spriteUrl ? `Runde ${round?.number ?? 1} pågår i 3D-scenen` : "Venter på neste Pokémon"}
          </div>
          {role === "player" && round?.status === "active" ? (
            <form className="versus-guess" onSubmit={(event) => { event.preventDefault(); socketRef.current?.send(JSON.stringify({ type: "player:guess", guess })); }}>
              <input aria-label="Ditt Pokémon-svar" autoComplete="off" autoFocus onChange={(event) => setGuess(event.target.value)} placeholder="Hvem er Pokémonen?" value={guess} />
              <button className="versus-primary" type="submit">Gjett</button>
            </form>
          ) : null}
          <p aria-live="polite">{feedback}</p>
          <ol className="versus-scoreboard">{players.map((player, index) => <li key={player.id}><span>{index + 1}. {player.name}</span><strong>{player.score}</strong></li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}

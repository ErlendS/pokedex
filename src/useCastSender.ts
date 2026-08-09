import { useCallback, useEffect, useState } from "react";
import { fetchCastConfig, initializeCastSender, sendRoomToCast, type CastConfig } from "./cast";

type CastStatus = "loading" | "unconfigured" | "unavailable" | "ready" | "connecting" | "connected" | "error";

export function useCastSender(roomCode: string) {
  const [config, setConfig] = useState<CastConfig | null>(null);
  const [status, setStatus] = useState<CastStatus>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchCastConfig()
      .then(async (nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        if (!nextConfig.appId) {
          setStatus("unconfigured");
          return;
        }
        const available = await initializeCastSender(nextConfig.appId);
        if (!cancelled) setStatus(available ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not initialize Google Cast.");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  const castRoom = useCallback(async () => {
    if (!config || !roomCode) return;
    setStatus("connecting");
    setError("");
    try {
      await sendRoomToCast(config.namespace, roomCode);
      setStatus("connected");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start casting.");
      setStatus("error");
    }
  }, [config, roomCode]);

  return { castRoom, error, status };
}


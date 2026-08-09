import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCastConfig, initializeCastSender, sendRoomToCast } from "./cast";
import { CAST_NAMESPACE, createVersusJoinUrl, formatVersusPokemonName, getVersusWebSocketUrl } from "./versus";

afterEach(() => {
  vi.restoreAllMocks();
  delete window.cast;
  delete window.chrome;
});

describe("Cast configuration", () => {
  it("loads the runtime application id without baking it into the frontend", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      appId: "ABCD1234",
      namespace: CAST_NAMESPACE,
      receiverPath: "/cast",
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(fetchCastConfig(fetcher)).resolves.toEqual({
      appId: "ABCD1234",
      namespace: CAST_NAMESPACE,
      receiverPath: "/cast",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/cast-config", { cache: "no-store" });
  });

  it("does not load the sender SDK until an application id is configured", async () => {
    await expect(initializeCastSender("")).resolves.toBe(false);
    expect(document.getElementById("google-cast-sender-sdk")).toBeNull();
  });

  it("sends the room code to an existing Cast session", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const requestSession = vi.fn(async () => undefined);
    window.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({
            getCurrentSession: () => ({ sendMessage }),
            requestSession,
            setOptions: vi.fn(),
          }),
        },
      },
    };

    await sendRoomToCast(CAST_NAMESPACE, "ABCDE");

    expect(requestSession).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(CAST_NAMESPACE, { type: "join-room", code: "ABCDE" });
  });
});

describe("Versus links and formatting", () => {
  it("creates a root join link even when the display is on the Cast route", () => {
    expect(createVersusJoinUrl("ABCDE", { origin: "https://pokedex.flawed.tech", pathname: "/" }))
      .toBe("https://pokedex.flawed.tech/?versus=ABCDE");
  });

  it("selects secure and local WebSocket protocols", () => {
    expect(getVersusWebSocketUrl({ protocol: "https:", host: "pokedex.flawed.tech" }))
      .toBe("wss://pokedex.flawed.tech/versus");
    expect(getVersusWebSocketUrl({ protocol: "http:", host: "127.0.0.1:4173" }))
      .toBe("ws://127.0.0.1:4173/versus");
  });

  it("formats compound Pokémon names for the TV answer card", () => {
    expect(formatVersusPokemonName("mr-mime")).toBe("Mr Mime");
  });
});


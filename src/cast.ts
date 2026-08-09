export type CastConfig = {
  appId: string;
  namespace: string;
  receiverPath: string;
};

type CastSession = {
  sendMessage: (namespace: string, message: unknown) => Promise<void>;
};

type CastContext = {
  addEventListener: (type: string, listener: (event: CastStateChangedEvent) => void) => void;
  getCastState: () => string;
  getCurrentSession: () => CastSession | null;
  removeEventListener: (type: string, listener: (event: CastStateChangedEvent) => void) => void;
  requestSession: () => Promise<void>;
  setOptions: (options: { autoJoinPolicy: string; receiverApplicationId: string }) => void;
};

type CastStateChangedEvent = {
  castState: string;
};

export type CastDiscoveryState = {
  available: boolean;
  connected: boolean;
};

type CastReceiverContext = {
  addCustomMessageListener: (namespace: string, listener: (event: { data: unknown }) => void) => void;
  start: (options?: { disableIdleTimeout?: boolean }) => void;
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: {
      framework: {
        CastContext: { getInstance: () => CastContext };
        CastContextEventType: { CAST_STATE_CHANGED: string };
        CastReceiverContext?: { getInstance: () => CastReceiverContext };
        CastState: {
          CONNECTED: string;
          CONNECTING: string;
          NOT_CONNECTED: string;
          NO_DEVICES_AVAILABLE: string;
        };
      };
    };
    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
      };
    };
  }
}

const senderScriptId = "google-cast-sender-sdk";
const receiverScriptId = "google-cast-receiver-sdk";

export async function fetchCastConfig(fetcher: typeof fetch = fetch): Promise<CastConfig> {
  const response = await fetcher("/api/cast-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load Cast configuration.");
  return response.json() as Promise<CastConfig>;
}

function loadScript(id: string, src: string) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const onLoad = () => { script.dataset.loaded = "true"; resolve(); };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Google Cast SDK.")), { once: true });
    if (!existing) {
      script.id = id;
      script.src = src;
      document.head.append(script);
    }
  });
}

export async function initializeCastSender(appId: string) {
  if (!appId) return false;
  if (!window.cast?.framework.CastContext) {
    const availability = new Promise<boolean>((resolve) => {
      window.__onGCastApiAvailable = (available) => resolve(available);
    });
    await loadScript(senderScriptId, "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1");
    if (!(await availability)) return false;
  }
  const castContext = window.cast?.framework.CastContext.getInstance();
  const autoJoinPolicy = window.chrome?.cast?.AutoJoinPolicy.ORIGIN_SCOPED;
  if (!castContext || !autoJoinPolicy) return false;
  castContext.setOptions({ autoJoinPolicy, receiverApplicationId: appId });
  return true;
}

export function subscribeToCastState(onStateChange: (state: CastDiscoveryState) => void) {
  const framework = window.cast?.framework;
  const context = framework?.CastContext.getInstance();
  if (!framework || !context) {
    onStateChange({ available: false, connected: false });
    return () => undefined;
  }

  const availableStates = new Set([
    framework.CastState.NOT_CONNECTED,
    framework.CastState.CONNECTING,
    framework.CastState.CONNECTED,
  ]);
  const publish = (castState: string) => {
    onStateChange({
      available: availableStates.has(castState),
      connected: castState === framework.CastState.CONNECTED,
    });
  };
  const listener = (event: CastStateChangedEvent) => publish(event.castState);
  const eventType = framework.CastContextEventType.CAST_STATE_CHANGED;

  context.addEventListener(eventType, listener);
  publish(context.getCastState());

  return () => context.removeEventListener(eventType, listener);
}

export async function sendRoomToCast(namespace: string, code: string) {
  const castContext = window.cast?.framework.CastContext.getInstance();
  if (!castContext) throw new Error("Google Cast is not available in this browser.");
  if (!castContext.getCurrentSession()) await castContext.requestSession();
  const session = castContext.getCurrentSession();
  if (!session) throw new Error("No Cast session is connected.");
  await session.sendMessage(namespace, { type: "join-room", code });
}

export async function initializeCastReceiver(
  namespace: string,
  onRoomCode: (code: string) => void,
) {
  await loadScript(receiverScriptId, "https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js");
  const context = window.cast?.framework.CastReceiverContext?.getInstance();
  if (!context) throw new Error("Google Cast receiver is unavailable.");
  context.addCustomMessageListener(namespace, (event) => {
    if (!event.data || typeof event.data !== "object") return;
    const message = event.data as { type?: string; code?: string };
    if (message.type === "join-room" && message.code) onRoomCode(message.code.toUpperCase());
  });
  context.start({ disableIdleTimeout: true });
}

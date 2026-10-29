import { muteGameSound } from "./client";

export type H5Config = {
  enabled: boolean;
  clientId: string;
  testMode: boolean;
};
type Options = {
  type?: "start";
  name?: string;
  sound?: "on" | "off";
  preloadAdBreaks?: "on";
  onReady?: () => void;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: { breakStatus: string }) => void;
};
declare global {
  interface Window {
    adsbygoogle?: { push: (options: Options) => unknown };
    adBreak?: (options: Options) => void;
    adConfig?: (options: Options) => void;
    googlefc?: {
      callbackQueue: Record<string, () => void>[];
      showRevocationMessage?: () => void;
    };
    __tcfapi?: (
      command: "addEventListener",
      version: number,
      callback: (
        data: {
          gdprApplies?: boolean;
          eventStatus?: string;
          purpose?: { consents?: Record<number, boolean> };
          vendor?: { consents?: Record<number, boolean> };
        },
        success: boolean,
      ) => void,
    ) => void;
  }
}

let config: H5Config | null = null;
let apiReady = false;
let allowed = false;
let failed = false;
let preloadConfigured = false;
let attempt: { matchId: string; done: Promise<void> } | null = null;

export function initializeH5(next: H5Config) {
  if (!next.enabled || !/^ca-pub-\d{16}$/.test(next.clientId)) return false;
  // Google's script attributes are fixed for the document; reload to change mode.
  if (config)
    return (
      config.clientId === next.clientId && config.testMode === next.testMode
    );
  config = next;
  window.adsbygoogle ||= [] as Options[];
  const push = (options: Options) => {
    window.adsbygoogle!.push(options);
  };
  window.adBreak = push;
  window.adConfig = push;
  window.googlefc ||= { callbackQueue: [] };
  window.googlefc.callbackQueue ||= [];
  const preload = () => {
    if (preloadConfigured) return;
    preloadConfigured = true;
    window.adConfig!({
      preloadAdBreaks: "on",
      sound: "off",
      onReady: () => {
        apiReady = true;
      },
    });
  };
  if (next.testMode) {
    allowed = true;
    preload();
  } else
    window.googlefc.callbackQueue.push({
      CONSENT_DATA_READY: () => {
        window.__tcfapi?.("addEventListener", 2, (data, success) => {
          allowed =
            success &&
            (data.gdprApplies === false ||
              ((data.eventStatus === "tcloaded" ||
                data.eventStatus === "useractioncomplete") &&
                data.purpose?.consents?.[1] === true &&
                data.vendor?.consents?.[755] === true));
          if (allowed) preload();
        });
      },
    });
  return true;
}

export function h5ScriptFailed() {
  failed = true;
}

export function showPregameAd(
  matchId: string,
  expected: { clientId: string; testMode: boolean },
  isCurrent: () => boolean,
  onShowing: (showing: boolean) => void,
): Promise<void> {
  if (attempt?.matchId === matchId) return attempt.done;
  try {
    if (sessionStorage.getItem("mathrix_h5_match") === matchId)
      return Promise.resolve();
    sessionStorage.setItem("mathrix_h5_match", matchId);
  } catch {
    /* A storage restriction must not prevent play. */
  }
  const done = (async () => {
    // ponytail: wait at most 5s for SDK readiness; slow loads can serve the next match.
    const deadline = Date.now() + 5000;
    while (!apiReady && !failed && isCurrent() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (
      !apiReady ||
      failed ||
      !allowed ||
      !isCurrent() ||
      config?.clientId !== expected.clientId ||
      config.testMode !== expected.testMode
    )
      return;
    await new Promise<void>((resolve) => {
      try {
        window.adConfig!({
          sound: localStorage.getItem("mathrix_sound") === "on" ? "on" : "off",
        });
        window.adBreak!({
          type: "start",
          name: "before-match",
          beforeAd: () => {
            if (!allowed || !isCurrent())
              throw Error("Match placement expired");
            muteGameSound(true);
            onShowing(true);
          },
          afterAd: () => {
            muteGameSound(false);
            onShowing(false);
          },
          adBreakDone: () => {
            muteGameSound(false);
            onShowing(false);
            resolve();
          },
        });
      } catch {
        muteGameSound(false);
        onShowing(false);
        resolve();
      }
    });
  })();
  attempt = { matchId, done };
  return done;
}

export function onPrivacyReady(callback: () => void) {
  window.googlefc ||= { callbackQueue: [] };
  window.googlefc.callbackQueue ||= [];
  window.googlefc.callbackQueue.push({ CONSENT_API_READY: callback });
}

export function showPrivacySettings() {
  window.googlefc?.callbackQueue.push({
    CONSENT_API_READY: () => window.googlefc?.showRevocationMessage?.(),
  });
}

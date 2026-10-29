"use client";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { api, getPreference, sound, type Me } from "@/lib/client";
import { SessionStatus, useSession } from "@/lib/session";
import {
  createGame,
  startGame,
  getGameStage,
  advancePracticeStage,
  useOperation as playOperation,
  tickGame,
  finishGame,
  publicGame,
  playPracticeAI,
  skipTurn,
  registry,
  legalTargets,
  isShieldActive,
  isCellProtected,
  calculateScore,
  MAX_CARD_SLOTS,
  type PublicGame,
  type Card,
  type Target,
  type Shield,
  type Game,
} from "@/lib/engine";
import {
  defaultBalance,
  speeds,
  aiDifficulties,
  matchLabel,
  type AIDifficulty,
  type Speed,
  type QueueCounts,
  type PlayOptions,
} from "@/lib/config";
import { GuestAccount, GuestPlay } from "../guest-account";
import type { AdExperience } from "@/server/ads";
import { showPregameAd } from "@/lib/h5-ads";
import PlayerIdentity from "../player-identity";
import { avatarURL } from "@/lib/profile";
import { MatrixIcon, ShieldIcon } from "../icons";
import MathFacts from "./math-facts";
function tileAppearance(id: string): CSSProperties {
  let seed = 0;
  for (const character of id)
    seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  return {
    "--tile-angle": `${seed % 360}deg`,
    "--tile-strength": `${12 + ((seed >>> 8) % 17)}%`,
  } as CSSProperties;
}
function tileSummary(
  card: Card,
  growth: number,
  player: PublicGame["players"][number],
) {
  const def = registry[card.operation];
  if (def.kind === "power_limit")
    return `Raise your Maximum ${card.operation === "add_max_square" ? "Square" : "Cube"} by ${card.value}. Pass the turn.`;
  if (def.kind === "square" || def.kind === "cube")
    return `${def.kind === "square" ? "Square" : "Cube"} a cell with absolute value ≤ ${def.kind === "square" ? player.maxSquare : player.maxCube}. Pass the turn.`;
  if (def.kind === "grow")
    return `Add a ${card.operation === "add_row" ? "row" : "column"} filled with ${growth} to either matrix. Pass the turn.`;
  if (def.kind === "unlock")
    return "Add a shared tile slot, up to eight. Pass the turn.";
  if (def.kind === "sqrt")
    return "Take a square root. Substitute the match's i for imaginary results; round down.";
  if (def.kind === "shield" && def.seconds)
    return `Block opponent changes for ${def.seconds}s.`;
  if (def.kind === "remove")
    return `Remove an opponent ${def.target.toLowerCase()}. Shields block removal.`;
  if (def.kind === "reverse")
    return "Reverse a cell’s digits, keeping its sign. Drop leading zeros.";
  if (def.kind === "determinant")
    return "Use the matrix’s determinant for one cell. Square matrices only.";
  return def.description
    .split(". ")[0]
    .replace(/\bN\b/g, String(card.value))
    .replace(/\.?$/, ".");
}
type WaitingRoom = { code: string; expiresAt: number; speed: Speed };
function clearInvitation() {
  const url = new URL(location.href);
  if (!url.searchParams.has("room")) return;
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
}
export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <section className="narrow" role="status">
          Loading game…
        </section>
      }
    >
      <PlayMode />
    </Suspense>
  );
}
function PlayMode() {
  const params = useSearchParams();
  const { me } = useSession();
  const practice = params.get("mode") === "practice";
  useEffect(() => {
    if (!practice && me?.importPending)
      location.replace(
        `/auth/complete${params.get("room") ? `?room=${encodeURIComponent(params.get("room")!)}` : ""}`,
      );
  }, [practice, me?.importPending, params]);
  return (
    <Play
      key={practice ? "practice" : me?.id || "anonymous"}
      practice={practice}
      invitation={params.get("room") || ""}
    />
  );
}
function Play({
  practice,
  invitation,
}: {
  practice: boolean;
  invitation: string;
}) {
  const { me: account, loading, refresh } = useSession();
  const playerId = practice || account?.importPending ? undefined : account?.id;
  const [choice, setChoice] = useState<"menu" | "create" | "join">(
    invitation ? "join" : "menu",
  );
  const [roomSpeed, setRoomSpeed] = useState<Speed>(1);
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>("average");
  const [searchLabel, setSearchLabel] = useState("");
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [currentRank, setCurrentRank] = useState<
    number | null | "loading" | "unavailable"
  >("loading");
  const [rankVersion, setRankVersion] = useState(0);
  const [timing, setTiming] = useState({
    matchMs: defaultBalance.matchMs,
    turnStartMs: defaultBalance.turnStartMs,
    turnEndMs: defaultBalance.turnEndMs,
  });
  const [roomCode, setRoomCode] = useState(invitation),
    [waitingRoom, setWaitingRoom] = useState<WaitingRoom | null>(null),
    [connected, setConnected] = useState(false),
    [pending, setPending] = useState(false),
    [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    setRoomCode(invitation.trim().toUpperCase());
    if (invitation) setChoice("join");
  }, [invitation]);
  const [effect, setEffect] = useState("");
  const [ghosts, setGhosts] = useState<string[]>([]);
  const previousGame = useRef<PublicGame | null>(null);
  const pendingMatch = useRef<string | null>(null);
  const practiceGame = useRef<Game | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [help, setHelp] = useState<Card | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuDialog = useRef<HTMLDialogElement | null>(null);
  const [profilePlayer, setProfilePlayer] = useState<number | null>(null);
  const profileDialog = useRef<HTMLDialogElement | null>(null);
  const [mobileKeyboardHints, setMobileKeyboardHints] = useState(false);
  const [targetOpponent, setTargetOpponent] = useState(false);
  const board = useRef<HTMLDivElement | null>(null);
  const [practicePlayer, setPracticePlayer] = useState<Me | null>(null);
  const me = practice ? practicePlayer : account;
  const [game, setGame] = useState<PublicGame | null>(null),
    [ad, setAd] = useState<AdExperience | null>(null),
    [adLeft, setAdLeft] = useState(0),
    [adPlaying, setAdPlaying] = useState(false),
    [readyAt, setReadyAt] = useState(0),
    [readyDeadline, setReadyDeadline] = useState(0),
    [status, setStatus] = useState("Connecting…"),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Card | null>(null),
    [clock, setClock] = useState(0),
    [saved, setSaved] = useState(false);
  const socket = useRef<Socket | null>(null),
    offset = useRef(0),
    seen = useRef("");
  const showingModes = !game && !waitingRoom && !status.includes("Searching");
  useEffect(() => {
    const saved = getPreference("mathrix_ai_difficulty");
    if (aiDifficulties.includes(saved as AIDifficulty))
      setAIDifficulty(saved as AIDifficulty);
  }, []);
  useEffect(() => {
    setMobileKeyboardHints(
      getPreference("mathrix_mobile_keyboard_hints") === "on",
    );
  }, []);
  useEffect(() => {
    if (practice || !playerId || !connected || !showingModes) return;
    let disposed = false;
    api<PlayOptions>("/api/play-options")
      .then(({ currentRank, ...timing }) => {
        if (disposed) return;
        setTiming(timing);
        setCurrentRank(currentRank ?? null);
      })
      .catch(() => {
        if (!disposed) setCurrentRank("unavailable");
      });
    return () => {
      disposed = true;
    };
  }, [practice, playerId, connected, showingModes, rankVersion]);
  const receiveGame = useCallback(
    (g: PublicGame, playerId: string) => {
      offset.current = g.serverNow - Date.now();
      const old = previousGame.current;
      if (
        g.lastAction?.data.effect === "blocked" &&
        g.lastAction.at !== old?.lastAction?.at
      ) {
        setEffect("PROTECTED: opponent change blocked");
        sound("block");
        setTimeout(() => setEffect(""), 1500);
      }
      if (
        g.lastAction &&
        ["TIMEOUT", "PRACTICE_PASS", "SKIP_TURN"].includes(g.lastAction.type) &&
        g.seq !== old?.seq
      ) {
        setGhosts(g.lastAction.data.destroyed as string[]);
        setTimeout(() => setGhosts([]), 650);
      }
      previousGame.current = g;
      if (g.status === "playing")
        setStatus(practice ? "Learning at your own pace" : "Connected");
      setGame(g);
      if (g.status === "finished") {
        setHelp(null);
        setMenuOpen(false);
      }
      setSelected(null);
      setTargetOpponent(false);
      if (g.status === "finished")
        sound(
          g.result?.winner === g.players.findIndex((x) => x.id === playerId)
            ? "win"
            : "loss",
        );
      else sound(g.status === "countdown" ? "countdown" : "operation");
    },
    [practice],
  );
  const publishPractice = useCallback(() => {
    const g = practiceGame.current;
    if (g) receiveGame(structuredClone(publicGame(g)), g.players[0].id);
  }, [receiveGame]);
  const startPractice = useCallback(() => {
    const player = {
      id: "practice-player",
      name: "You",
      registered: false,
      role: "GUEST",
    };
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const g = createGame(
      crypto.randomUUID(),
      seed,
      [player, { id: "practice-ai", name: "Very basic AI", registered: false }],
      defaultBalance,
      Date.now(),
      "practice",
    );
    g.ready = [true, true];
    startGame(g, Date.now());
    practiceGame.current = g;
    previousGame.current = null;
    setPracticePlayer(player);
    setHelp(null);
    setError("");
    setEffect("");
    setGhosts([]);
    publishPractice();
  }, [publishPractice]);
  useEffect(() => {
    if (practice) {
      startPractice();
      return () => {
        practiceGame.current = null;
        previousGame.current = null;
      };
    }
    if (!playerId) return;
    const s = io(process.env.NEXT_PUBLIC_GAME_URL || location.origin, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.current = s;
    const clearGame = () => {
      previousGame.current = null;
      setGame(null);
      setAd(null);
      setSaved(false);
    };
    s.on("connect", () => {
      pendingMatch.current = null;
      setConnected(true);
      setPending(false);
      setWaitingRoom(null);
      setStatus("Ready to play");
    });
    s.on("connect_error", (e) => {
      setStatus("Connection failed. Reconnecting…");
      if (e.message === "Authentication required")
        void refresh().catch(() => {});
    });
    s.on("disconnect", () => {
      setConnected(false);
      setCounts(null);
      setPending(false);
      setStatus("Connection lost. Reconnecting…");
    });
    s.on("queue_counts", (counts: QueueCounts) => setCounts(counts));
    s.on("queued", (d: { mode: string; speed: Speed }) => {
      setSearchLabel(matchLabel(d.mode, d.speed));
      clearGame();
      clearInvitation();
      setPending(false);
      setStatus("Searching for opponent…");
    });
    s.on("cancelled", () => {
      setChoice("menu");
      setPending(false);
      setStatus("Ready to play");
    });
    s.on("room_waiting", (room: WaitingRoom | null) => {
      setWaitingRoom(room);
      setPending(false);
      setCopyStatus("");
      if (room) {
        setRoomSpeed(room.speed);
        clearGame();
        clearInvitation();
        setStatus("Waiting for your friend…");
        setError("");
      }
    });
    s.on("room_closed", (d: { message: string }) => {
      setChoice("menu");
      setWaitingRoom(null);
      setPending(false);
      setStatus("Ready to play");
      setError(d.message);
    });
    s.on("match_pending", (d: { matchId: string }) => {
      pendingMatch.current = d.matchId;
      clearGame();
      clearInvitation();
      setWaitingRoom(null);
      setPending(true);
      setStatus("Preparing match…");
      setError("");
    });
    s.on("pregame_cancelled", (d: { matchId: string; message: string }) => {
      if (
        previousGame.current?.id !== d.matchId &&
        pendingMatch.current !== d.matchId
      )
        return;
      pendingMatch.current = null;
      clearGame();
      setPending(false);
      setStatus("Ready to play");
      setError(d.message);
    });
    s.on("notice", (m: string) => setError(m));
    s.on("action_error", (m: string) => {
      setPending(false);
      setError(m);
      if (m === "Session expired or account disabled")
        void refresh().catch(() => {});
    });
    s.on(
      "reserved",
      (d: {
        game: PublicGame;
        ad: AdExperience;
        readyAt: number;
        readyDeadline: number;
      }) => {
        pendingMatch.current = null;
        setWaitingRoom(null);
        setPending(false);
        if (
          d.game.status === "finished" &&
          new URLSearchParams(location.search).has("room")
        ) {
          clearGame();
          setStatus("Ready to join room");
          return;
        }
        offset.current = d.game.serverNow - Date.now();
        previousGame.current = d.game;
        setGame(d.game);
        setStatus("Opponent found");
        setAd(d.ad);
        setReadyAt(d.readyAt);
        setReadyDeadline(d.readyDeadline);
        setSelected(null);
        setSaved(false);
        setError("");
      },
    );
    s.on("update", (g: PublicGame) => receiveGame(g, playerId));
    s.on("persisted", (d: { matchId: string }) => {
      if (previousGame.current?.id === d.matchId) setSaved(true);
      setRankVersion((version) => version + 1);
    });
    return () => {
      previousGame.current = null;
      s.disconnect();
      socket.current = null;
    };
  }, [practice, playerId, receiveGame, startPractice, refresh]);
  useEffect(() => {
    if (practice && game?.status === "finished") return;
    const t = setInterval(() => {
      const now = Date.now() + offset.current;
      setClock(now);
      const g = practiceGame.current;
      if (g && tickGame(g, now)) publishPractice();
    }, 50);
    return () => clearInterval(t);
  }, [practice, game?.status, publishPractice]);
  useEffect(() => {
    if (
      !practice ||
      help ||
      menuOpen ||
      profilePlayer !== null ||
      game?.status !== "playing" ||
      game.active !== 1
    )
      return;
    const t = setTimeout(() => {
      const g = practiceGame.current;
      if (
        g?.id === game.id &&
        g.seq === game.seq &&
        playPracticeAI(g, Date.now())
      )
        publishPractice();
    }, 600);
    return () => clearTimeout(t);
  }, [practice, game, help, menuOpen, profilePlayer, publishPractice]);
  useEffect(() => {
    if (help) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [help]);
  useEffect(() => {
    if (menuOpen) menuDialog.current?.showModal();
    else menuDialog.current?.close();
  }, [menuOpen]);
  useEffect(() => {
    if (profilePlayer !== null && game?.status === "playing") {
      if (!profileDialog.current?.open) profileDialog.current?.showModal();
    } else {
      profileDialog.current?.close();
      if (profilePlayer !== null) setProfilePlayer(null);
    }
  }, [profilePlayer, game?.status]);
  useEffect(() => {
    if (!selected) return;
    const tile = board.current?.querySelector<HTMLElement>(
      ".card-slot.selected",
    );
    const tray = tile?.parentElement;
    if (tile && tray) {
      const box = tile.getBoundingClientRect(),
        bounds = tray.getBoundingClientRect();
      if (box.left < bounds.left) tray.scrollLeft += box.left - bounds.left;
      else if (box.right > bounds.right)
        tray.scrollLeft += box.right - bounds.right;
      if (box.top < bounds.top) tray.scrollTop += box.top - bounds.top;
      else if (box.bottom > bounds.bottom)
        tray.scrollTop += box.bottom - bounds.bottom;
    }
  }, [selected]);
  const pregameId = game?.status === "pregame" ? game.id : null;
  const ownReady =
    game?.ready[game.players.findIndex((x) => x.id === me?.id)] ?? false;
  useEffect(() => {
    if (!pregameId || ownReady || !ad || !playerId) return;
    if (ad.kind === "house" && seen.current !== pregameId) {
      socket.current?.emit("ad_seen");
      seen.current = pregameId;
    }
    let disposed = false,
      completed = ad.kind !== "h5",
      sent = false;
    const isCurrent = () =>
      previousGame.current?.id === pregameId &&
      previousGame.current.status === "pregame" &&
      Date.now() + offset.current < readyDeadline;
    const tick = () => {
      if (disposed) return;
      const left = Math.max(0, readyAt - Date.now() - offset.current);
      setAdLeft(left);
      if (
        left === 0 &&
        completed &&
        !sent &&
        isCurrent() &&
        socket.current?.connected
      ) {
        socket.current.emit("ready", { matchId: pregameId });
        sent = true;
      }
    };
    if (ad.kind === "h5" && ad.h5) {
      void showPregameAd(pregameId, ad.h5, isCurrent, setAdPlaying).then(() => {
        completed = true;
        tick();
      });
    }
    tick();
    const interval = setInterval(tick, 100);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [pregameId, ownReady, ad, playerId, readyAt, readyDeadline]);
  const requestMatch = (
    command:
      | "queue"
      | "room_create"
      | "room_join"
      | "room_cancel"
      | "cancel"
      | "ai_start",
    options: {
      mode?: "ranked" | "casual";
      speed?: Speed;
      difficulty?: AIDifficulty;
    } = {},
  ) => {
    if (adPlaying || pending || !socket.current?.connected) return;
    setPending(true);
    setError("");
    socket.current.emit(command, {
      consent: getPreference("mathrix_ad_consent") === "yes",
      ...(command === "room_join" ? { code: roomCode } : {}),
      ...(command === "room_create" || command === "ai_start"
        ? { speed: roomSpeed }
        : {}),
      ...options,
    });
  };
  const queue = (
    mode: "ranked" | "casual" = game?.mode === "casual" ? "casual" : "ranked",
    speed: Speed = game?.speed ?? 1,
  ) => requestMatch("queue", { mode, speed });
  const turnTimingText = (speed: Speed) =>
    `Turn duration starts at ${(timing.turnStartMs * speed) / 1000}s and shrink to ${timing.turnEndMs / 1000}s`;
  const timingText = (speed: Speed) =>
    `${(timing.matchMs * speed) / 1000}s · ${turnTimingText(speed)}`;
  const timingDetails = (speed: Speed) => (
    <>
      <small>Match duration: {(timing.matchMs * speed) / 1000}s</small>
      <small>{turnTimingText(speed)}</small>
    </>
  );
  const queueText = (count: number | undefined) =>
    count === undefined
      ? "Queue unavailable"
      : `${count} ${count === 1 ? "player" : "players"} in queue`;
  async function copyInvite(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied!");
    } catch {
      setCopyStatus("Select the code or link above to copy it.");
    }
  }
  const practiceAction = useCallback(
    (action: (g: Game, now: number) => void) => {
      const g = practiceGame.current;
      if (!g) return;
      try {
        const now = Date.now();
        tickGame(g, now);
        action(g, now);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
      publishPractice();
    },
    [publishPractice],
  );
  const targetingLine =
    !!selected &&
    ["ROW", "COLUMN"].includes(registry[selected.operation].target);
  const targetingMatrix =
    !!selected &&
    ["MATRIX", "STRUCTURE"].includes(registry[selected.operation].target);
  useEffect(() => {
    if (
      game?.status !== "playing" ||
      game.players[game.active].id !== me?.id ||
      (!practice && !connected) ||
      help
    )
      return;
    function keydown(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest("input, textarea, select"))) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.key.toLowerCase() === "q") {
        const button = Array.from(
          board.current?.querySelectorAll<HTMLButtonElement>(".skip-turn") ??
            [],
        ).find((candidate) => candidate.getClientRects().length > 0);
        if (button && !button.disabled) {
          e.preventDefault();
          button.click();
        }
        return;
      }
      if (e.key === "Escape" && selected) {
        e.preventDefault();
        setSelected(null);
        setTargetOpponent(false);
        setError("");
        return;
      }
      if (e.key === "Shift" && targetingLine) {
        e.preventDefault();
        setTargetOpponent((opponent) => !opponent);
        setError("");
        return;
      }
      const digit = /^\d$/.test(e.key)
        ? e.key
        : /^Digit\d$/.test(e.code)
          ? e.code.slice(-1)
          : null;
      if (digit === null) return;
      const button = board.current?.querySelector<HTMLButtonElement>(
        `${targetingMatrix ? ".matrix-wrap > .matrix-target" : targetingLine ? `.matrix-panel.${targetOpponent ? "opponent" : "self"} .axis` : ".card"}[aria-keyshortcuts="${digit}"]`,
      );
      if (button && !button.disabled) {
        e.preventDefault();
        button.click();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    game,
    me?.id,
    practice,
    connected,
    help,
    selected,
    targetingLine,
    targetingMatrix,
    targetOpponent,
  ]);
  if ((!practice && (loading || account?.importPending)) || (practice && !me))
    return (
      <section className="narrow">
        <SessionStatus />
      </section>
    );
  if (!me)
    return (
      <section className="narrow">
        <h1>Enter the matrix</h1>
        <p>
          {invitation
            ? "Play as a guest or sign in to join your friend's room."
            : "Play as a guest with saved progress, or sign in to your account."}
        </p>
        <GuestPlay
          className="primary"
          destination={
            invitation
              ? `/play?room=${encodeURIComponent(invitation)}`
              : "/play"
          }
        />
        <Link
          className="button"
          href={
            invitation
              ? `/auth?room=${encodeURIComponent(invitation)}`
              : "/auth"
          }
        >
          Sign in
        </Link>
        <Link className="button" href="/play?mode=practice">
          Practice mode
        </Link>
        <p>Learn at your own pace against a very basic AI. No time limit.</p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!game)
    return (
      <section className="narrow queue-screen">
        <div className={status.includes("Searching") ? "scanner" : ""}>
          <MatrixIcon />
        </div>
        <h1 role="status">{status}</h1>
        <p>
          {me.name} / {waitingRoom ? "PRIVATE ROOM" : "PLAY"}
        </p>
        <p>One opponent. One shared deck. Your move.</p>
        {waitingRoom ? (
          <div className="room-invite">
            <p>{matchLabel("custom", waitingRoom.speed)} · Unranked</p>
            <label>
              Room code
              <input
                className="room-code"
                readOnly
                value={waitingRoom.code}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label>
              Invite link
              <input
                readOnly
                value={`${location.origin}/play?room=${waitingRoom.code}`}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="actions">
              <button onClick={() => copyInvite(waitingRoom.code)}>
                Copy code
              </button>
              <button
                onClick={() =>
                  copyInvite(`${location.origin}/play?room=${waitingRoom.code}`)
                }
              >
                Copy invite link
              </button>
              <button
                disabled={!connected || pending}
                onClick={() => requestMatch("room_cancel")}
              >
                Cancel room
              </button>
            </div>
            <p role="status">{copyStatus}</p>
            <p className="muted">
              Invite one friend. The game starts when they join. Code expires at{" "}
              {new Date(waitingRoom.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
        ) : status.includes("Searching") ? (
          <div>
            <p>{searchLabel}</p>
            <button
              disabled={!connected || pending}
              onClick={() => requestMatch("cancel")}
            >
              Cancel search
            </button>
          </div>
        ) : (
          <>
            <div className="mode-groups">
              <section className="mode-group" aria-labelledby="ranked-heading">
                <h2 id="ranked-heading">Ranked</h2>
                <div className="mode-grid mode-grid-single">
                  <button
                    className="ranked-mode"
                    aria-label="Ranked mode"
                    onClick={() => queue("ranked", 1)}
                    disabled={!connected || pending || adPlaying}
                  >
                    <strong>Ranked mode</strong>
                    <small>Counts toward rank</small>
                    {timingDetails(1)}
                    <span className="mode-queue">
                      {queueText(counts?.ranked)}
                    </span>
                  </button>
                </div>
                <p className="current-rank">
                  Your current rank:{" "}
                  <strong>
                    {typeof currentRank === "number"
                      ? `#${currentRank}`
                      : currentRank === null
                        ? "Unranked"
                        : currentRank === "loading"
                          ? "Loading…"
                          : "Unavailable"}
                  </strong>
                </p>
              </section>
              {(["casual", "ai"] as const).map((mode) => (
                <section
                  key={mode}
                  className="mode-group"
                  aria-labelledby={`${mode}-heading`}
                >
                  <h2 id={`${mode}-heading`}>
                    {mode === "casual" ? "Casual mode" : "Play vs the AI"}
                  </h2>
                  <p>
                    {mode === "casual"
                      ? "Casual games count toward overall stats, but never change your rating."
                      : "Choose a difficulty, then a speed to play. Normal game rules apply. Matches are saved in your history without changing your rating or overall stats."}
                  </p>
                  {mode === "ai" && (
                    <fieldset
                      className="ai-difficulty"
                      disabled={pending || adPlaying}
                    >
                      <legend>AI difficulty</legend>
                      <div className="ai-difficulty-bar">
                        {aiDifficulties.map((difficulty) => (
                          <label key={difficulty} data-difficulty={difficulty}>
                            <input
                              type="radio"
                              name="ai-difficulty"
                              value={difficulty}
                              checked={aiDifficulty === difficulty}
                              onChange={() => {
                                setAIDifficulty(difficulty);
                                try {
                                  localStorage.setItem(
                                    "mathrix_ai_difficulty",
                                    difficulty,
                                  );
                                } catch {
                                  // Keep playing when browser storage is unavailable.
                                }
                              }}
                            />
                            {difficulty[0].toUpperCase() + difficulty.slice(1)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div className="mode-grid">
                    {speeds.map((speed) => (
                      <button
                        key={speed}
                        aria-label={`${mode === "casual" ? "Casual" : "Play vs AI"} x${speed}`}
                        onClick={() =>
                          mode === "casual"
                            ? queue("casual", speed)
                            : requestMatch("ai_start", {
                                speed,
                                difficulty: aiDifficulty,
                              })
                        }
                        disabled={!connected || pending || adPlaying}
                      >
                        <strong>x{speed}</strong>
                        {timingDetails(speed)}
                        {mode === "casual" && (
                          <span className="mode-queue">
                            {queueText(counts?.casual[speed])}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <section className="mode-group" aria-labelledby="rooms-heading">
                <h2 id="rooms-heading">Private Rooms</h2>
                <div className="mode-grid">
                  <button
                    aria-label="Create room"
                    aria-expanded={choice === "create"}
                    onClick={() =>
                      setChoice(choice === "create" ? "menu" : "create")
                    }
                    disabled={!connected || pending || adPlaying}
                  >
                    <strong>Create room</strong>
                    <small>Invite a friend · unranked</small>
                  </button>
                  <button
                    aria-label="Join room"
                    aria-expanded={choice === "join"}
                    onClick={() =>
                      setChoice(choice === "join" ? "menu" : "join")
                    }
                    disabled={!connected || pending || adPlaying}
                  >
                    <strong>Join room</strong>
                    <small>Enter an invitation code</small>
                  </button>
                </div>
                {choice === "create" && (
                  <form
                    className="room-invite"
                    aria-label="Create a private room"
                    onSubmit={(e) => {
                      e.preventDefault();
                      requestMatch("room_create");
                    }}
                  >
                    <h3>Create an unranked room</h3>
                    <label>
                      Room speed
                      <select
                        value={roomSpeed}
                        onChange={(e) =>
                          setRoomSpeed(Number(e.target.value) as Speed)
                        }
                      >
                        {speeds.map((speed) => (
                          <option key={speed} value={speed}>
                            x{speed} · {timingText(speed)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={!connected || pending || adPlaying}
                    >
                      Create room
                    </button>
                  </form>
                )}
                {choice === "join" && (
                  <form
                    className="room-join"
                    aria-label="Join a private room"
                    onSubmit={(e) => {
                      e.preventDefault();
                      requestMatch("room_join");
                    }}
                  >
                    <label>
                      Room code
                      <input
                        name="room"
                        value={roomCode}
                        onChange={(e) =>
                          setRoomCode(e.target.value.trim().toUpperCase())
                        }
                        required
                        pattern="[A-HJ-NP-Z2-9]{6}"
                        title="Enter the six-character room code"
                        maxLength={12}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        placeholder="ABC234"
                      />
                    </label>
                    <button disabled={!connected || pending || adPlaying}>
                      Join room
                    </button>
                  </form>
                )}
              </section>
              <section
                className="mode-group"
                aria-labelledby="practice-heading"
              >
                <h2 id="practice-heading">Practice mode</h2>
                <p>
                  Learn against a very basic AI without match or turn time
                  limits. You start first, advance stages yourself, and finish
                  whenever you’re ready. Time-changing tiles are excluded, and
                  practice doesn’t affect your history, stats or rating.
                </p>
                <div className="mode-grid mode-grid-single">
                  <Link
                    className="button"
                    aria-label="Practice mode"
                    href="/play?mode=practice"
                  >
                    <strong>Practice mode</strong>
                    <small>Learn at your own pace</small>
                  </Link>
                </div>
              </section>
            </div>
          </>
        )}
        {(waitingRoom || status.includes("Searching")) && (
          <>
            <Link className="button" href="/play?mode=practice">
              Practice mode
            </Link>
            <p>
              Learn at your own pace against a very basic AI. No time limit.
            </p>
          </>
        )}
        <Link href="/how-to-play">Learn the rules while you wait</Link>
        {!me.registered && <GuestAccount room={invitation} />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  const seat = game.players.findIndex((p) => p.id === me.id),
    active = game.active === seat,
    own = game.players[seat],
    growthValue = Math.min(own.destroyedTiles, game.config.maxCellValue);
  const disconnectWarning = !practice &&
    connected &&
    game.disconnectedAt[1 - seat] !== null && (
      <strong className="error" role="alert">
        Opponent disconnected. Waiting for reconnection…
      </strong>
    );
  const iLabel = (
    <span
      aria-label="Match i value"
      title="Shared for this match. Substitute this value for i in imaginary results, then round down."
    >
      i = {game.iValue}
    </span>
  );
  if (game.status === "pregame")
    return (
      <section className="narrow pregame">
        <h1>
          <PlayerIdentity player={game.players[1 - seat]} />
        </h1>
        <p>
          OPPONENT FOUND /{" "}
          {matchLabel(game.mode, game.speed, game.aiDifficulty)}
        </p>
        <p>Both players start together. Your game clock has not started.</p>
        {disconnectWarning && <p>{disconnectWarning}</p>}
        <p>{iLabel}</p>
        {ad?.kind === "h5" && ad.h5?.testMode && (
          <p className="muted">Google test ad · no revenue is generated.</p>
        )}
        {game.mode !== "ai" &&
        own.premium &&
        !game.players[1 - seat].premium ? (
          <MathFacts />
        ) : ad?.kind === "house" && ad.campaign ? (
          <article className="house-ad">
            <small>ADVERTISEMENT · HOUSE CAMPAIGN</small>
            {ad.campaign.image_url && (
              <img
                src={ad.campaign.image_url}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <h2>{ad.campaign.headline}</h2>
            <p>{ad.campaign.body}</p>
            <a
              className="button"
              href={ad.campaign.destination_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() =>
                void api("/api/ad/click", { impressionId: ad.impressionId })
              }
            >
              {ad.campaign.cta} ↗
            </a>
          </article>
        ) : ad?.kind === "mock" ? (
          <article className="house-ad">
            <small>ADVERTISEMENT · TEST PLACEMENT</small>
            <h2>A place for your next great idea.</h2>
            <p>Safe mock experience. No external provider is loaded.</p>
          </article>
        ) : (
          <div className="ready-orb">✓</div>
        )}
        <p role="status">
          {adPlaying
            ? "Advertisement in progress…"
            : adLeft > 0
              ? `Getting ready in ${Math.ceil(adLeft / 1000)}s`
              : game.mode === "ai"
                ? "Starting match…"
                : "Opponent is getting ready…"}
        </p>
        {!own.premium && (
          <p className="muted">You never need to click an ad to play.</p>
        )}
      </section>
    );
  if (game.status === "countdown")
    return (
      <section className="countdown">
        <p>
          GET READY,{" "}
          <span className={own.premium ? "gold-name" : ""}>{own.name}</span>
        </p>
        <div key={Math.ceil((game.startedAt - clock) / 1000)}>
          {Math.max(1, Math.ceil((game.startedAt - clock) / 1000))}
        </div>
        <p>Make every number count.</p>
        {disconnectWarning && <p>{disconnectWarning}</p>}
        <p>{iLabel}</p>
      </section>
    );
  if (game.status === "finished")
    return (
      <section className="results">
        <h1>
          {game.result?.winner === null
            ? "Perfectly balanced."
            : game.result?.winner === seat
              ? "You own the matrix."
              : "A worthy opponent."}
        </h1>
        <p>
          {practice
            ? "PRACTICE COMPLETE / VERY BASIC AI"
            : `MATCH COMPLETE / ${matchLabel(game.mode, game.speed, game.aiDifficulty)} / ${game.result?.reason}`}
        </p>
        <p>{iLabel}</p>
        <div className="result-scores">
          {game.players.map((p, i) => (
            <div key={p.id}>
              <h3>
                <PlayerIdentity player={p} />
                {i === seat ? " (you)" : ""}
              </h3>
              <strong>{game.result?.scores[i]}</strong>
              <div
                className="final-grid"
                style={{
                  gridTemplateColumns: `repeat(${p.matrix[0].length},1fr)`,
                }}
              >
                {p.matrix.flat().map((v, n) => (
                  <span key={n}>{v}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={
              practice
                ? startPractice
                : () =>
                    game.mode === "custom"
                      ? requestMatch("room_create", { speed: game.speed })
                      : game.mode === "ai"
                        ? requestMatch("ai_start", {
                            speed: game.speed,
                            difficulty: game.aiDifficulty ?? "average",
                          })
                        : queue()
            }
            disabled={!practice && (!connected || pending)}
          >
            {practice
              ? "Practice again"
              : game.mode === "custom"
                ? "Create another room"
                : "Play again ↗"}
          </button>
          {practice ? (
            <Link className="button" href="/play">
              Back to Play
            </Link>
          ) : saved ? (
            <Link className="button" href={`/matches/${game.id}`}>
              View match details
            </Link>
          ) : (
            <span>Saving match…</span>
          )}
          {!practice && game.mode !== "custom" && game.mode !== "ai" && (
            <button
              onClick={() => requestMatch("room_create", { speed: game.speed })}
              disabled={!connected || pending}
            >
              Create another room
            </button>
          )}
          {!practice && invitation && (
            <button
              onClick={() => requestMatch("room_join")}
              disabled={!connected || pending}
            >
              Join invited room
            </button>
          )}
          {!practice && (
            <>
              <button
                disabled={pending}
                onClick={() => {
                  previousGame.current = null;
                  setGame(null);
                  setChoice("menu");
                  setStatus("Ready to play");
                  clearInvitation();
                }}
              >
                Back to modes
              </button>
              <Link href="/profile">Your profile</Link>
            </>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        {practice && (
          <p>
            Practice is for learning. Your rating and stats are not affected.
          </p>
        )}
        {game.mode === "ai" && (
          <p>
            Vs AI results are saved in your history. Your rating and overall
            stats are unchanged.
          </p>
        )}
        {!practice && !me.registered && <GuestAccount />}
      </section>
    );
  const view = game,
    canAct = active && (practice || connected);
  const targets = selected ? legalTargets(view, seat, selected, clock) : [];
  const shieldLabel = (shield: Shield) =>
    isShieldActive(shield, clock)
      ? typeof shield === "number"
        ? `protected for ${Math.ceil((shield - clock) / 1000)} seconds`
        : "shielded"
      : "unprotected";
  function shieldMarker(shield: Shield) {
    if (!isShieldActive(shield, clock)) return null;
    return (
      <span className="shield-countdown" aria-hidden="true">
        <ShieldIcon />
        {typeof shield === "number"
          ? ` ${Math.ceil((shield - clock) / 1000)}s`
          : ""}
      </span>
    );
  }
  const legal = (t: Target, choices = targets) =>
    choices.some(
      (x) => x.player === t.player && x.row === t.row && x.column === t.column,
    );
  const axisShortcut = (t: Target) =>
    canAct &&
    !help &&
    targetingLine &&
    t.player === (targetOpponent ? 1 - seat : seat) &&
    legal(t)
      ? String(t.row ?? game.players[t.player].matrix.length + t.column!)
      : undefined;
  function choose(t: Target, card = selected) {
    if (!canAct || !card) {
      setError("Select a card during your turn.");
      return;
    }
    if (!legal(t, legalTargets(view, seat, card, clock))) {
      setError("That target is not legal for this card.");
      sound("block");
      return;
    }
    setError("");
    if (practice)
      practiceAction((g, now) =>
        playOperation(g, seat, card.id, t, game!.seq, now),
      );
    else
      socket.current?.emit("use", {
        cardId: card.id,
        target: t,
        seq: game!.seq,
      });
    setSelected(null);
    setTargetOpponent(false);
  }
  function skipButton(className: string) {
    return (
      <button
        className={`skip-turn ${className}`}
        disabled={!canAct}
        aria-label="Skip turn"
        aria-keyshortcuts="Q"
        title={`Replace ${Math.ceil(game!.cards.length / 2)} shared tiles, add them to your growth total and pass the turn`}
        onClick={() => {
          if (practice)
            practiceAction((g, now) => skipTurn(g, seat, game!.seq, now));
          else
            socket.current?.emit("skip", {
              matchId: game!.id,
              seq: game!.seq,
            });
          setSelected(null);
          setTargetOpponent(false);
        }}
      >
        <span>Skip turn</span>
        <kbd className="shortcut" aria-hidden="true">
          Q
        </kbd>
      </button>
    );
  }
  function matrix(player: number) {
    const p = game!.players[player];
    const shortcut =
      canAct && !help && targetingMatrix && legal({ player })
        ? player === seat
          ? "1"
          : "2"
        : undefined;
    return (
      <section
        className={`matrix-panel ${player === seat ? "self" : "opponent"} ${game!.active === player ? "active" : ""}`}
        aria-label={player === seat ? "Your matrix" : "Opponent matrix"}
        style={
          {
            "--rows": p.matrix.length,
            "--columns": p.matrix[0].length,
          } as CSSProperties
        }
      >
        <div className="matrix-heading">
          <div>
            <small className="matrix-label">
              {player === seat ? "YOUR MATRIX" : "OPPONENT MATRIX"}{" "}
              {game!.active === player ? "· ACTIVE TURN" : ""}
            </small>
            <h2>
              <PlayerIdentity player={p} />
            </h2>
            <div className="player-match-stats">
              <span>
                Rank <b>{p.rank == null ? "-" : `#${p.rank}`}</b>
              </span>
              <span>
                Games <b>{p.played ?? "-"}</b>
              </span>
            </div>
          </div>
        </div>
        <div className="matrix-content">
          <div className="matrix-mobile-heading">
            <h2 className="mobile-player-name" title={p.name}>
              {player === seat ? "You" : p.name}
            </h2>
            {player === seat && skipButton("mobile-skip")}
            <button
              className={`player-avatar-button${p.premium ? " is-premium" : ""}`}
              aria-label={
                player === seat
                  ? "Show your player details"
                  : "Show opponent player details"
              }
              aria-haspopup="dialog"
              onClick={() => setProfilePlayer(player)}
            >
              <img
                className="player-avatar"
                src={avatarURL(p.avatarId)}
                width={36}
                height={36}
                alt=""
              />
            </button>
          </div>
          <div
            className="score"
            aria-label={`Score ${calculateScore(p.matrix)}`}
          >
            <small>Σ SCORE</small>
            <b
              key={calculateScore(p.matrix)}
              className={
                String(calculateScore(p.matrix)).length > 7
                  ? "long-score"
                  : undefined
              }
            >
              {calculateScore(p.matrix)}
            </b>
          </div>
          <div className="player-power-stats">
            <span className="destroyed-total">
              Destroyed tiles <b>{p.destroyedTiles}</b>
            </span>
            <span className="power-total" data-power="square">
              Maximum Square <b>{p.maxSquare}</b>
            </span>
            <span className="power-total" data-power="cube">
              Maximum Cube <b>{p.maxCube}</b>
            </span>
          </div>
          <div
            className="matrix-wrap"
            style={
              {
                "--rows": p.matrix.length,
                "--columns": p.matrix[0].length,
              } as CSSProperties
            }
          >
            <div className="matrix-columns">
              <span />
              {p.matrix[0].map((_, column) => (
                <button
                  key={column}
                  className={`axis ${legal({ player, column }) ? "legal" : ""}`}
                  onClick={() => choose({ player, column })}
                  aria-label={`${player === seat ? "Your" : "Opponent"} column ${column + 1}, ${shieldLabel(p.columnShields[column])}`}
                  aria-keyshortcuts={axisShortcut({ player, column })}
                >
                  C{column + 1}
                  {axisShortcut({ player, column }) !== undefined && (
                    <kbd className="shortcut" aria-hidden="true">
                      {axisShortcut({ player, column })}
                    </kbd>
                  )}
                  {shieldMarker(p.columnShields[column])}
                </button>
              ))}
            </div>
            {p.matrix.map((r, row) => (
              <div
                className={`matrix-row ${isShieldActive(p.rowShields[row], clock) ? "shielded" : ""}`}
                key={row}
              >
                <button
                  className={`axis ${legal({ player, row }) ? "legal" : ""}`}
                  onClick={() => choose({ player, row })}
                  aria-label={`${player === seat ? "Your" : "Opponent"} row ${row + 1}, ${shieldLabel(p.rowShields[row])}`}
                  aria-keyshortcuts={axisShortcut({ player, row })}
                >
                  R{row + 1}
                  {axisShortcut({ player, row }) !== undefined && (
                    <kbd className="shortcut" aria-hidden="true">
                      {axisShortcut({ player, row })}
                    </kbd>
                  )}
                  {shieldMarker(p.rowShields[row])}
                </button>
                {r.map((v, column) => (
                  <button
                    key={column}
                    className={`cell ${v < 0 ? "negative" : ""} ${legal({ player, row, column }) ? "legal" : ""} ${isShieldActive(p.columnShields[column], clock) ? "column-shield" : ""} ${isCellProtected(p, row, column, clock) ? "shielded" : ""}`}
                    onClick={() => choose({ player, row, column })}
                    aria-label={`${player === seat ? "Your" : "Opponent"} cell ${row + 1},${column + 1}: ${v}${isCellProtected(p, row, column, clock) ? ", protected from opponent changes" : ""}`}
                  >
                    <span
                      style={
                        { "--value-length": String(v).length } as CSSProperties
                      }
                    >
                      {v}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {selected && targetingMatrix && (
              <button
                disabled={!legal({ player })}
                className={`matrix-target ${legal({ player }) ? "legal" : ""}`}
                onClick={() => choose({ player })}
                aria-keyshortcuts={shortcut}
                aria-label={
                  registry[selected.operation].kind === "grow"
                    ? `Add ${selected.operation === "add_row" ? "row" : "column"} to ${player === seat ? "your" : "opponent"} matrix, ${growthValue} per cell`
                    : undefined
                }
              >
                {registry[selected.operation].target === "STRUCTURE"
                  ? "Grow this matrix"
                  : "Apply to whole matrix"}
                {shortcut && (
                  <>
                    {" "}
                    <kbd className="shortcut" aria-hidden="true">
                      {shortcut}
                    </kbd>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }
  const remaining = Math.max(0, game.endAt - clock),
    turn = Math.max(0, game.turnEndsAt - clock),
    gameStage = getGameStage(game, clock);
  return (
    <div
      className="game"
      ref={board}
      data-mobile-keyboard-hints={mobileKeyboardHints}
    >
      {effect && (
        <div className="block-effect" role="status">
          {effect}
        </div>
      )}
      {ghosts.length > 0 && (
        <div
          className="card-ghosts"
          aria-label={`${ghosts.length} cards destroyed`}
        >
          {ghosts.map((id) => (
            <span key={id}>✕</span>
          ))}
        </div>
      )}
      <div className="game-top">
        <div className="game-label">
          <h1 className="live-dot">
            {practice
              ? "Practice mode"
              : `MATHRIX / ${matchLabel(game.mode, game.speed, game.aiDifficulty)}${game.mode === "ai" ? " · Unranked" : ""}`}
          </h1>
          <span
            className="game-stage"
            aria-label="Game stage"
            aria-live="polite"
          >
            {gameStage.toUpperCase()} STAGE
          </span>
          <small className="game-i-value"> · {iLabel}</small>
        </div>
        {practice ? (
          <strong className="practice-clock">No time limit</strong>
        ) : (
          <div className="game-clocks">
            <strong className={remaining < 15000 ? "urgent" : ""}>
              {(remaining / 1000).toFixed(1)}
              <small> MATCH CLOCK</small>
            </strong>
            <span>{`TURN ${(turn / 1000).toFixed(1)}s`}</span>
          </div>
        )}
        <button
          className="game-menu-button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
        >
          Menu
        </button>
      </div>
      <div className="turn-banner">
        {disconnectWarning ||
          (active
            ? "YOUR TURN: choose a card, then a target if needed"
            : practice
              ? "VERY BASIC AI’S TURN: watch its next move"
              : "OPPONENT’S TURN: watch their next move")}
      </div>
      <div className="boards">
        {matrix(seat)}
        {matrix(1 - seat)}
      </div>
      <section className="pool" aria-label="Shared tiles">
        <div className="pool-heading">
          <span>
            SHARED OPERATIONS / {game.cards.length}/{MAX_CARD_SLOTS}
          </span>
        </div>
        <div className="pool-controls">
          {skipButton("desktop-skip")}
          <p className="shortcut-hint" role="status">
            {canAct && selected
              ? targetingLine
                ? `Targeting ${targetOpponent ? "opponent’s" : "your"} matrix · Digit: target · Shift: switch · Escape: cancel`
                : targetingMatrix
                  ? "1: your matrix · 2: opponent matrix · Escape: cancel"
                  : "Choose a highlighted target · Escape: cancel"
              : "1–8: select · Click or tap a tile; choose a target if needed"}
          </p>
          <p className="touch-hint" role="status">
            {canAct && selected
              ? targetingLine
                ? `Targeting ${targetOpponent ? "opponent’s" : "your"} matrix · Choose a highlighted target`
                : "Choose a highlighted target"
              : "Tap a tile; choose a target if needed"}
          </p>
        </div>
        <div className="cards">
          {game.cards.map((card, index) => {
            const def = registry[card.operation];
            const cardTargets = legalTargets(view, seat, card, clock);
            const enabled = canAct && cardTargets.length > 0;
            const tile = (
              <button
                key={card.id}
                data-card-id={card.id}
                data-operation={card.operation}
                data-tier={def.tier}
                style={tileAppearance(`${game.id}:${card.id}`)}
                aria-label={
                  def.kind === "sqrt"
                    ? `Square root ${def.target.toLowerCase()}`
                    : def.kind === "square"
                      ? `Square ${def.target.toLowerCase()}`
                      : def.kind === "cube"
                        ? `Cube ${def.target.toLowerCase()}`
                        : def.kind === "absolute"
                          ? `Absolute value ${def.target.toLowerCase()}`
                          : def.kind === "grow"
                            ? `${def.label}, ${growthValue} per cell`
                            : def.label.replace(/\bN\b/g, String(card.value))
                }
                aria-keyshortcuts={
                  enabled && !targetingLine && !targetingMatrix && !help
                    ? String(index + 1)
                    : undefined
                }
                title={def.description.replace(/\bN\b/g, String(card.value))}
                disabled={!enabled}
                className={`card ${def.ownership === "OPPONENT_ONLY" ? "offense" : def.ownership === "SELF_ONLY" ? "defense" : ""} ${selected?.id === card.id ? "selected" : ""}`}
                onClick={() => {
                  if (
                    def.target !== "STRUCTURE" &&
                    cardTargets.length === 1 &&
                    cardTargets[0].row === undefined &&
                    cardTargets[0].column === undefined
                  ) {
                    choose(cardTargets[0], card);
                    return;
                  }
                  setSelected(card);
                  setTargetOpponent(false);
                  setError("");
                  sound("select");
                }}
              >
                <span className="tile-ownership">
                  {def.target === "MATCH_CLOCK"
                    ? "SHARED CLOCK"
                    : def.target === "PLAYER"
                      ? "YOUR LIMIT"
                      : def.target === "CARD_POOL"
                        ? "SHARED POOL"
                        : def.ownership === "SELF_ONLY"
                          ? "DEFENSIVE"
                          : def.ownership === "OPPONENT_ONLY"
                            ? "OFFENSIVE"
                            : "EITHER MATRIX"}
                  {def.tier && (
                    <span className="tile-tier">
                      {def.tier} · {def.seconds}s
                    </span>
                  )}
                </span>
                <strong className="tile-title">
                  {def.label.replace(/\bN\b/g, String(card.value))}
                </strong>
                <span className="tile-description">
                  {tileSummary(card, growthValue, own)}
                </span>
              </button>
            );
            const scope =
              def.target === "ROW" || card.operation === "add_row"
                ? "row"
                : def.target === "COLUMN" || card.operation === "add_column"
                  ? "column"
                  : def.target === "MATRIX"
                    ? "matrix"
                    : "other";
            return (
              <div
                className={`card-slot ${selected?.id === card.id ? "selected" : ""}`}
                key={card.id}
                data-scope={scope}
              >
                <span className="tile-scope" aria-hidden="true">
                  {scope === "row" ? (
                    <svg viewBox="0 0 100 10" preserveAspectRatio="none">
                      <path
                        d="M2 5H98M7 1L2 5L7 9M93 1L98 5L93 9"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  ) : scope === "column" ? (
                    <svg viewBox="0 0 10 100" preserveAspectRatio="none">
                      <path
                        d="M5 2V98M1 7L5 2L9 7M1 93L5 98L9 93"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  ) : scope === "matrix" ? (
                    <MatrixIcon />
                  ) : null}
                </span>
                {tile}
                <button
                  className="tile-help-button"
                  aria-label={`About ${def.label.replace(/\bN\b/g, String(card.value))}`}
                  onClick={() => setHelp(card)}
                >
                  (?)
                </button>
                <span className="tile-key" aria-hidden="true">
                  Key <kbd className="shortcut">{index + 1}</kbd>
                </span>
              </div>
            );
          })}
          {Array.from(
            { length: MAX_CARD_SLOTS - game.cards.length },
            (_, i) => (
              <div
                className="empty-slot"
                key={`empty-${i}`}
                aria-label={`Locked slot ${game.cards.length + i + 1}`}
              >
                <span>＋</span>
                <span>Empty slot</span>
                <small>Play Unlock slot</small>
              </div>
            ),
          )}
        </div>
      </section>
      <dialog
        className="tile-help-dialog player-profile-dialog"
        ref={profileDialog}
        aria-labelledby="player-profile-title"
        onClose={() => setProfilePlayer(null)}
      >
        {profilePlayer !== null && (
          <>
            <h2 id="player-profile-title">Player details</h2>
            <PlayerIdentity player={game.players[profilePlayer]} />
            <p>
              Rank{" "}
              {game.players[profilePlayer].rank == null
                ? "-"
                : `#${game.players[profilePlayer].rank}`}
              {" · "}Games {game.players[profilePlayer].played ?? "-"}
            </p>
            <p>Score {calculateScore(game.players[profilePlayer].matrix)}</p>
            <p>Destroyed tiles {game.players[profilePlayer].destroyedTiles}</p>
            <p>
              Maximum Square {game.players[profilePlayer].maxSquare}
              {" · "}Maximum Cube {game.players[profilePlayer].maxCube}
            </p>
            <button onClick={() => profileDialog.current?.close()}>
              Close
            </button>
          </>
        )}
      </dialog>
      <dialog
        className="tile-help-dialog game-menu"
        ref={menuDialog}
        aria-labelledby="game-menu-title"
        onClose={() => setMenuOpen(false)}
      >
        <h2 id="game-menu-title">Game menu</h2>
        {practice ? (
          <div className="practice-intro">
            <p>
              <strong>Very basic AI · Use this mode to learn.</strong> Take your
              time and click (?) to read what each tile does.
            </p>
            <p>
              No match or turn time limit. Protection durations still use their
              normal timers. Use Next stage to move from Early to Mid to Late;
              stage changes affect newly drawn tiles.
            </p>
            <div className="actions">
              <button
                disabled={gameStage === "late"}
                onClick={() => practiceAction(advancePracticeStage)}
              >
                Next stage
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  practiceAction((g, now) =>
                    finishGame(g, now, "practice_finished"),
                  );
                }}
              >
                Finish practice
              </button>
            </div>
          </div>
        ) : (
          <p>Match clocks continue while this menu or tile help is open.</p>
        )}
        <div className="menu-players">
          {[seat, 1 - seat].map((i) => (
            <div key={i}>
              <PlayerIdentity player={game.players[i]} />
              <p>
                Score {calculateScore(game.players[i].matrix)} · Rank{" "}
                {game.players[i].rank == null
                  ? "-"
                  : `#${game.players[i].rank}`}{" "}
                · Games {game.players[i].played ?? "-"} · Destroyed tiles{" "}
                {game.players[i].destroyedTiles}
              </p>
              <p>
                Maximum Square {game.players[i].maxSquare} · Maximum Cube{" "}
                {game.players[i].maxCube}
              </p>
            </div>
          ))}
        </div>
        <p>
          Green: your matrix. Red: opponent. Select a tile, then a highlighted
          cell, row, column or whole-matrix target if needed. Tiles with a fixed
          target apply immediately when selected.
        </p>
        <p className="keyboard-hint">
          1–8: select tile · Shown digit: row/column · Shift: switch matrix ·
          Whole-matrix or growth tile: 1 for yours, 2 for opponent · Q: skip
          turn · Escape: cancel.
        </p>
        <div className="actions">
          <button onClick={() => menuDialog.current?.close()}>Close</button>
          <Link href={practice ? "/play" : "/"}>
            {practice ? "Back to Play" : "Home"}
          </Link>
        </div>
      </dialog>
      <dialog
        className="tile-help-dialog"
        ref={dialog}
        aria-labelledby="tile-help-title"
        onClose={() => setHelp(null)}
      >
        {help && (
          <>
            <h2 id="tile-help-title">
              {registry[help.operation].label.replace(
                /\bN\b/g,
                String(help.value),
              )}
            </h2>
            {registry[help.operation].kind === "sqrt" && (
              <p>This match: i = {game.iValue}.</p>
            )}
            {["square", "cube"].includes(registry[help.operation].kind) && (
              <p>
                Your Maximum{" "}
                {help.operation === "square_cell" ? "Square" : "Cube"}:{" "}
                {help.operation === "square_cell" ? own.maxSquare : own.maxCube}
                . The cell’s absolute value must be at most this maximum.
              </p>
            )}
            <p>
              {registry[help.operation].description.replace(
                /\bN\b/g,
                String(help.value),
              )}
            </p>
            <p>
              <strong>Affects:</strong>{" "}
              {registry[help.operation].target === "CARD_POOL"
                ? "The shared tile pool for both players"
                : registry[help.operation].target === "PLAYER"
                  ? "Your maximum for this game"
                  : registry[help.operation].target === "MATCH_CLOCK"
                    ? "The shared match clock"
                    : registry[help.operation].target === "TURN_CLOCK"
                      ? registry[help.operation].seconds! > 0
                        ? "Your current turn"
                        : "The opponent’s next turn"
                      : registry[help.operation].ownership === "SELF_ONLY"
                        ? "Your matrix only"
                        : registry[help.operation].ownership === "OPPONENT_ONLY"
                          ? "The opponent’s matrix only"
                          : "Either matrix"}
              .
            </p>
            <p>
              <strong>How to play:</strong>{" "}
              {["time", "unlock", "power_limit"].includes(
                registry[help.operation].kind,
              )
                ? "Select the tile to apply it immediately"
                : `Select the tile, then ${
                    registry[help.operation].target === "CELL"
                      ? "click a number cell"
                      : registry[help.operation].target === "ROW"
                        ? "click an R button for the row"
                        : registry[help.operation].target === "COLUMN"
                          ? "click a C button for the column"
                          : registry[help.operation].target === "STRUCTURE"
                            ? "click “Grow this matrix” on your or the opponent’s matrix"
                            : "click “Apply to whole matrix”"
                  }`}
              .
              {["MATRIX", "STRUCTURE"].includes(
                registry[help.operation].target,
              ) && (
                <span className="keyboard-hint">
                  {" "}
                  You can also press 1 for your matrix or 2 for the opponent’s.
                </span>
              )}
            </p>
            {registry[help.operation].kind === "grow" && (
              <p>
                Each new cell will be {growthValue}, using your destroyed-tile
                total for either matrix. Adding a line does not spend your
                total.
              </p>
            )}
            <button onClick={() => dialog.current?.close()}>Close</button>
          </>
        )}
      </dialog>
      <div className="game-status" role="status">
        {error ||
          `${[...own.rowShields, ...own.columnShields].filter((shield) => isShieldActive(shield, clock)).length} protected lines · ${status}`}
      </div>
    </div>
  );
}

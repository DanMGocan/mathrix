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
import { api, sound, type Me } from "@/lib/client";
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
import { defaultBalance, speeds, matchLabel, type Speed } from "@/lib/config";
import { GuestAccount, GuestRestore } from "../guest-account";
import type { AdExperience } from "@/server/ads";
import { showPregameAd } from "@/lib/h5-ads";
import PlayerIdentity from "../player-identity";
import MathFacts from "./math-facts";
function tileSummary(card: Card, growth: number) {
  const def = registry[card.operation];
  if (def.kind === "grow")
    return `Add a ${card.operation === "add_row" ? "row" : "column"} filled with ${growth}. Pass the turn.`;
  if (def.kind === "unlock")
    return "Add a shared tile slot, up to eight. Pass the turn.";
  if (def.kind === "sqrt")
    return "Take a square root. Substitute the match's i for imaginary results; round down.";
  if (def.kind === "shield" && def.seconds)
    return `Protect this ${def.target.toLowerCase()} and all its cells from opponent changes for ${def.seconds}s.`;
  if (def.kind === "remove")
    return `Remove an opponent ${def.target.toLowerCase()}. Shields block removal.`;
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
  const [choice, setChoice] = useState<
    "menu" | "casual" | "create" | "join" | "ai"
  >(invitation ? "join" : "menu");
  const [roomSpeed, setRoomSpeed] = useState<Speed>(1);
  const [searchLabel, setSearchLabel] = useState("");
  const [timing, setTiming] = useState({
    matchMs: defaultBalance.matchMs,
    turnStartMs: defaultBalance.turnStartMs,
    turnEndMs: defaultBalance.turnEndMs,
  });
  useEffect(() => {
    if (!practice)
      api<typeof timing>("/api/play-options")
        .then(setTiming)
        .catch(() => {});
  }, [practice]);
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
  const receiveGame = useCallback(
    (g: PublicGame, playerId: string) => {
      offset.current = g.serverNow - Date.now();
      const old = previousGame.current;
      if (
        g.lastAction?.data.effect === "blocked" &&
        g.lastAction.at !== old?.lastAction?.at
      ) {
        setEffect("◈ PROTECTED — opponent change blocked");
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
      setPending(false);
      setStatus("Connection lost. Reconnecting…");
    });
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
  }, [practice, game, help, menuOpen, publishPractice]);
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
  async function guest() {
    if (pending) return;
    setPending(true);
    try {
      await api("/api/guest", {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }
  const requestMatch = (
    command:
      | "queue"
      | "room_create"
      | "room_join"
      | "room_cancel"
      | "cancel"
      | "ai_start",
    options: { mode?: "ranked" | "casual"; speed?: Speed } = {},
  ) => {
    if (adPlaying || pending || !socket.current?.connected) return;
    setPending(true);
    setError("");
    socket.current.emit(command, {
      consent: localStorage.getItem("mathrix_ad_consent") === "yes",
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
  const timingText = (speed: Speed) =>
    `${(timing.matchMs * speed) / 1000}s · turns ${(timing.turnStartMs * speed) / 1000} → ${timing.turnEndMs / 1000}s`;
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
        `${targetingLine ? `.matrix-panel.${targetOpponent ? "opponent" : "self"} .axis` : ".card"}[aria-keyshortcuts="${digit}"]`,
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
        <div className="eyebrow">
          {invitation ? "ROOM INVITATION / 1v1" : "PLAY / 1v1"}
        </div>
        <h1>Enter the matrix</h1>
        <p>
          {invitation
            ? "Play as a guest or sign in to join your friend's room."
            : "Play as a guest with saved progress, or sign in to your account."}
        </p>
        <button className="primary" onClick={guest} disabled={pending}>
          Play as guest
        </button>
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
        <GuestRestore
          destination={
            invitation
              ? `/play?room=${encodeURIComponent(invitation)}`
              : "/play"
          }
        />
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!game)
    return (
      <section className="narrow queue-screen">
        <div className={status.includes("Searching") ? "scanner" : ""}>▦</div>
        <div className="eyebrow">
          {me.name} / {waitingRoom ? "PRIVATE ROOM" : "PLAY"}
        </div>
        <h1 role="status">{status}</h1>
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
            {choice === "menu" ? (
              <div className="mode-grid">
                <button
                  className="primary"
                  aria-label="Casual mode"
                  onClick={() => setChoice("casual")}
                  disabled={!connected || pending || adPlaying}
                >
                  Casual mode<small>Slower games · no rating changes</small>
                </button>
                <button
                  aria-label="Ranked mode"
                  onClick={() => queue("ranked", 1)}
                  disabled={!connected || pending || adPlaying}
                >
                  Ranked mode<small>{timingText(1)} · counts toward rank</small>
                </button>
                <button
                  aria-label="Vs AI"
                  onClick={() => {
                    setRoomSpeed(1);
                    setChoice("ai");
                  }}
                  disabled={!connected || pending || adPlaying}
                >
                  Vs AI<small>Play Mathrix AI · unranked</small>
                </button>
                <button
                  aria-label="Create room"
                  onClick={() => setChoice("create")}
                  disabled={!connected || pending || adPlaying}
                >
                  Create room<small>Invite a friend · unranked</small>
                </button>
                <button
                  aria-label="Join room"
                  onClick={() => setChoice("join")}
                  disabled={!connected || pending || adPlaying}
                >
                  Join room<small>Enter an invitation code</small>
                </button>
              </div>
            ) : (
              <>
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() => setChoice("menu")}
                >
                  Back to modes
                </button>
                {choice === "casual" && (
                  <div className="speed-options">
                    <h2>Choose a slower game</h2>
                    <p>
                      Casual games count toward overall stats, but never change
                      your rating.
                    </p>
                    {speeds
                      .filter((speed) => speed !== 1)
                      .map((speed) => (
                        <button
                          key={speed}
                          onClick={() => queue("casual", speed)}
                          disabled={!connected || pending || adPlaying}
                        >
                          x{speed}
                          <small>{timingText(speed)}</small>
                        </button>
                      ))}
                  </div>
                )}
                {(choice === "create" || choice === "ai") && (
                  <div className="room-invite">
                    <h2>
                      {choice === "ai"
                        ? "Play against Mathrix AI"
                        : "Create an unranked room"}
                    </h2>
                    {choice === "ai" && (
                      <p>
                        Standard difficulty · normal game rules. Matches are
                        saved in your history without changing your rating or
                        overall stats.
                      </p>
                    )}
                    <label>
                      {choice === "ai" ? "Game speed" : "Room speed"}
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
                      onClick={() =>
                        requestMatch(
                          choice === "ai" ? "ai_start" : "room_create",
                        )
                      }
                      disabled={!connected || pending || adPlaying}
                    >
                      {choice === "ai" ? "Play vs AI" : "Create room"}
                    </button>
                  </div>
                )}
              </>
            )}
            {choice === "join" && (
              <form
                className="room-join"
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
          </>
        )}
        <Link className="button" href="/play?mode=practice">
          Practice mode
        </Link>
        <p>Learn at your own pace against a very basic AI. No time limit.</p>
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
        <div className="eyebrow">
          OPPONENT FOUND / {matchLabel(game.mode, game.speed)}
        </div>
        <h1>
          <PlayerIdentity player={game.players[1 - seat]} />
        </h1>
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
        <div className="eyebrow">
          GET READY,{" "}
          <span className={own.premium ? "gold-name" : ""}>{own.name}</span>
        </div>
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
        <div className="eyebrow">
          {practice
            ? "PRACTICE COMPLETE / VERY BASIC AI"
            : `MATCH COMPLETE / ${matchLabel(game.mode, game.speed)} / ${game.result?.reason}`}
        </div>
        <h1>
          {game.result?.winner === null
            ? "Perfectly balanced."
            : game.result?.winner === seat
              ? "You own the matrix."
              : "A worthy opponent."}
        </h1>
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
                        ? requestMatch("ai_start", { speed: game.speed })
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
        ◈
        {typeof shield === "number"
          ? ` ${Math.ceil((shield - clock) / 1000)}s`
          : ""}
      </span>
    );
  }
  const legal = (t: Target) =>
    targets.some(
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
  function choose(t: Target) {
    if (!canAct || !selected) {
      setError("Select a card during your turn.");
      return;
    }
    if (!legal(t)) {
      setError("That target is not legal for this card.");
      sound("block");
      return;
    }
    setError("");
    if (practice)
      practiceAction((g, now) =>
        playOperation(g, seat, selected.id, t, game!.seq, now),
      );
    else
      socket.current?.emit("use", {
        cardId: selected.id,
        target: t,
        seq: game!.seq,
      });
    setSelected(null);
    setTargetOpponent(false);
  }
  function matrix(player: number) {
    const p = game!.players[player];
    return (
      <section
        className={`matrix-panel ${player === seat ? "self" : "opponent"} ${game!.active === player ? "active" : ""}`}
        aria-label={player === seat ? "Your matrix" : "Opponent matrix"}
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
                Rank <b>{p.rank == null ? "—" : `#${p.rank}`}</b>
              </span>
              <span>
                Games <b>{p.played ?? "—"}</b>
              </span>
            </div>
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
          <span className="destroyed-total">
            Destroyed tiles <b>{p.destroyedTiles}</b>
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
                    className={String(v).length > 5 ? "long-value" : undefined}
                  >
                    {v}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {selected &&
            ["MATRIX", "STRUCTURE"].includes(
              registry[selected.operation].target,
            ) && (
              <button
                disabled={!legal({ player })}
                className={`matrix-target ${legal({ player }) ? "legal" : ""}`}
                onClick={() => choose({ player })}
              >
                {registry[selected.operation].target === "STRUCTURE"
                  ? "Grow this matrix"
                  : "Apply to whole matrix"}
              </button>
            )}
        </div>
      </section>
    );
  }
  const remaining = Math.max(0, game.endAt - clock),
    turn = Math.max(0, game.turnEndsAt - clock),
    gameStage = getGameStage(game, clock);
  return (
    <div className="game" ref={board}>
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
              : `MATHRIX / ${matchLabel(game.mode, game.speed)}${game.mode === "ai" ? " · Unranked" : ""}`}
          </h1>
          <span
            className="game-stage"
            aria-label="Game stage"
            aria-live="polite"
          >
            {gameStage.toUpperCase()} STAGE
          </span>
          <small className="game-stage"> · {iLabel}</small>
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
            ? "YOUR TURN — choose a card, then a target"
            : practice
              ? "VERY BASIC AI’S TURN — watch its next move"
              : "OPPONENT’S TURN — watch their next move")}
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
          <button
            disabled={!canAct}
            style={{ marginInlineEnd: 8, flexShrink: 0 }}
            title={`Replace ${Math.ceil(game.cards.length / 2)} shared tiles, add them to your growth total and pass the turn`}
            onClick={() => {
              if (practice)
                practiceAction((g, now) => skipTurn(g, seat, game.seq, now));
              else
                socket.current?.emit("skip", {
                  matchId: game.id,
                  seq: game.seq,
                });
              setSelected(null);
              setTargetOpponent(false);
            }}
          >
            Skip turn
          </button>
          {selected &&
          ["time", "unlock"].includes(registry[selected.operation].kind) ? (
            <button
              className={`matrix-target legal ${registry[selected.operation].kind === "time" ? "clock-target" : "slot-target"}`}
              disabled={!canAct || !targets.length}
              onClick={() => choose(targets[0])}
            >
              {registry[selected.operation].kind === "unlock"
                ? `Unlock slot (${game.cards.length} → ${game.cards.length + 1})`
                : `Apply ${registry[selected.operation].label}`}
            </button>
          ) : (
            <p className="shortcut-hint" role="status">
              {canAct && selected
                ? targetingLine
                  ? `Targeting ${targetOpponent ? "opponent’s" : "your"} matrix · Digit: target · Shift: switch · Escape: cancel`
                  : "Choose a highlighted target · Escape: cancel"
                : "1–8: select · Click or tap a tile, then choose a target"}
            </p>
          )}
        </div>
        <div className="cards">
          {game.cards.map((card, index) => {
            const def = registry[card.operation];
            const enabled =
              canAct && legalTargets(view, seat, card, clock).length > 0;
            const tile = (
              <button
                key={card.id}
                data-card-id={card.id}
                data-operation={card.operation}
                data-tier={def.tier}
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
                  enabled && !targetingLine && !help
                    ? String(index + 1)
                    : undefined
                }
                title={def.description.replace(/\bN\b/g, String(card.value))}
                disabled={!enabled}
                className={`card ${def.ownership === "OPPONENT_ONLY" ? "offense" : def.ownership === "SELF_ONLY" ? "defense" : ""} ${selected?.id === card.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(card);
                  setTargetOpponent(false);
                  setError("");
                  sound("select");
                }}
              >
                <span className="tile-ownership">
                  {def.target === "MATCH_CLOCK"
                    ? "SHARED CLOCK"
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
                  {tileSummary(card, growthValue)}
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
                    <svg viewBox="0 0 24 24">
                      <rect x="4" y="4" width="16" height="16" rx="1" />
                      <path d="M12 4V20M4 12H20" />
                    </svg>
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
                Rank{" "}
                {game.players[i].rank == null
                  ? "—"
                  : `#${game.players[i].rank}`}{" "}
                · Games {game.players[i].played ?? "—"} · Destroyed tiles{" "}
                {game.players[i].destroyedTiles}
              </p>
            </div>
          ))}
        </div>
        <p>
          Green: your matrix. Red: opponent. Select a tile, then a highlighted
          cell, row, column or whole-matrix target.
        </p>
        <p>
          1–8: select tile · Shown digit: row/column · Shift: switch matrix ·
          Escape: cancel.
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
              <strong>How to play:</strong> Select the tile, then{" "}
              {registry[help.operation].kind === "unlock"
                ? "click “Unlock slot”"
                : registry[help.operation].kind === "time"
                  ? `click “Apply ${registry[help.operation].label}”`
                  : registry[help.operation].target === "CELL"
                    ? "click a number cell"
                    : registry[help.operation].target === "ROW"
                      ? "click an R button for the row"
                      : registry[help.operation].target === "COLUMN"
                        ? "click a C button for the column"
                        : registry[help.operation].target === "STRUCTURE"
                          ? "click “Grow this matrix”"
                          : "click “Apply to whole matrix”"}
              .
            </p>
            {registry[help.operation].kind === "grow" && (
              <p>
                Each new cell will be {growthValue}. Adding a line does not
                spend your total.
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

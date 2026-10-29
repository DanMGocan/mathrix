"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { api, sound, type Me } from "@/lib/client";
import {
  registry,
  legalTargets,
  calculateScore,
  type PublicGame,
  type Card,
  type Target,
} from "@/lib/engine";
import type { AdExperience } from "@/server/ads";
import { showPregameAd } from "@/lib/h5-ads";
export default function Play() {
  const [effect, setEffect] = useState("");
  const [ghosts, setGhosts] = useState<string[]>([]);
  const previousGame = useRef<PublicGame | null>(null);
  const [me, setMe] = useState<Me | null>(null),
    [game, setGame] = useState<PublicGame | null>(null),
    [ad, setAd] = useState<AdExperience | null>(null),
    [adLeft, setAdLeft] = useState(0),
    [adPlaying, setAdPlaying] = useState(false),
    [readyAt, setReadyAt] = useState(0),
    [readyDeadline, setReadyDeadline] = useState(0),
    [status, setStatus] = useState("Connecting…"),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Card | null>(null),
    [first, setFirst] = useState<Target | null>(null),
    [clock, setClock] = useState(0),
    [saved, setSaved] = useState(false);
  const socket = useRef<Socket | null>(null),
    offset = useRef(0),
    arena = useRef<HTMLDivElement | null>(null),
    seen = useRef("");
  useEffect(() => {
    let disposed = false;
    api<Me | null>("/api/me")
      .then((p) => {
        if (disposed) return;
        setMe(p);
        if (!p) {
          setStatus("Choose your player");
          return;
        }
        const s = io(process.env.NEXT_PUBLIC_GAME_URL || location.origin, {
          withCredentials: true,
          transports: ["websocket", "polling"],
        });
        socket.current = s;
        s.on("connect", () => setStatus("Ready to play"));
        s.on("connect_error", () =>
          setStatus("Connection failed. Reconnecting…"),
        );
        s.on("disconnect", () => setStatus("Connection lost. Reconnecting…"));
        s.on("queued", () => setStatus("Searching for opponent…"));
        s.on("cancelled", () => setStatus("Ready to play"));
        s.on("pregame_cancelled", (d: { matchId: string; message: string }) => {
          if (previousGame.current?.id !== d.matchId) return;
          previousGame.current = null;
          setGame(null);
          setAd(null);
          setStatus("Ready to play");
          setError(d.message);
        });
        s.on("notice", (m: string) => setError(m));
        s.on("action_error", (m: string) => setError(m));
        s.on(
          "reserved",
          (d: {
            game: PublicGame;
            ad: AdExperience;
            readyAt: number;
            readyDeadline: number;
          }) => {
            offset.current = d.game.serverNow - Date.now();
            previousGame.current = d.game;
            setGame(d.game);
            setStatus("Opponent found");
            setAd(d.ad);
            setReadyAt(d.readyAt);
            setReadyDeadline(d.readyDeadline);
            setSelected(null);
            setFirst(null);
            setSaved(false);
            setError("");
          },
        );
        s.on("update", (g: PublicGame) => {
          offset.current = g.serverNow - Date.now();
          const old = previousGame.current;
          if (
            g.lastAction?.data.effect === "blocked" &&
            g.lastAction.at !== old?.lastAction?.at
          ) {
            setEffect("◈ SHIELD BLOCK — removal stopped");
            sound("block");
            setTimeout(() => setEffect(""), 1500);
          } else if (
            g.lastAction?.type === "SKILL_END" &&
            g.lastAction.at !== old?.lastAction?.at
          )
            sound("miss");
          if (g.lastAction?.type === "TIMEOUT" && g.seq !== old?.seq) {
            setGhosts(g.lastAction.data.destroyed as string[]);
            setTimeout(() => setGhosts([]), 650);
          }
          previousGame.current = g;
          if (g.status === "playing") setStatus("Connected");
          setGame(g);
          setSelected(null);
          if (g.status === "finished")
            sound(
              g.result?.winner === g.players.findIndex((x) => x.id === p.id)
                ? "win"
                : "loss",
            );
          else
            sound(
              g.status === "countdown"
                ? "countdown"
                : g.minigame
                  ? "hit"
                  : "operation",
            );
        });
        s.on("persisted", (d: { matchId: string }) => {
          if (previousGame.current?.id === d.matchId) setSaved(true);
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
      previousGame.current = null;
      socket.current?.disconnect();
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now() + offset.current), 50);
    return () => clearInterval(t);
  }, []);
  const pregameId = game?.status === "pregame" ? game.id : null;
  const ownReady =
    game?.ready[game.players.findIndex((x) => x.id === me?.id)] ?? false;
  useEffect(() => {
    if (!pregameId || ownReady || !ad || !me) return;
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
  }, [pregameId, ownReady, ad, me, readyAt, readyDeadline]);
  async function guest() {
    try {
      await api("/api/guest", {});
      location.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const queue = () => {
    if (adPlaying) return;
    previousGame.current = null;
    setGame(null);
    setAd(null);
    setSaved(false);
    setError("");
    socket.current?.emit("queue", {
      consent: localStorage.getItem("mathrix_ad_consent") === "yes",
    });
  };
  if (!me)
    return (
      <section className="narrow">
        <div className="eyebrow">QUICK PLAY / 1v1</div>
        <h1>Enter the matrix</h1>
        <p>Jump into a match with a temporary player name.</p>
        <button className="primary" onClick={guest}>
          Play as guest
        </button>
        <Link className="button" href="/auth">
          Sign in
        </Link>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!game)
    return (
      <section className="narrow queue-screen">
        <div className={status.includes("Searching") ? "scanner" : ""}>▦</div>
        <div className="eyebrow">{me.name} / QUICK PLAY</div>
        <h1>{status}</h1>
        <p>One opponent. One shared deck. Your move.</p>
        {status.includes("Searching") ? (
          <button onClick={() => socket.current?.emit("cancel")}>
            Cancel search
          </button>
        ) : (
          <button className="primary" onClick={queue} disabled={adPlaying}>
            Quick Play ↗
          </button>
        )}
        <Link href="/how-to-play">Learn the rules while you wait</Link>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  const seat = game.players.findIndex((p) => p.id === me.id),
    active = game.active === seat,
    own = game.players[seat];
  if (game.status === "pregame")
    return (
      <section className="narrow pregame">
        <div className="eyebrow">OPPONENT FOUND</div>
        <h1>{game.players[1 - seat].name}</h1>
        <p>Both players start together. Your game clock has not started.</p>
        {ad?.kind === "h5" && ad.h5?.testMode && (
          <p className="muted">Google test ad · no revenue is generated.</p>
        )}
        {ad?.kind === "house" && ad.campaign ? (
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
              : "Opponent is getting ready…"}
        </p>
        <p className="muted">You never need to click an ad to play.</p>
      </section>
    );
  if (game.status === "countdown")
    return (
      <section className="countdown">
        <div className="eyebrow">GET READY, {me.name}</div>
        <div key={Math.ceil((game.startedAt - clock) / 1000)}>
          {Math.max(1, Math.ceil((game.startedAt - clock) / 1000))}
        </div>
        <p>Make every number count.</p>
      </section>
    );
  if (game.status === "finished")
    return (
      <section className="results">
        <div className="eyebrow">MATCH COMPLETE / {game.result?.reason}</div>
        <h1>
          {game.result?.winner === null
            ? "Perfectly balanced."
            : game.result?.winner === seat
              ? "You own the matrix."
              : "A worthy opponent."}
        </h1>
        <div className="result-scores">
          {game.players.map((p, i) => (
            <div key={p.id}>
              <h3>
                {p.name}
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
          <button className="primary" onClick={queue}>
            Play again ↗
          </button>
          {saved ? (
            <Link className="button" href={`/matches/${game.id}`}>
              View match details
            </Link>
          ) : (
            <span>Saving match…</span>
          )}
          <Link href="/profile">Your profile</Link>
        </div>
        {!me.registered && (
          <p className="muted">
            Guest games are unrated. Create an account to keep your stats.
          </p>
        )}
      </section>
    );
  const view = { players: game.players, config: game.config },
    canAct = active && !game.minigame;
  const targets = selected ? legalTargets(view, seat, selected) : [];
  const legal = (t: Target) =>
    targets.some(
      (x) =>
        x.player === t.player &&
        x.row === t.row &&
        x.column === t.column &&
        (t.second === undefined || x.second === t.second),
    );
  function choose(t: Target) {
    if (!canAct || !selected) {
      setError("Select a card during your turn.");
      return;
    }
    if (
      registry[selected.operation].kind === "swap" &&
      t.second === undefined
    ) {
      if (first && first.player === t.player) {
        t = { ...t, second: first.row ?? first.column };
        setFirst(null);
      } else {
        setFirst(t);
        setError("Now select a different row or column in the same matrix.");
        return;
      }
    }
    if (!legal(t)) {
      setError("That target is not legal for this card.");
      sound("block");
      return;
    }
    socket.current?.emit("use", {
      cardId: selected.id,
      target: t,
      seq: game!.seq,
    });
    setSelected(null);
    setFirst(null);
    setError("");
  }
  const drop = (e: React.DragEvent, t: Target) => {
    e.preventDefault();
    choose(t);
  };
  function matrix(player: number) {
    const p = game!.players[player];
    return (
      <section
        className={`matrix-panel ${player === seat ? "self" : "opponent"} ${game!.active === player ? "active" : ""}`}
      >
        <div className="matrix-heading">
          <div>
            <small>
              {player === seat ? "YOUR MATRIX" : "OPPONENT MATRIX"}{" "}
              {game!.active === player ? "· ACTIVE TURN" : ""}
            </small>
            <h2>{p.name}</h2>
          </div>
          <div
            className="score"
            aria-label={`Score ${calculateScore(p.matrix)}`}
          >
            <small>Σ SCORE</small>
            <b key={calculateScore(p.matrix)}>{calculateScore(p.matrix)}</b>
          </div>
        </div>
        <div className="matrix-wrap">
          <div
            className="matrix-columns"
            style={{
              gridTemplateColumns: `42px repeat(${p.matrix[0].length},minmax(30px,1fr))`,
            }}
          >
            <span />
            {p.matrix[0].map((_, column) => (
              <button
                key={column}
                className={`axis ${legal({ player, column }) ? "legal" : ""}`}
                onClick={() => choose({ player, column })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, { player, column })}
                aria-label={`${player === seat ? "Your" : "Opponent"} column ${column + 1}`}
              >
                C{column + 1}
                {p.columnShields[column] ? " ◈" : ""}
              </button>
            ))}
          </div>
          {p.matrix.map((r, row) => (
            <div
              className={`matrix-row ${p.rowShields[row] ? "shielded" : ""}`}
              key={row}
              style={{
                gridTemplateColumns: `42px repeat(${r.length},minmax(30px,1fr))`,
              }}
            >
              <button
                className={`axis ${legal({ player, row }) ? "legal" : ""}`}
                onClick={() => choose({ player, row })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, { player, row })}
                aria-label={`${player === seat ? "Your" : "Opponent"} row ${row + 1}`}
              >
                R{row + 1}
                {p.rowShields[row] ? " ◈" : ""}
              </button>
              {r.map((v, column) => (
                <button
                  key={column}
                  className={`cell ${v < 0 ? "negative" : ""} ${legal({ player, row, column }) ? "legal" : ""} ${p.columnShields[column] ? "column-shield" : ""}`}
                  onClick={() => choose({ player, row, column })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, { player, row, column })}
                  aria-label={`${player === seat ? "Your" : "Opponent"} cell ${row + 1},${column + 1}: ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          ))}
        </div>
        {selected &&
          ["MATRIX", "STRUCTURE"].includes(
            registry[selected.operation].target,
          ) && (
            <button
              disabled={!legal({ player })}
              className={`matrix-target ${legal({ player }) ? "legal" : ""}`}
              onClick={() => choose({ player })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => drop(e, { player })}
            >
              {registry[selected.operation].target === "STRUCTURE"
                ? "Grow this matrix"
                : "Apply to whole matrix"}
            </button>
          )}
      </section>
    );
  }
  const remaining = Math.max(0, game.endAt - clock),
    turn = Math.max(0, game.turnEndsAt - clock);
  return (
    <div className="game">
      {effect && (
        <div className="block-effect" role="status">
          {effect}
        </div>
      )}
      {ghosts.length > 0 && (
        <div className="card-ghosts" aria-label="Three cards destroyed">
          {ghosts.map((id) => (
            <span key={id}>✕</span>
          ))}
        </div>
      )}
      <div className="game-top">
        <span className="live-dot">LIVE / 1v1</span>
        <strong className={remaining < 15000 ? "urgent" : ""}>
          {(remaining / 1000).toFixed(1)}
          <small> MATCH CLOCK</small>
        </strong>
        <span className="muted">
          {game.minigame ? "REFLEX STAGE" : `TURN ${(turn / 1000).toFixed(1)}s`}
        </span>
      </div>
      <div className="turn-banner">
        {game.minigame
          ? active
            ? "Hit the target. Keep building."
            : "Opponent is building a new line…"
          : active
            ? "YOUR TURN — choose a card, then a target"
            : "OPPONENT’S TURN — watch their next move"}
      </div>
      {matrix(seat)}
      <section className="pool">
        <div className="pool-heading">
          <span>
            SHARED OPERATIONS / {String(game.cards.length).padStart(2, "0")}
          </span>
          <small>
            {selected
              ? `Selected: ${registry[selected.operation].label.replace("N", String(selected.value))}`
              : "Drag a card or click it, then select a target"}
          </small>
        </div>
        {selected && registry[selected.operation].kind === "time" && (
          <button
            className="matrix-target legal clock-target"
            disabled={!canAct || !targets.length}
            onClick={() => choose(targets[0])}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, targets[0])}
          >
            Apply {registry[selected.operation].label}
          </button>
        )}
        <div className="cards">
          {game.cards.map((card) => {
            const def = registry[card.operation];
            const enabled = canAct && legalTargets(view, seat, card).length > 0;
            return (
              <button
                key={card.id}
                data-card-id={card.id}
                data-operation={card.operation}
                aria-label={def.label.replace("N", String(card.value))}
                title={def.description}
                draggable={enabled}
                disabled={!enabled}
                className={`card ${def.ownership === "OPPONENT_ONLY" ? "offense" : def.ownership === "SELF_ONLY" ? "defense" : ""} ${selected?.id === card.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(card);
                  setFirst(null);
                  setError("");
                  sound("select");
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", card.id);
                  setSelected(card);
                  setFirst(null);
                  sound("select");
                }}
              >
                <small>
                  {def.target === "MATCH_CLOCK"
                    ? "SHARED CLOCK"
                    : def.ownership === "SELF_ONLY"
                      ? "DEFENSIVE"
                      : def.ownership === "OPPONENT_ONLY"
                        ? "OFFENSIVE"
                        : "EITHER"}
                </small>
                <strong>
                  {def.kind === "time"
                    ? `${def.seconds! > 0 ? "+" : "−"}${card.value}s`
                    : def.kind === "transpose"
                      ? "T"
                      : def.kind === "add"
                        ? (card.operation.startsWith("sub") ? "−" : "+") +
                          card.value
                        : def.kind === "multiply"
                          ? "×" + card.value
                          : def.kind === "grow"
                            ? "+"
                            : def.kind === "remove"
                              ? "−"
                              : def.kind === "shield"
                                ? "◈"
                                : "⇄"}
                </strong>
                <span>
                  {def.kind === "time"
                    ? def.label.replace(/^[+−]\d+s /, "")
                    : def.label.replace(/[+−]N |×2 |×−1 /, "")}
                </span>
                <small>
                  {def.kind === "time" ? (
                    def.target === "MATCH_CLOCK" ? (
                      "PASS THE TURN"
                    ) : def.seconds! > 0 ? (
                      "KEEP YOUR TURN"
                    ) : (
                      "PASS & DEDUCT"
                    )
                  ) : (
                    <>
                      {def.target} ·{" "}
                      {def.ownership === "SELF_ONLY"
                        ? "SELF"
                        : def.ownership === "OPPONENT_ONLY"
                          ? "OPPONENT"
                          : "BOTH"}
                    </>
                  )}
                </small>
              </button>
            );
          })}
        </div>
      </section>
      {game.minigame && (
        <section className="skill">
          <div>
            <strong>{active ? "REFLEX BOOST" : "OPPONENT REFLEX BOOST"}</strong>
            <span>
              New {game.minigame.axis} · {game.minigame.hits} hits · no cash-out
            </span>
          </div>
          <div className="skill-arena" ref={arena}>
            {
              <button
                className="skill-target"
                disabled={!active}
                data-stage={game.minigame.stage.id}
                style={{
                  left: `${game.minigame.stage.x * 100}%`,
                  top: `${game.minigame.stage.y * 100}%`,
                  width: `${(game.minigame.stage.size / 480) * 100}%`,
                }}
                onClick={(e) => {
                  const box = arena.current!.getBoundingClientRect();
                  socket.current?.emit("hit", {
                    stageId: game.minigame!.stage.id,
                    x:
                      e.detail === 0
                        ? game.minigame!.stage.x
                        : (e.clientX - box.left) / box.width,
                    y:
                      e.detail === 0
                        ? game.minigame!.stage.y
                        : (e.clientY - box.top) / box.height,
                  });
                }}
              >
                {game.minigame.stage.number}
              </button>
            }
          </div>
          <p>Miss a target and your turn ends. Everything you earned stays.</p>
        </section>
      )}
      {matrix(1 - seat)}
      <div className="game-status" role="status">
        {error ||
          `${own.rowShields.filter(Boolean).length + own.columnShields.filter(Boolean).length} shields ready · ${status}`}
      </div>
    </div>
  );
}

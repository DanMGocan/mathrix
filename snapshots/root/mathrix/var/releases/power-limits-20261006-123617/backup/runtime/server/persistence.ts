import { db } from "./db";
import { elo, type Game } from "../lib/engine";
export async function persistMatch(g: Game) {
  if (g.mode === "practice") throw Error("Practice games are not persisted");
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const ended = g.events.at(-1)!.at;
    const played =
      g.startedAt > 0 &&
      ended >= g.startedAt &&
      g.events.some((e) => e.type === "START");
    const legacy = !g.mode || g.mode === "quick";
    const ai = g.mode === "ai";
    const tracked = ai ? [] : g.players.filter((p) => !legacy || p.registered);
    const rated =
      played &&
      (legacy
        ? tracked.length === 2 || (g.config.rateGuests && tracked.length === 1)
        : g.mode === "ranked") &&
      !["server_restart", "server_shutdown"].includes(g.result!.reason);
    const insert = await c.query(
      "INSERT INTO matches(id,seed,started_at,ended_at,duration_ms,rated,winner,reason,config,initial_matrices,final_matrices,events,mode,speed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id",
      [
        g.id,
        g.seed,
        new Date(played ? g.startedAt : g.reservedAt),
        new Date(ended),
        played ? ended - g.startedAt : 0,
        rated,
        g.result!.winner,
        g.result!.reason,
        JSON.stringify(g.config),
        JSON.stringify(g.initialMatrices),
        JSON.stringify(g.players.map((p) => p.matrix)),
        JSON.stringify(g.events),
        legacy ? "legacy" : g.mode,
        g.speed ?? 1,
      ],
    );
    if (!insert.rowCount) {
      await c.query("COMMIT");
      return;
    }
    for (const p of tracked)
      await c.query(
        "INSERT INTO player_stats(user_id,rating) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [p.id, g.config.startingRating],
      );
    const stats = await c.query(
      "SELECT * FROM player_stats WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR UPDATE",
      [tracked.map((p) => p.id)],
    );
    const before = g.players.map((p) =>
      Number(
        stats.rows.find((s) => s.user_id === p.id)?.rating ??
          g.config.startingRating,
      ),
    );
    const after = rated
      ? elo(
          before[0],
          before[1],
          g.result!.winner === null ? 0.5 : g.result!.winner === 0 ? 1 : 0,
          g.config.eloK,
        )
      : before;
    for (let i = 0; i < 2; i++) {
      const p = g.players[i],
        result =
          g.result!.winner === null
            ? "DRAW"
            : g.result!.winner === i
              ? "WIN"
              : "LOSS",
        score = g.result!.scores[i],
        hasAccount = !(ai && i === 1) && (!legacy || p.registered),
        tracksStats = hasAccount && !ai;
      await c.query(
        "INSERT INTO match_participants(match_id,seat,user_id,display_name,score,result,rating_before,rating_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          g.id,
          i,
          hasAccount ? p.id : null,
          p.name,
          score,
          result,
          tracksStats ? before[i] : null,
          tracksStats ? after[i] : null,
        ],
      );
      if (tracksStats && played) {
        await c.query(
          "UPDATE player_stats SET rating=$2,played=played+1,wins=wins+$3,losses=losses+$4,draws=draws+$5,streak=CASE WHEN $3=1 THEN streak+1 ELSE 0 END,highest_score=CASE WHEN played=0 THEN $6 ELSE GREATEST(highest_score,$6) END,total_score=total_score+$6 WHERE user_id=$1",
          [
            p.id,
            after[i],
            result === "WIN" ? 1 : 0,
            result === "LOSS" ? 1 : 0,
            result === "DRAW" ? 1 : 0,
            score,
          ],
        );
        if (rated)
          await c.query(
            "INSERT INTO rating_history(user_id,match_id,before_rating,after_rating) VALUES($1,$2,$3,$4)",
            [p.id, g.id, before[i], after[i]],
          );
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

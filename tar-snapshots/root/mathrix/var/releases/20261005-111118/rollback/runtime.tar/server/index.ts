import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID, randomInt } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { Server, type Socket } from "socket.io";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { z } from "zod";
import { db, redis, connectRedis, rateLimit } from "./db";
import { auth } from "./auth";
import {
  defaultBalance,
  balanceSchema,
  defaultAds,
  adSchema,
  type Balance,
  type AdConfig,
} from "../lib/config";
import {
  createGame,
  useOperation,
  skillHit,
  finishGame,
  event,
  publicGame,
  type Game,
} from "../lib/engine";
import { Room } from "../lib/room";
import { parseCookies, safeURL, validOrigin } from "../lib/security";
import {
  adFor,
  h5Config,
  recordImpression,
  type Identity,
  type AdExperience,
} from "./ads";
import { persistMatch } from "./persistence";
const appURL = process.env.APP_URL || "http://localhost:3000";
const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }),
  );
let balance: Balance = defaultBalance,
  ads: AdConfig = defaultAds;
const rooms = new Map<string, Room>(),
  playerRooms = new Map<string, string>();
const connections = new Map<string, Socket>(),
  queue = new Map<string, { player: Identity; consent: boolean }>();
const experiences = new Map<string, AdExperience[]>();
const browserConnections = new Map<string, Socket>();
function requestIP(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  return typeof forwarded === "string"
    ? forwarded.split(",").at(-1)!.trim()
    : req.socket.remoteAddress || "unknown";
}
const spool = process.env.STATE_DIR || "./var";
await connectRedis();
await mkdir(`${spool}/completed`, { recursive: true });
for (const row of (await db.query("SELECT * FROM settings")).rows) {
  if (row.key === "balance") balance = balanceSchema.parse(row.value);
  if (row.key === "ads") ads = adSchema.parse(row.value);
}
// ponytail: one authoritative process; add distributed ownership only when scaling beyond one VM.
await redis.del(["mathrix:queue", "mathrix:live"]);
for (const file of await readdir(`${spool}/completed`))
  if (file.endsWith(".json")) {
    try {
      await persistMatch(
        JSON.parse(await readFile(`${spool}/completed/${file}`, "utf8")),
      );
      await unlink(`${spool}/completed/${file}`);
    } catch {
      log("persistence_retry_pending");
    }
  }
async function identity(req: IncomingMessage): Promise<Identity | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (session) {
    const row = (
      await db.query('SELECT id,name,role,disabled FROM "user" WHERE id=$1', [
        session.user.id,
      ])
    ).rows[0];
    if (!row || row.disabled) return null;
    return { id: row.id, name: row.name, registered: true, role: row.role };
  }
  const token = parseCookies(req.headers.cookie).mathrix_guest;
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return null;
  const g = await redis.get(`guest:${token}`);
  return g ? JSON.parse(g) : null;
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
function browserCookie(req: IncomingMessage, res: ServerResponse) {
  if (
    /^[a-f0-9-]{36}$/.test(
      parseCookies(req.headers.cookie).mathrix_browser || "",
    )
  )
    return;
  res.setHeader(
    "Set-Cookie",
    `mathrix_browser=${randomUUID()}; Path=/; HttpOnly; SameSite=Lax${appURL.startsWith("https:") ? "; Secure" : ""}`,
  );
}
async function body(req: IncomingMessage) {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 32768) throw Error("Request too large");
  }
  return JSON.parse(text || "{}");
}
const actionSchema = z
  .object({
    cardId: z.string().max(40),
    seq: z.number().int().nonnegative(),
    target: z
      .object({
        player: z.number().int().min(0).max(1),
        row: z.number().int().min(0).max(7).optional(),
        column: z.number().int().min(0).max(7).optional(),
        second: z.number().int().min(0).max(7).optional(),
      })
      .strict(),
  })
  .strict();
const campaignSchema = z
  .object({
    id: z.string().max(64).optional(),
    name: z.string().min(1).max(100),
    headline: z.string().min(1).max(120),
    body: z.string().max(700),
    image_url: z.string().max(2000).default(""),
    destination_url: z.string().max(2000),
    cta: z.string().min(1).max(40),
    audience: z.enum(["everyone", "guests", "registered"]),
    active: z.boolean(),
    starts_at: z.string().datetime().nullable(),
    ends_at: z.string().datetime().nullable(),
    duration_ms: z.number().int().min(1000).max(30000),
    weight: z.number().int().min(1).max(100),
  })
  .strict();
async function leaderboard() {
  return (
    await db.query(
      'SELECT u.id,u.name,u.image,s.*,RANK() OVER(ORDER BY s.rating DESC) AS rank FROM player_stats s JOIN "user" u ON u.id=s.user_id WHERE NOT u.disabled ORDER BY s.rating DESC,u.name LIMIT 100',
    )
  ).rows;
}
async function history(id: string) {
  return (
    await db.query(
      "SELECT m.id,m.ended_at,m.rated,p.result,p.score,p.rating_before,p.rating_after,o.display_name AS opponent,o.score AS opponent_score FROM match_participants p JOIN matches m ON m.id=p.match_id JOIN match_participants o ON o.match_id=m.id AND o.seat<>p.seat WHERE p.user_id=$1 ORDER BY m.ended_at DESC LIMIT 50",
      [id],
    )
  ).rows;
}
async function send(room: Room, kind = "update") {
  const state = publicGame(room.game);
  for (const p of room.game.players) connections.get(p.id)?.emit(kind, state);
}
async function save(room: Room) {
  if (room.persisted || Date.now() < room.retryAt) return;
  room.persisted = true;
  const g = room.game;
  for (const p of g.players)
    if (playerRooms.get(p.id) === g.id) playerRooms.delete(p.id);
  const path = `${spool}/completed/${g.id}.json`;
  await writeFile(path + ".tmp", JSON.stringify(g), { mode: 0o600 });
  await rename(path + ".tmp", path);
  try {
    await persistMatch(g);
    await unlink(path);
    for (const p of g.players)
      connections.get(p.id)?.emit("persisted", { matchId: g.id });
    log("match_persisted", { matchId: g.id });
  } catch {
    room.persisted = false;
    room.retryAt = Date.now() + 5000;
    log("match_persist_error", { matchId: g.id });
    return;
  }
  setTimeout(
    () => {
      rooms.delete(g.id);
      experiences.delete(g.id);
    },
    15 * 60 * 1000,
  ).unref();
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", appURL),
      path = url.pathname,
      method = req.method;
    const origin = req.headers.origin;
    if (origin === new URL(appURL).origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST");
      res.writeHead(204);
      res.end();
      return;
    }
    if (method !== "GET" && !validOrigin(origin, appURL)) {
      json(res, { error: "Invalid origin" }, 403);
      return;
    }
    const ip = requestIP(req);
    if (!(await rateLimit(`http:${ip}`, 300, 60))) {
      json(res, { error: "Too many requests" }, 429);
      return;
    }
    if (path.startsWith("/api/auth/")) {
      if (method === "POST" && !(await rateLimit(`auth:${ip}`, 30, 60))) {
        json(res, { error: "Too many authentication attempts" }, 429);
        return;
      }
      await toNodeHandler(auth)(req, res);
      return;
    }
    if (path === "/api/health") {
      await db.query("SELECT 1");
      await redis.ping();
      json(res, {
        status: "ok",
        database: "ok",
        redis: "ok",
        active: [...rooms.values()].filter((r) => r.game.status !== "finished")
          .length,
        queue: queue.size,
      });
      return;
    }
    if (path === "/api/providers") {
      json(res, {
        google: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        ),
        discord: Boolean(
          process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
        ),
      });
      return;
    }
    if (path === "/api/ad/config" && method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      json(res, h5Config(ads));
      return;
    }
    const p = await identity(req);
    if (path === "/api/guest" && method === "POST") {
      browserCookie(req, res);
      if (!(await rateLimit(`guest:${ip}`, 10, 60))) {
        json(res, { error: "Too many guest sessions" }, 429);
        return;
      }
      if (p) {
        json(res, p);
        return;
      }
      const id = randomUUID(),
        g: Identity = {
          id,
          name: `Guest-${randomInt(1000, 10000)}`,
          registered: false,
          role: "GUEST",
        };
      await redis.set(`guest:${id}`, JSON.stringify(g), { EX: 86400 });
      res.setHeader("Set-Cookie", [
        ...(res.getHeader("Set-Cookie")
          ? [String(res.getHeader("Set-Cookie"))]
          : []),
        `mathrix_guest=${id}; Path=/; HttpOnly; SameSite=Lax${appURL.startsWith("https:") ? "; Secure" : ""}`,
      ]);
      json(res, g);
      return;
    }
    if (path === "/api/me") {
      browserCookie(req, res);
      json(res, p);
      return;
    }
    if (path === "/api/leaderboard") {
      json(res, await leaderboard());
      return;
    }
    if (path === "/api/profile" && p?.registered) {
      await db.query(
        "INSERT INTO player_stats(user_id,rating) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [p.id, balance.startingRating],
      );
      const row = (
        await db.query(
          'SELECT u.name,u.image,s.*,(SELECT count(*)+1 FROM player_stats WHERE rating>s.rating) AS rank FROM player_stats s JOIN "user" u ON u.id=s.user_id WHERE s.user_id=$1',
          [p.id],
        )
      ).rows[0];
      json(res, { ...row, history: await history(p.id) });
      return;
    }
    if (path.startsWith("/api/matches/") && p) {
      const id = path.split("/").at(-1)!;
      const match = (await db.query("SELECT * FROM matches WHERE id=$1", [id]))
        .rows[0];
      const participants = (
        await db.query(
          "SELECT * FROM match_participants WHERE match_id=$1 ORDER BY seat",
          [id],
        )
      ).rows;
      const live = rooms.get(id);
      if (!match) {
        json(res, { error: "Match not found" }, 404);
        return;
      }
      if (
        p.role !== "ADMIN" &&
        !participants.some((x) => x.user_id === p.id) &&
        !live?.game.players.some((x) => x.id === p.id)
      ) {
        json(res, { error: "Not authorized" }, 403);
        return;
      }
      json(res, { ...match, participants });
      return;
    }
    if (path.startsWith("/api/admin/")) {
      if (!p || p.role !== "ADMIN") {
        json(res, { error: "Administrator access required" }, 403);
        return;
      }
      if (path === "/api/admin/overview") {
        const totals = (
          await db.query(
            "SELECT count(*)::int AS completed,count(*) FILTER(WHERE ended_at>=CURRENT_DATE)::int AS today,COALESCE(avg(duration_ms),0)::float AS average_ms,COALESCE(avg(CASE WHEN winner IS NULL THEN 1.0 ELSE 0 END),0)::float AS draw_rate FROM matches",
          )
        ).rows[0];
        const users = (
          await db.query('SELECT count(*)::int AS count FROM "user"')
        ).rows[0].count;
        const guests = Number(
          await redis.eval(
            "local n=0; local c='0'; repeat local r=redis.call('SCAN',c,'MATCH','guest:*','COUNT',100); c=r[1]; n=n+#r[2]; until c=='0'; return n",
            { keys: [], arguments: [] },
          ),
        );
        json(res, {
          ...totals,
          users,
          guests,
          active: [...rooms.values()]
            .filter((r) => r.game.status !== "finished")
            .map((r) => ({
              id: r.game.id,
              status: r.game.status,
              players: r.game.players.map((p) => p.name),
              startedAt: r.game.startedAt,
            })),
          queue: [...queue.values()].map((x) => x.player.name),
          health: { game: "ok", database: "ok", redis: await redis.ping() },
        });
        return;
      }
      if (path === "/api/admin/settings") {
        if (method === "POST") {
          const data = z
            .object({ balance: balanceSchema, ads: adSchema })
            .strict()
            .parse(await body(req));
          const c = await db.connect();
          try {
            await c.query("BEGIN");
            for (const [key, value] of Object.entries(data))
              await c.query(
                "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
                [key, JSON.stringify(value)],
              );
            await c.query("COMMIT");
            balance = data.balance;
            ads = data.ads;
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
          log("admin_settings_changed", { adminId: p.id });
        }
        json(res, { balance, ads });
        return;
      }
      if (path === "/api/admin/users") {
        const search = (url.searchParams.get("q") || "").slice(0, 100);
        json(
          res,
          (
            await db.query(
              'SELECT u.id,u.name,u.email,u.image,u.role,u.disabled,u."createdAt",s.* FROM "user" u LEFT JOIN player_stats s ON s.user_id=u.id WHERE u.email ILIKE $1 OR u.name ILIKE $1 ORDER BY u."createdAt" DESC LIMIT 100',
              [`%${search}%`],
            )
          ).rows,
        );
        return;
      }
      if (path.startsWith("/api/admin/users/")) {
        const id = path.split("/").at(-1)!;
        if (method === "POST") {
          const data = z
            .object({
              disabled: z.boolean().optional(),
              role: z.enum(["USER", "ADMIN"]).optional(),
              resetRating: z.boolean().optional(),
            })
            .strict()
            .parse(await body(req));
          if (id === p.id && (data.disabled || data.role === "USER")) {
            json(res, { error: "You cannot suspend or demote yourself" }, 400);
            return;
          }
          if (data.resetRating && playerRooms.has(id)) {
            json(
              res,
              { error: "Wait until this player finishes their match" },
              409,
            );
            return;
          }
          await db.query(
            'UPDATE "user" SET disabled=COALESCE($2,disabled),role=COALESCE($3,role),"updatedAt"=now() WHERE id=$1',
            [id, data.disabled ?? null, data.role ?? null],
          );
          if (data.resetRating)
            await db.query(
              "UPDATE player_stats SET rating=$2 WHERE user_id=$1",
              [id, balance.startingRating],
            );
          if (data.disabled) {
            await db.query('DELETE FROM session WHERE "userId"=$1', [id]);
            connections.get(id)?.disconnect(true);
            queue.delete(id);
          }
          log("admin_user_changed", { adminId: p.id, userId: id });
        }
        const user = (
          await db.query(
            'SELECT id,name,email,role,disabled FROM "user" WHERE id=$1',
            [id],
          )
        ).rows[0];
        json(res, {
          user,
          providers: (
            await db.query(
              'SELECT "providerId" FROM account WHERE "userId"=$1',
              [id],
            )
          ).rows,
          history: await history(id),
          stats: (
            await db.query("SELECT * FROM player_stats WHERE user_id=$1", [id])
          ).rows[0],
        });
        return;
      }
      if (path === "/api/admin/ratings/reset" && method === "POST") {
        if (playerRooms.size) {
          json(
            res,
            { error: "Finish live matches before resetting ratings" },
            409,
          );
          return;
        }
        await db.query("UPDATE player_stats SET rating=$1", [
          balance.startingRating,
        ]);
        log("admin_ratings_reset", { adminId: p.id });
        json(res, { ok: true });
        return;
      }
      if (path === "/api/admin/matches") {
        const who = (url.searchParams.get("player") || "").slice(0, 100),
          result = url.searchParams.get("result") || "",
          date = url.searchParams.get("date") || "";
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw Error("Invalid date");
        json(
          res,
          (
            await db.query(
              "SELECT DISTINCT m.id,m.ended_at,m.rated,m.winner,m.reason,m.duration_ms FROM matches m JOIN match_participants p ON p.match_id=m.id WHERE ($1='' OR p.display_name ILIKE '%'||$1||'%' OR p.user_id=$1) AND ($2='' OR p.result=$2) AND ($3::text IS NULL OR m.ended_at::date=$3::date) ORDER BY m.ended_at DESC LIMIT 100",
              [who, result, date || null],
            )
          ).rows,
        );
        return;
      }
      if (path === "/api/admin/campaigns") {
        if (method === "POST") {
          const d = campaignSchema.parse(await body(req));
          d.destination_url = safeURL(d.destination_url);
          d.image_url = safeURL(d.image_url, true);
          if (d.starts_at && d.ends_at && d.starts_at >= d.ends_at)
            throw Error("Campaign end must follow start");
          await db.query(
            "INSERT INTO ad_campaigns(id,name,headline,body,image_url,destination_url,cta,audience,active,starts_at,ends_at,duration_ms,weight) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET name=$2,headline=$3,body=$4,image_url=$5,destination_url=$6,cta=$7,audience=$8,active=$9,starts_at=$10,ends_at=$11,duration_ms=$12,weight=$13",
            [
              d.id || randomUUID(),
              d.name,
              d.headline,
              d.body,
              d.image_url,
              d.destination_url,
              d.cta,
              d.audience,
              d.active,
              d.starts_at,
              d.ends_at,
              d.duration_ms,
              d.weight,
            ],
          );
        }
        json(
          res,
          (
            await db.query(
              "SELECT c.*,count(i.id)::int AS impressions,count(i.clicked_at)::int AS clicks FROM ad_campaigns c LEFT JOIN ad_impressions i ON i.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC",
            )
          ).rows,
        );
        return;
      }
      if (path === "/api/admin/leaderboard") {
        json(res, await leaderboard());
        return;
      }
    }
    if (path === "/api/ad/click" && method === "POST" && p) {
      const d = z
        .object({ impressionId: z.string().uuid() })
        .strict()
        .parse(await body(req));
      await db.query(
        "UPDATE ad_impressions SET clicked_at=COALESCE(clicked_at,now()) WHERE id=$1 AND player_id=$2",
        [d.impressionId, p.id],
      );
      json(res, { ok: true });
      return;
    }
    json(res, { error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof z.ZodError) {
      json(res, { error: e.issues.map((x) => x.message).join("; ") }, 400);
      return;
    }
    log("request_failed", {
      path: req.url,
      error: e instanceof Error ? e.message : "unknown",
    });
    json(res, { error: "Request failed. Check the input and try again." }, 400);
  }
});
const io = new Server(server, {
  cors: { origin: new URL(appURL).origin, credentials: true },
  allowRequest: (req, cb) => cb(null, validOrigin(req.headers.origin, appURL)),
  maxHttpBufferSize: 16384,
  pingInterval: 10000,
  pingTimeout: 10000,
});
io.use(async (socket, next) => {
  try {
    if (!(await rateLimit(`connect:${requestIP(socket.request)}`, 60, 60)))
      throw Error("Too many connections");
    const p = await identity(socket.request);
    if (!p) throw Error("Sign in or play as guest first");
    socket.data.player = p;
    next();
  } catch {
    next(Error("Authentication required"));
  }
});
async function pair() {
  while (queue.size >= 2) {
    const pair = [...queue.values()].slice(0, 2);
    pair.forEach((x) => queue.delete(x.player.id));
    const g = createGame(
      randomUUID(),
      randomInt(1, 2147483647),
      pair.map((x) => x.player),
      balance,
    );
    const adConfig = ads;
    const room = new Room(g, 120000);
    room.waitForAdCompletion = true;
    room.readyNotBefore = [room.readyDeadline, room.readyDeadline];
    rooms.set(g.id, room);
    pair.forEach((x) => playerRooms.set(x.player.id, g.id));
    log("match_reserved", { matchId: g.id });
    try {
      const offered = await Promise.all(
        pair.map((x) => adFor(x.player, g.id, adConfig, x.consent)),
      );
      if (!rooms.has(g.id)) continue;
      experiences.set(g.id, offered);
      const offeredAt = Date.now();
      room.waitForAdCompletion = offered.some((a) => a.kind === "h5");
      room.readyDeadline =
        offeredAt + (room.waitForAdCompletion ? 120000 : adConfig.maxWaitMs);
      offered.forEach((a, i) => {
        room.readyNotBefore[i] = offeredAt + a.durationMs;
        connections.get(pair[i].player.id)?.emit("reserved", {
          game: publicGame(g),
          ad: a,
          readyAt: room.readyNotBefore[i],
          readyDeadline: room.readyDeadline,
        });
      });
    } catch {
      if (!rooms.has(g.id)) continue;
      const fallback: AdExperience = {
        kind: "unavailable",
        durationMs: h5Config(adConfig).enabled ? adConfig.pregameWaitMs : 0,
      };
      room.waitForAdCompletion = false;
      const now = Date.now();
      room.readyNotBefore = [
        now + fallback.durationMs,
        now + fallback.durationMs,
      ];
      room.readyDeadline =
        now + Math.max(adConfig.maxWaitMs, fallback.durationMs + 1000);
      experiences.set(g.id, [fallback, fallback]);
      for (const [i, p] of g.players.entries())
        connections.get(p.id)?.emit("reserved", {
          game: publicGame(g),
          ad: fallback,
          readyAt: room.readyNotBefore[i],
          readyDeadline: room.readyDeadline,
        });
      log("ad_failure", { matchId: g.id });
    }
  }
}
io.on("connection", (socket) => {
  const p = socket.data.player as Identity;
  const cookies = parseCookies(socket.request.headers.cookie);
  const browserKey = cookies.mathrix_browser || cookies.mathrix_guest || p.id;
  const sameBrowser = browserConnections.get(browserKey);
  if (
    sameBrowser &&
    sameBrowser.id !== socket.id &&
    sameBrowser.data.player.id !== p.id
  ) {
    sameBrowser.emit("notice", "This browser switched player identity.");
    sameBrowser.disconnect(true);
  }
  browserConnections.set(browserKey, socket);
  const previous = connections.get(p.id);
  if (previous && previous.id !== socket.id) {
    previous.emit("notice", "This session moved to another tab.");
    previous.disconnect(true);
  }
  connections.set(p.id, socket);
  log("connected", { playerId: p.id, registered: p.registered });
  const existing = rooms.get(playerRooms.get(p.id) || "");
  if (existing) {
    const i = existing.game.players.findIndex((x) => x.id === p.id);
    existing.reconnect(i, Date.now());
    const ad = experiences.get(existing.game.id)?.[i];
    if (ad)
      socket.emit("reserved", {
        game: publicGame(existing.game),
        ad,
        readyAt: existing.readyNotBefore[i],
        readyDeadline: existing.readyDeadline,
      });
  }
  const command = (name: string, fn: (data: unknown) => Promise<void> | void) =>
    socket.on(name, async (data: unknown) => {
      try {
        if (!(await rateLimit(`socket:${p.id}`, 80, 10)))
          throw Error("Too many actions");
        const currentIdentity = await identity(socket.request);
        if (currentIdentity?.id !== p.id)
          throw Error("Session expired or account disabled");
        if (!socket.connected || connections.get(p.id)?.id !== socket.id)
          throw Error("This session moved to another tab");
        p.role = currentIdentity.role;
        await fn(data);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid action";
        socket.emit("action_error", message);
        log("operation_rejected", {
          playerId: p.id,
          matchId: playerRooms.get(p.id),
          command: name,
          reason: message.slice(0, 200),
        });
      }
    });
  const current = () => {
    const r = rooms.get(playerRooms.get(p.id) || "");
    if (!r) throw Error("No active match");
    return { room: r, seat: r.game.players.findIndex((x) => x.id === p.id) };
  };
  command("queue", async (data) => {
    const d = z
      .object({ consent: z.boolean().default(false) })
      .strict()
      .parse(data || {});
    if (playerRooms.has(p.id)) throw Error("Already in a match");
    if (!(await rateLimit(`queue:${p.id}`, 10, 60)))
      throw Error("Please wait before rejoining");
    if (!queue.has(p.id)) queue.set(p.id, { player: p, consent: d.consent });
    socket.emit("queued", { position: [...queue.keys()].indexOf(p.id) + 1 });
    log("queued", { playerId: p.id });
    await pair();
  });
  command("cancel", () => {
    queue.delete(p.id);
    socket.emit("cancelled");
  });
  command("ready", async (data) => {
    const { room, seat } = current();
    const d = z.object({ matchId: z.string().uuid() }).strict().parse(data);
    if (d.matchId !== room.game.id) throw Error("Stale match reservation");
    room.ready(seat, Date.now());
    await send(room);
  });
  command("ad_seen", async () => {
    const { room, seat } = current();
    const ad = experiences.get(room.game.id)?.[seat];
    if (ad) await recordImpression(p, room.game.id, ad);
  });
  command("use", async (data) => {
    const d = actionSchema.parse(data),
      { room, seat } = current();
    const effect = useOperation(
      room.game,
      seat,
      d.cardId,
      d.target,
      d.seq,
      Date.now(),
    );
    log("operation", { matchId: room.game.id, playerId: p.id, effect });
    await send(room);
  });
  command("hit", async (data) => {
    const d = z
        .object({
          stageId: z.number().int().positive(),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        })
        .strict()
        .parse(data),
      { room, seat } = current();
    skillHit(room.game, seat, d.stageId, d.x, d.y, Date.now());
    await send(room);
  });
  socket.on("disconnect", () => {
    if (connections.get(p.id)?.id !== socket.id) return;
    connections.delete(p.id);
    if (browserConnections.get(browserKey)?.id === socket.id)
      browserConnections.delete(browserKey);
    queue.delete(p.id);
    const r = rooms.get(playerRooms.get(p.id) || "");
    if (r) {
      r.disconnect(
        r.game.players.findIndex((x) => x.id === p.id),
        Date.now(),
      );
      void send(r);
    }
    log("disconnected", { playerId: p.id });
  });
});
const timer = setInterval(() => {
  for (const room of rooms.values()) {
    const change = room.tick(Date.now());
    if (change === "pregame_cancelled") {
      for (const p of room.game.players) {
        playerRooms.delete(p.id);
        connections.get(p.id)?.emit("pregame_cancelled", {
          matchId: room.game.id,
          message:
            "The match could not start. Please search for another opponent.",
        });
      }
      rooms.delete(room.game.id);
      experiences.delete(room.game.id);
      log(change, { matchId: room.game.id });
      continue;
    }
    if (change) {
      void send(room);
      log(change, { matchId: room.game.id });
    }
    if (room.game.status === "finished" && !room.persisted)
      void save(room).catch(() => {
        room.persisted = false;
        room.retryAt = Date.now() + 5000;
        log("spool_failure", { matchId: room.game.id });
      });
  }
}, 50);
const metadata = setInterval(() => {
  void redis.set("mathrix:queue", JSON.stringify([...queue.keys()]), {
    EX: 10,
  });
  void redis.set(
    "mathrix:live",
    JSON.stringify(
      [...rooms.values()]
        .filter((r) => r.game.status !== "finished")
        .map((r) => r.game.id),
    ),
    { EX: 10 },
  );
}, 1000);
server.listen(
  Number(process.env.GAME_PORT || 3001),
  process.env.GAME_HOST || "127.0.0.1",
  () => log("server_started", { port: process.env.GAME_PORT || 3001 }),
);
async function shutdown() {
  clearInterval(timer);
  clearInterval(metadata);
  for (const room of rooms.values())
    if (room.game.status !== "finished") {
      finishGame(room.game, Date.now(), "server_shutdown");
      await save(room);
    }
  io.close();
  server.close();
  await redis.quit();
  await db.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

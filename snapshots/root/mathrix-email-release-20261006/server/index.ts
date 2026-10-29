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
  matchmakingSchema,
  queueSchema,
  roomCreateSchema,
  type MatchMode,
  type Speed,
  type QueueCounts,
} from "../lib/config";
import {
  createGame,
  useOperation,
  skipTurn,
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
import { metrics } from "./metrics";
import { analytics } from "./analytics";
import {
  EmailError,
  getEmailDashboard,
  saveWeeklyEmail,
  queueCommunityEmail,
  runEmailJobs,
  stopEmailJobs,
  emailUnsubscribePage,
  unsubscribeCommunityEmail,
} from "./email";
import { appearance, premiumSQL } from "./profiles";
import { profileSchema } from "../lib/profile";
import {
  billingSummary,
  checkout,
  billingPortal,
  verifyBillingEvent,
  processBillingEvent,
  BillingError,
} from "./billing";
import {
  createGuest,
  createGuestSession,
  guestFromSession,
  guestFromCode,
  guestCode,
  guestSessionSeconds,
  prepareGuestImport,
  pendingGuestImport,
  finishGuestImport,
  importingGuests,
} from "./guests";
import {
  DesignFileError,
  listDesignFiles,
  uploadDesignFile,
  downloadDesignFile,
} from "./design-files";
const appURL = process.env.APP_URL || "http://localhost:3000";
const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }),
  );
let balance: Balance = defaultBalance,
  ads: AdConfig = defaultAds;
const rooms = new Map<string, Room>(),
  playerRooms = new Map<string, string>(),
  completedRooms = new Map<string, string>();
type MatchPlayer = { player: Identity; consent: boolean };
type QueuePlayer = MatchPlayer & {
  mode: "ranked" | "casual";
  speed: Speed;
  joinedAt: number;
};
type Invitation = {
  code: string;
  host: MatchPlayer;
  expiresAt: number;
  disconnectedUntil: number | null;
  speed: Speed;
};
const connections = new Map<string, Socket>(),
  queue = new Map<string, QueuePlayer>();
function queueCounts(): QueueCounts {
  const counts: QueueCounts = {
    ranked: 0,
    casual: { 1: 0, 1.5: 0, 2: 0, 3: 0 },
  };
  for (const player of queue.values()) {
    if (player.mode === "ranked") counts.ranked++;
    else counts.casual[player.speed]++;
  }
  return counts;
}
function leaveQueue(
  id: string,
  reason: "matched" | "cancelled" | "disconnected",
) {
  const entry = queue.get(id);
  if (!entry) return;
  queue.delete(id);
  io.emit("queue_counts", queueCounts());
  metrics.record(`queue_${reason}`);
  if (reason === "matched")
    metrics.record("queue_wait_ms", Date.now() - entry.joinedAt, true);
}
// ponytail: waiting rooms live in one process; persist them when adding multiple game servers.
const invitations = new Map<string, Invitation>(),
  playerInvitations = new Map<string, string>();
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function closeInvitation(invite: Invitation, message?: string) {
  invitations.delete(invite.code);
  playerInvitations.delete(invite.host.player.id);
  if (message !== undefined)
    connections.get(invite.host.player.id)?.emit("room_closed", { message });
}
function invitation(code: string) {
  const invite = invitations.get(code);
  if (
    invite &&
    (Date.now() >= invite.expiresAt ||
      (invite.disconnectedUntil !== null &&
        Date.now() >= invite.disconnectedUntil))
  ) {
    closeInvitation(invite, "This room expired. Create a new room.");
    return undefined;
  }
  return invite;
}
function sendInvitation(socket: Socket, invite: Invitation | undefined) {
  socket.emit(
    "room_waiting",
    invite
      ? { code: invite.code, expiresAt: invite.expiresAt, speed: invite.speed }
      : null,
  );
}
const experiences = new Map<string, AdExperience[]>();
const browserConnections = new Map<string, Socket>();
function requestIP(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  return typeof forwarded === "string"
    ? forwarded.split(",").at(-1)!.trim()
    : req.socket.remoteAddress || "unknown";
}
const spool = process.env.STATE_DIR || "./var";
const designDirectory = `${spool}/design-files`;
await connectRedis();
await mkdir(`${spool}/completed`, { recursive: true });
await mkdir(designDirectory, { recursive: true, mode: 0o700 });
for (const row of (await db.query("SELECT * FROM settings")).rows) {
  if (row.key === "balance") balance = balanceSchema.parse(row.value);
  if (row.key === "ads") ads = adSchema.parse(row.value);
}
// ponytail: one authoritative process; add distributed ownership only when scaling beyond one VM.
await redis.del(["mathrix:queue", "mathrix:live"]);
for (const file of await readdir(`${spool}/completed`))
  if (file.endsWith(".json")) {
    try {
      const room = new Room(
        JSON.parse(await readFile(`${spool}/completed/${file}`, "utf8")),
      );
      rooms.set(room.game.id, room);
      await save(room);
    } catch {
      log("persistence_retry_pending");
    }
  }
async function identity(
  req: IncomingMessage,
  res?: ServerResponse,
): Promise<Identity | null> {
  const { response: session, headers } = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableRefresh: !res },
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie())
    res?.appendHeader("Set-Cookie", cookie);
  if (session) {
    const row = (
      await db.query(
        `SELECT u.id,COALESCE(u.username,u.name) AS name,u.role,u.disabled,u."isGuest",u."guestImportId",u."avatarId",u.city,u."countryCode",${premiumSQL} AS premium FROM "user" u LEFT JOIN billing b ON b.user_id=u.id WHERE u.id=$1`,
        [session.user.id],
      )
    ).rows[0];
    if (!row || row.disabled || row.isGuest) return null;
    return {
      id: row.id,
      name: row.name,
      registered: true,
      role: row.role,
      importPending: Boolean(row.guestImportId),
      ...appearance(row),
    };
  }
  const token = parseCookies(req.headers.cookie).mathrix_guest;
  return guestFromSession(token);
}
function setGuestCookie(
  res: ServerResponse,
  token: string,
  seconds = guestSessionSeconds,
) {
  res.appendHeader(
    "Set-Cookie",
    `mathrix_guest=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${appURL.startsWith("https:") ? "; Secure" : ""}`,
  );
}
function requireIdleGuest(id: string) {
  if (
    importingGuests.has(id) ||
    playerRooms.has(id) ||
    queue.has(id) ||
    invitation(playerInvitations.get(id) || "") ||
    [...rooms.values()].some(
      (r) => !r.persisted && r.game.players.some((p) => p.id === id),
    )
  )
    throw Error(
      "Finish the guest's game, cancel any search or room, and wait for the result to save before importing.",
    );
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
  res.appendHeader(
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
      `SELECT u.id,COALESCE(u.username,u.name) AS name,u."avatarId",u.city,u."countryCode",${premiumSQL} AS premium,s.*,RANK() OVER(ORDER BY s.rating DESC) AS rank FROM player_stats s JOIN "user" u ON u.id=s.user_id LEFT JOIN billing b ON b.user_id=u.id WHERE NOT u.disabled ORDER BY s.rating DESC,u.name LIMIT 100`,
    )
  ).rows;
}
async function playerRanks(ids: string[]) {
  return (
    await db.query<{ user_id: string; rank: number; played: number }>(
      `SELECT user_id, rank::integer, played FROM (
        SELECT s.user_id, s.played, RANK() OVER (ORDER BY s.rating DESC) AS rank
        FROM player_stats s JOIN "user" u ON u.id=s.user_id WHERE NOT u.disabled
      ) ranked WHERE user_id=ANY($1::text[])`,
      [ids],
    )
  ).rows;
}
async function history(id: string) {
  return (
    await db.query(
      "SELECT m.id,m.ended_at,m.rated,m.mode,m.speed,p.result,p.score,p.rating_before,p.rating_after,o.display_name AS opponent,o.score AS opponent_score FROM match_participants p JOIN matches m ON m.id=p.match_id JOIN match_participants o ON o.match_id=m.id AND o.seat<>p.seat WHERE p.user_id=$1 ORDER BY m.ended_at DESC LIMIT 50",
      [id],
    )
  ).rows;
}
async function send(room: Room, kind = "update") {
  const state = publicGame(room.game, room.disconnectedAt);
  for (const p of room.game.players) connections.get(p.id)?.emit(kind, state);
}
async function save(room: Room) {
  if (room.persisted || room.saving || Date.now() < room.retryAt) return;
  room.saving = true;
  const g = room.game;
  for (const p of g.players)
    if (playerRooms.get(p.id) === g.id) {
      playerRooms.delete(p.id);
      completedRooms.set(p.id, g.id);
    }
  const path = `${spool}/completed/${g.id}.json`;
  try {
    await writeFile(path + ".tmp", JSON.stringify(g), { mode: 0o600 });
    await rename(path + ".tmp", path);
    await persistMatch(g);
    await unlink(path);
    room.persisted = true;
    for (const p of g.players)
      connections.get(p.id)?.emit("persisted", { matchId: g.id });
    log("match_persisted", { matchId: g.id });
  } catch {
    room.retryAt = Date.now() + 5000;
    metrics.record("save_failures");
    log("match_persist_error", { matchId: g.id });
    return;
  } finally {
    room.saving = false;
  }
  setTimeout(
    () => {
      rooms.delete(g.id);
      experiences.delete(g.id);
      for (const p of g.players)
        if (completedRooms.get(p.id) === g.id) completedRooms.delete(p.id);
    },
    15 * 60 * 1000,
  ).unref();
}
const server = createServer(async (req, res) => {
  metrics.trackHTTP(req, res);
  try {
    const url = new URL(req.url || "/", appURL),
      path = url.pathname,
      method = req.method;
    if (path === "/api/email/unsubscribe") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      );
      if (method !== "GET" && method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      if (!(await rateLimit(`email-unsubscribe:${requestIP(req)}`, 60, 60))) {
        json(res, { error: "Please wait before trying again." }, 429);
        return;
      }
      const token = url.searchParams.get("token") || "";
      // Mail providers' signed one-click requests do not include browser Origin.
      if (method === "POST") {
        await unsubscribeCommunityEmail(token);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed | Mathrix</title><h1>You are unsubscribed</h1><p>You will no longer receive Mathrix community emails.</p><a href="/">Return to Mathrix</a></html>',
        );
      } else {
        const html = emailUnsubscribePage(token);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
      }
      return;
    }
    if (path === "/api/billing/webhook" && method === "POST") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 262144) {
          json(res, { error: "Webhook too large" }, 413);
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const signature = req.headers["stripe-signature"];
      const event = verifyBillingEvent(
        Buffer.concat(chunks),
        typeof signature === "string" ? signature : "",
      );
      try {
        await processBillingEvent(event);
        json(res, { received: true });
      } catch {
        log("billing_webhook_failed", { eventId: event.id, type: event.type });
        json(res, { error: "Webhook processing failed" }, 500);
      }
      return;
    }
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
      const player = await identity(req, res);
      const config = h5Config(ads);
      json(res, {
        ...config,
        enabled: config.enabled && Boolean(player) && !player?.premium,
      });
      return;
    }
    const p = await identity(
      req,
      path === "/api/me" && url.searchParams.get("refresh") === "false"
        ? undefined
        : res,
    );
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
      const g = await createGuest(balance.startingRating);
      setGuestCookie(res, await createGuestSession(g.id));
      json(res, g);
      return;
    }
    if (path === "/api/guest/code" && method === "GET" && p && !p.registered) {
      json(res, { code: guestCode(p.id) });
      return;
    }
    if (path === "/api/guest/sign-out" && method === "POST") {
      const token = parseCookies(req.headers.cookie).mathrix_guest;
      if (token && /^[A-Za-z0-9_-]{43}$/.test(token))
        await redis.del(`guest-session:${token}`);
      setGuestCookie(res, "", 0);
      if (p && !p.registered) connections.get(p.id)?.disconnect(true);
      json(res, { ok: true });
      return;
    }
    if (
      ["/api/guest/restore", "/api/guest/import-intent"].includes(path) &&
      method === "POST"
    ) {
      if (!(await rateLimit(`guest-code:${ip}`, 10, 60))) {
        json(
          res,
          { error: "Too many guest-code attempts. Try again in a minute." },
          429,
        );
        return;
      }
      if (p?.registered)
        throw Error(
          "Sign out before restoring a guest or creating a new account",
        );
      const { code } = z
        .object({ code: z.string().trim().max(128) })
        .strict()
        .parse(await body(req));
      const guest = await guestFromCode(code);
      if (path.endsWith("import-intent")) {
        requireIdleGuest(guest.id);
        json(res, { token: await prepareGuestImport(guest.id) });
      } else {
        if (importingGuests.has(guest.id))
          throw Error("Guest import is in progress");
        if (p && p.id !== guest.id) requireIdleGuest(p.id);
        browserCookie(req, res);
        setGuestCookie(res, await createGuestSession(guest.id));
        json(res, guest);
      }
      return;
    }
    if (path === "/api/guest/import" && method === "POST" && p?.registered) {
      const { skip } = z
        .object({ skip: z.boolean().default(false) })
        .strict()
        .parse(await body(req));
      const guestId = await pendingGuestImport(p.id);
      if (guestId && !skip) {
        requireIdleGuest(guestId);
        importingGuests.add(guestId);
      }
      try {
        const imported = await finishGuestImport(p.id, skip);
        if (imported) {
          connections
            .get(imported)
            ?.emit("notice", "This guest was imported into a new account.");
          connections.get(imported)?.disconnect(true);
          completedRooms.delete(imported);
        }
        setGuestCookie(res, "", 0);
        json(res, {
          status: imported ? "imported" : skip ? "skipped" : "none",
        });
      } finally {
        if (guestId && !skip) importingGuests.delete(guestId);
      }
      return;
    }
    if (path === "/api/play-options" && method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      json(res, {
        matchMs: balance.matchMs,
        turnStartMs: balance.turnStartMs,
        turnEndMs: balance.turnEndMs,
        currentRank: p ? ((await playerRanks([p.id]))[0]?.rank ?? null) : null,
      });
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
    if (
      ["/api/billing/checkout", "/api/billing/portal"].includes(path) &&
      method === "POST"
    ) {
      if (!p?.registered || p.importPending) {
        json(
          res,
          { error: "Create an account and finish registration to subscribe." },
          403,
        );
        return;
      }
      if (!(await rateLimit(`billing:${p.id}`, 10, 60))) {
        json(res, { error: "Please wait before trying again." }, 429);
        return;
      }
      try {
        json(
          res,
          await (path.endsWith("checkout")
            ? checkout(p.id)
            : billingPortal(p.id)),
        );
      } catch (e) {
        if (e instanceof BillingError) throw e;
        // Provider errors can quote a misconfigured API key; never log their message.
        log("billing_request_failed", { action: path });
        throw new BillingError("Could not open billing. Please try again.");
      }
      return;
    }
    if (path === "/api/profile" && !p) {
      json(res, { error: "Sign in to view your profile." }, 401);
      return;
    }
    if (
      path === "/api/profile" &&
      p &&
      (method === "GET" || method === "POST")
    ) {
      if (p.importPending) {
        json(
          res,
          {
            error: "Finish account creation to view your profile",
            importPending: true,
          },
          409,
        );
        return;
      }
      if (method === "POST") {
        if (!p.registered) {
          json(
            res,
            { error: "Create an account to customize your profile." },
            403,
          );
          return;
        }
        if (!(await rateLimit(`profile:${p.id}`, 20, 60))) {
          json(res, { error: "Please wait before saving again." }, 429);
          return;
        }
        const d = profileSchema.parse(await body(req));
        try {
          await db.query(
            'UPDATE "user" SET username=$2,city=$3,"countryCode"=$4,"avatarId"=$5,"updatedAt"=now() WHERE id=$1',
            [p.id, d.username, d.city, d.countryCode, d.avatarId],
          );
        } catch (e) {
          if ((e as { code?: string }).code === "23505") {
            json(res, { error: "That username is already taken." }, 409);
            return;
          }
          throw e;
        }
      }
      await db.query(
        "INSERT INTO player_stats(user_id,rating) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [p.id, balance.startingRating],
      );
      const row = (
        await db.query(
          `SELECT COALESCE(u.username,u.name) AS name,u.username,u."avatarId",u.city,u."countryCode",${premiumSQL} AS premium,s.*,(SELECT count(*)+1 FROM player_stats WHERE rating>s.rating) AS rank FROM player_stats s JOIN "user" u ON u.id=s.user_id LEFT JOIN billing b ON b.user_id=u.id WHERE s.user_id=$1`,
          [p.id],
        )
      ).rows[0];
      json(res, {
        ...row,
        registered: p.registered,
        billing: p.registered ? await billingSummary(p.id) : null,
        history: await history(p.id),
      });
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
      if (path === "/api/admin/email") {
        res.setHeader("Cache-Control", "private, no-store");
        if (method === "GET") json(res, await getEmailDashboard());
        else if (method === "POST") {
          json(res, await saveWeeklyEmail(await body(req)));
          log("admin_weekly_email_changed", { adminId: p.id });
        } else {
          res.setHeader("Allow", "GET, POST");
          json(res, { error: "Method not allowed" }, 405);
        }
        return;
      }
      if (path === "/api/admin/email/send") {
        if (method !== "POST") {
          res.setHeader("Allow", "POST");
          json(res, { error: "Method not allowed" }, 405);
          return;
        }
        if (!(await rateLimit(`community-email:${p.id}`, 3, 60))) {
          json(
            res,
            { error: "Please wait before sending another email." },
            429,
          );
          return;
        }
        const campaign = await queueCommunityEmail(await body(req), p.id);
        json(res, campaign, 202);
        log("admin_community_email_queued", {
          adminId: p.id,
          campaignId: campaign.id,
        });
        void processEmailJobs();
        return;
      }
      if (path === "/api/admin/analytics") {
        if (method !== "GET") {
          res.setHeader("Allow", "GET");
          json(res, { error: "Method not allowed" }, 405);
          return;
        }
        const range = z
          .enum(["1h", "24h", "7d", "30d"])
          .safeParse(url.searchParams.get("range") ?? "1h");
        if (!range.success) {
          json(res, { error: "Invalid analytics range" }, 400);
          return;
        }
        try {
          json(res, await analytics(range.data));
        } catch {
          json(res, { error: "Analytics are temporarily unavailable" }, 503);
        }
        return;
      }
      if (path === "/api/admin/design-files") {
        if (method === "GET") json(res, await listDesignFiles(designDirectory));
        else if (method === "POST") {
          const file = await uploadDesignFile(req, designDirectory, p.id);
          log("admin_design_uploaded", {
            adminId: p.id,
            filename: file.filename,
          });
          json(res, file, 201);
        } else {
          res.setHeader("Allow", "GET, POST");
          json(res, { error: "Method not allowed" }, 405);
        }
        return;
      }
      if (path === "/api/admin/design-files/download") {
        if (method !== "GET") {
          res.setHeader("Allow", "GET");
          json(res, { error: "Method not allowed" }, 405);
          return;
        }
        const { metadata, bytes } = await downloadDesignFile(
          designDirectory,
          url.searchParams.get("filename") || "",
        );
        const encoded = encodeURIComponent(metadata.filename).replace(
          /['()*]/g,
          (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        res.writeHead(200, {
          "Content-Type": metadata.mimeType,
          "Content-Length": bytes.length,
          "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(bytes);
        return;
      }
      if (path === "/api/admin/overview") {
        const totals = (
          await db.query(
            "SELECT count(*)::int AS completed,count(*) FILTER(WHERE ended_at>=CURRENT_DATE)::int AS today,COALESCE(avg(duration_ms),0)::float AS average_ms,COALESCE(avg(CASE WHEN winner IS NULL THEN 1.0 ELSE 0 END),0)::float AS draw_rate FROM matches",
          )
        ).rows[0];
        const users = (
          await db.query(
            'SELECT count(*)::int AS count FROM "user" WHERE NOT "isGuest"',
          )
        ).rows[0].count;
        const guests = Number(
          (await db.query('SELECT count(*) FROM "user" WHERE "isGuest"'))
            .rows[0].count,
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
            const invite = invitations.get(playerInvitations.get(id) || "");
            if (invite) closeInvitation(invite, "This account is disabled.");
            connections.get(id)?.disconnect(true);
            leaveQueue(id, "cancelled");
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
    if (e instanceof EmailError) {
      json(res, { error: e.message }, e.status);
      return;
    }
    if (e instanceof BillingError) {
      json(res, { error: e.message }, e.status);
      return;
    }
    if (e instanceof DesignFileError) {
      if (e.status === 413) res.setHeader("Connection", "close");
      json(res, { error: e.message }, e.status);
      return;
    }
    if (e instanceof z.ZodError) {
      json(res, { error: e.issues.map((x) => x.message).join("; ") }, 400);
      return;
    }
    log("request_failed", {
      path: req.url,
      error: e instanceof Error ? e.message : "unknown",
    });
    metrics.record("http_exceptions");
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
    if (p.importPending) throw Error("Finish account creation before playing");
    if (importingGuests.has(p.id)) throw Error("Guest import is in progress");
    socket.data.player = p;
    next();
  } catch {
    next(Error("Authentication required"));
  }
});
async function pair(mode: "ranked" | "casual", speed: Speed) {
  for (;;) {
    const players = [...queue.values()]
      .filter((p) => p.mode === mode && p.speed === speed)
      .slice(0, 2);
    if (players.length < 2) return;
    players.forEach((x) => leaveQueue(x.player.id, "matched"));
    await reserveMatch(players, mode, speed);
  }
}
async function reserveMatch(
  pair: MatchPlayer[],
  mode: MatchMode,
  speed: Speed,
) {
  const id = randomUUID();
  const players = pair.map(({ player: p }) => ({
    id: p.id,
    name: p.name,
    registered: p.registered,
    ...appearance(p),
  }));
  if (mode === "ai")
    players.push({
      id: `ai:${id}`,
      name: "Mathrix AI",
      registered: false,
      ...appearance({}),
    });
  const g = createGame(
    id,
    randomInt(1, 2147483647),
    players,
    balance,
    Date.now(),
    mode,
    speed,
  );
  const adConfig = ads;
  const room = new Room(g, 120000);
  room.waitForAdCompletion = true;
  room.readyNotBefore = [
    room.readyDeadline,
    mode === "ai" ? 0 : room.readyDeadline,
  ];
  // Claim both players before loading current profiles or contacting an ad provider.
  rooms.set(g.id, room);
  pair.forEach(({ player }) => {
    completedRooms.delete(player.id);
    playerRooms.set(player.id, g.id);
    connections.get(player.id)?.emit("match_pending", { matchId: g.id });
  });
  log("match_reserved", { matchId: g.id });
  try {
    const current = await Promise.all(
      pair.map(async ({ player }) => {
        const connection = connections.get(player.id);
        const fresh = connection && (await identity(connection.request));
        if (!fresh || fresh.id !== player.id || fresh.importPending)
          throw Error("Player unavailable");
        return fresh;
      }),
    );
    if (!rooms.has(g.id)) return;
    const stats = await playerRanks(current.map((p) => p.id));
    if (!rooms.has(g.id)) return;
    current.forEach((p, i) => {
      pair[i].player = p;
      const stat = stats.find((s) => s.user_id === p.id);
      Object.assign(g.players[i], {
        name: p.name,
        ...appearance(p),
        rank: stat?.rank ?? null,
        played: stat?.played ?? 0,
      });
    });
    const offered = await Promise.all(
      pair.map(async (x) => {
        try {
          return await adFor(x.player, g.id, adConfig, x.consent);
        } catch {
          log("ad_failure", { matchId: g.id, playerId: x.player.id });
          return x.player.premium
            ? ({ kind: "none", durationMs: 0 } as AdExperience)
            : ({
                kind: "unavailable",
                durationMs: h5Config(adConfig).enabled
                  ? adConfig.pregameWaitMs
                  : 0,
              } as AdExperience);
        }
      }),
    );
    if (!rooms.has(g.id)) return;
    experiences.set(g.id, offered);
    const offeredAt = Date.now();
    room.waitForAdCompletion = offered.some((a) => a.kind === "h5");
    room.readyDeadline =
      offeredAt +
      (room.waitForAdCompletion
        ? 120000
        : Math.max(
            adConfig.maxWaitMs,
            ...offered.map((a) => a.durationMs + 1000),
          ));
    offered.forEach((ad, i) => {
      room.readyNotBefore[i] = offeredAt + ad.durationMs;
      connections.get(pair[i].player.id)?.emit("reserved", {
        game: publicGame(g, room.disconnectedAt),
        ad,
        readyAt: room.readyNotBefore[i],
        readyDeadline: room.readyDeadline,
      });
    });
  } catch {
    if (!rooms.has(g.id)) return;
    for (const p of g.players) {
      if (playerRooms.get(p.id) === g.id) playerRooms.delete(p.id);
      connections.get(p.id)?.emit("pregame_cancelled", {
        matchId: g.id,
        message: "Could not verify the players. Please search again.",
      });
    }
    rooms.delete(g.id);
    experiences.delete(g.id);
    log("reservation_failed", { matchId: g.id });
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
  socket.emit("queue_counts", queueCounts());
  log("connected", { playerId: p.id, registered: p.registered });
  const waiting = invitation(playerInvitations.get(p.id) || "");
  if (waiting) waiting.disconnectedUntil = null;
  sendInvitation(socket, waiting);
  const existing = rooms.get(
    playerRooms.get(p.id) || completedRooms.get(p.id) || "",
  );
  if (existing) {
    const i = existing.game.players.findIndex((x) => x.id === p.id);
    if (
      existing.game.status !== "finished" &&
      existing.disconnectedAt[i] !== null
    )
      metrics.record("match_reconnects");
    existing.reconnect(i, Date.now());
    const ad = experiences.get(existing.game.id)?.[i];
    if (!ad && existing.game.status !== "finished")
      socket.emit("match_pending", { matchId: existing.game.id });
    if (ad || existing.game.status === "finished")
      socket.emit("reserved", {
        game: publicGame(existing.game, existing.disconnectedAt),
        ad: ad ?? { kind: "none", durationMs: 0 },
        readyAt: existing.readyNotBefore[i],
        readyDeadline: existing.readyDeadline,
      });
    if (existing.game.status !== "finished") void send(existing);
    if (existing.persisted)
      socket.emit("persisted", { matchId: existing.game.id });
  }
  const command = (name: string, fn: (data: unknown) => Promise<void> | void) =>
    socket.on(name, async (data: unknown) => {
      const started = performance.now();
      let outcome = "rejected";
      try {
        if (!(await rateLimit(`socket:${p.id}`, 80, 10)))
          throw Error("Too many actions");
        const currentIdentity = await identity(socket.request);
        if (currentIdentity?.id !== p.id)
          throw Error("Session expired or account disabled");
        if (currentIdentity.importPending || importingGuests.has(p.id))
          throw Error("Finish account creation before playing");
        if (!socket.connected || connections.get(p.id)?.id !== socket.id)
          throw Error("This session moved to another tab");
        Object.assign(p, currentIdentity);
        await fn(data);
        outcome = "ok";
      } catch (e) {
        metrics.record("command_rejections");
        const message =
          e instanceof z.ZodError
            ? e.issues.map((issue) => issue.message).join("; ")
            : e instanceof Error
              ? e.message
              : "Invalid action";
        socket.emit("action_error", message);
        log("operation_rejected", {
          playerId: p.id,
          matchId: playerRooms.get(p.id),
          command: name,
          reason: message.slice(0, 200),
        });
      } finally {
        metrics.record(
          `command_${name}_${outcome}_ms`,
          performance.now() - started,
          true,
        );
      }
    });
  const current = () => {
    const r = rooms.get(playerRooms.get(p.id) || "");
    if (!r) throw Error("No active match");
    return { room: r, seat: r.game.players.findIndex((x) => x.id === p.id) };
  };
  command("queue", async (data) => {
    const d = queueSchema.parse(data || {});
    if (!(await rateLimit(`queue:${p.id}`, 10, 60)))
      throw Error("Please wait before rejoining");
    if (!socket.connected || connections.get(p.id)?.id !== socket.id)
      throw Error("This session moved to another tab");
    if (playerRooms.has(p.id)) throw Error("Already in a match");
    if (importingGuests.has(p.id)) throw Error("Guest import is in progress");
    if (invitation(playerInvitations.get(p.id) || ""))
      throw Error("Cancel your room before searching for an opponent");
    completedRooms.delete(p.id);
    const queued = queue.get(p.id);
    if (queued && (queued.mode !== d.mode || queued.speed !== d.speed))
      throw Error("Cancel your search before changing mode");
    if (!queued) {
      queue.set(p.id, { player: p, ...d, joinedAt: Date.now() });
      io.emit("queue_counts", queueCounts());
      metrics.record("queue_entered");
    }
    socket.emit("queued", { mode: d.mode, speed: d.speed });
    log("queued", { playerId: p.id });
    await pair(d.mode, d.speed);
  });
  command("cancel", () => {
    leaveQueue(p.id, "cancelled");
    socket.emit("cancelled");
  });
  const available = () => {
    if (importingGuests.has(p.id)) throw Error("Guest import is in progress");
    if (!socket.connected || connections.get(p.id)?.id !== socket.id)
      throw Error("This session moved to another tab");
    if (playerRooms.has(p.id)) throw Error("Already in a match");
    if (queue.has(p.id))
      throw Error("Cancel your search before joining a room");
  };
  const roomLimit = async () => {
    const allowed = await Promise.all([
      rateLimit(`room:${p.id}`, 10, 60),
      rateLimit(`room-ip:${requestIP(socket.request)}`, 30, 60),
    ]);
    if (!allowed.every(Boolean))
      throw Error("Please wait before trying another room");
    available();
  };
  command("ai_start", async (data) => {
    const d = roomCreateSchema.parse(data || {});
    await roomLimit();
    if (invitation(playerInvitations.get(p.id) || ""))
      throw Error("Cancel your room before playing against AI");
    await reserveMatch([{ player: p, consent: d.consent }], "ai", d.speed);
  });
  command("room_create", async (data) => {
    const d = roomCreateSchema.parse(data || {});
    await roomLimit();
    let invite = invitation(playerInvitations.get(p.id) || "");
    if (!invite) {
      let code: string;
      do {
        code = Array.from(
          { length: 6 },
          () => roomAlphabet[randomInt(roomAlphabet.length)],
        ).join("");
      } while (invitations.has(code));
      invite = {
        code,
        host: { player: p, consent: d.consent },
        expiresAt: Date.now() + 15 * 60 * 1000,
        disconnectedUntil: null,
        speed: d.speed,
      };
      invitations.set(code, invite);
      playerInvitations.set(p.id, code);
      completedRooms.delete(p.id);
      log("room_created", { playerId: p.id });
    }
    sendInvitation(socket, invite);
  });
  command("room_join", async (data) => {
    const d = matchmakingSchema
      .extend({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Enter a six-character room code"),
      })
      .parse(data);
    await roomLimit();
    const invite = invitation(d.code);
    if (!invite)
      throw Error(
        "Room unavailable. Check the code or ask for a new invitation.",
      );
    if (invite.host.player.id === p.id)
      throw Error("You cannot join your own room");
    if (invitation(playerInvitations.get(p.id) || ""))
      throw Error("Cancel your room before joining another");
    const host = connections.get(invite.host.player.id);
    if (!host?.connected)
      throw Error("The host is reconnecting. Try again shortly.");
    const [hostIdentity, joiningIdentity] = await Promise.all([
      identity(host.request),
      identity(socket.request),
    ]);
    available();
    if (joiningIdentity?.id !== p.id)
      throw Error("Session expired or account disabled");
    if (invitation(d.code) !== invite)
      throw Error("Room unavailable. Ask for a new invitation.");
    if (!hostIdentity || hostIdentity.id !== invite.host.player.id) {
      closeInvitation(invite, "Session expired or account disabled");
      throw Error("Room unavailable. Ask for a new invitation.");
    }
    if (!host.connected || connections.get(hostIdentity.id)?.id !== host.id)
      throw Error("The host is reconnecting. Try again shortly.");
    if (
      playerRooms.has(hostIdentity.id) ||
      importingGuests.has(hostIdentity.id) ||
      queue.has(hostIdentity.id) ||
      invitation(playerInvitations.get(p.id) || "")
    )
      throw Error("A player is already in a room or searching for a match");
    // Claim both players synchronously before advertisement loading yields.
    closeInvitation(invite);
    await reserveMatch(
      [
        { player: hostIdentity, consent: invite.host.consent },
        { player: joiningIdentity, consent: d.consent },
      ],
      "custom",
      invite.speed,
    );
  });
  command("room_cancel", () => {
    const invite = invitations.get(playerInvitations.get(p.id) || "");
    if (invite) closeInvitation(invite, "");
    else socket.emit("room_closed", { message: "" });
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
  command("skip", async (data) => {
    const d = actionSchema
        .pick({ seq: true })
        .extend({ matchId: z.string().uuid() })
        .parse(data),
      { room, seat } = current();
    if (d.matchId !== room.game.id) throw Error("Stale match action");
    skipTurn(room.game, seat, d.seq, Date.now());
    log("skip_turn", { matchId: room.game.id, playerId: p.id });
    await send(room);
  });
  socket.on("disconnect", () => {
    if (connections.get(p.id)?.id !== socket.id) return;
    connections.delete(p.id);
    if (browserConnections.get(browserKey)?.id === socket.id)
      browserConnections.delete(browserKey);
    leaveQueue(p.id, "disconnected");
    const invite = invitations.get(playerInvitations.get(p.id) || "");
    if (invite) invite.disconnectedUntil = Date.now() + balance.reconnectMs;
    const r = rooms.get(playerRooms.get(p.id) || "");
    if (r) {
      if (r.game.status !== "finished") metrics.record("match_disconnects");
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
  for (const code of invitations.keys()) invitation(code);
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
    if (room.game.status === "finished" && !room.persisted) void save(room);
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
async function processEmailJobs() {
  try {
    await runEmailJobs();
  } catch {
    log("community_email_worker_failed");
  }
}
const emailTimer = setInterval(() => void processEmailJobs(), 60000);
void processEmailJobs();
const stopMetrics = metrics.start(() => ({
  connections: connections.size,
  active_matches: [...rooms.values()].filter(
    (r) => r.game.status !== "finished",
  ).length,
  queued_players: queue.size,
  pending_saves: [...rooms.values()].filter(
    (r) => r.game.status === "finished" && !r.persisted,
  ).length,
}));
server.listen(
  Number(process.env.GAME_PORT || 3001),
  process.env.GAME_HOST || "127.0.0.1",
  () => log("server_started", { port: process.env.GAME_PORT || 3001 }),
);
async function shutdown() {
  clearInterval(timer);
  clearInterval(metadata);
  clearInterval(emailTimer);
  await stopEmailJobs();
  for (const room of rooms.values())
    if (room.game.status !== "finished") {
      finishGame(room.game, Date.now(), "server_shutdown");
      await save(room);
    }
  io.close();
  server.close();
  await stopMetrics();
  await redis.quit();
  await db.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

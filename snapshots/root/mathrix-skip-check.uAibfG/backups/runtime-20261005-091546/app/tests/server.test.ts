import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  legalTargets,
  createGame,
  startGame,
  finishGame,
  type PublicGame,
} from "../lib/engine";
import { db } from "../server/db";
import type { AdExperience } from "../server/ads";
import { persistMatch } from "../server/persistence";
after(() => db.end());
const base = process.env.TEST_API_URL || "http://127.0.0.1:3001",
  origin = process.env.APP_URL || "http://localhost:3000";
async function request(path: string, data?: unknown, cookie = "") {
  return fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
const logins = new Map<string, string>();
async function login(email: string) {
  if (logins.has(email)) return logins.get(email)!;
  const r = await request("/api/auth/sign-in/email", {
    email,
    password: "amdin",
  });
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  logins.set(email, cookie);
  return cookie;
}
async function guest() {
  const r = await request("/api/guest", {});
  return r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
}
function once<T>(s: Socket, event: string, timeout = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(event, done);
      reject(Error(`Timeout ${event}`));
    }, timeout);
    const done = (v: T) => {
      clearTimeout(t);
      resolve(v);
    };
    s.once(event, done);
  });
}
function socket(cookie: string) {
  return io(base, {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: cookie },
    autoConnect: false,
  });
}
test("health, seeded login, protected administration and CSRF", async () => {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/admin/overview")).status, 403);
  const cookie = await login("admin1@mathrix.app");
  assert.equal(
    (await request("/api/admin/overview", undefined, cookie)).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const c = await guest();
  assert.equal(
    (await request("/api/admin/settings", undefined, c)).status,
    403,
  );
});
test("real websocket guests match, synchronize, reject stale/out-of-turn actions and cancel queue", async () => {
  const cookieA = await guest();
  const playerA = await (await request("/api/me", undefined, cookieA)).json();
  const a = socket(cookieA),
    b = socket(await guest());
  try {
    a.connect();
    b.connect();
    await Promise.all([once(a, "connect"), once(b, "connect")]);
    const reservedA = once<{ game: PublicGame; ad: { durationMs: number } }>(
        a,
        "reserved",
      ),
      reservedB = once<{ game: PublicGame; ad: { durationMs: number } }>(
        b,
        "reserved",
      );
    a.emit("queue", { consent: false });
    b.emit("queue", { consent: false });
    const [ra, rb] = await Promise.all([reservedA, reservedB]);
    assert.equal(ra.game.id, rb.game.id);
    assert.deepEqual(ra.game.players, rb.game.players);
    assert.equal(ra.game.endAt, 0);
    await new Promise((r) =>
      setTimeout(r, Math.max(ra.ad.durationMs, rb.ad.durationMs) + 200),
    );
    const playingA = new Promise<PublicGame>((resolve) =>
      a.on("update", (g) => {
        if (g.status === "playing") resolve(g);
      }),
    );
    a.emit("ready", { matchId: ra.game.id });
    b.emit("ready", { matchId: rb.game.id });
    const g = await playingA;
    const active = g.players[g.active].id === playerA.id ? a : b,
      inactive = active === a ? b : a;
    const c = g.cards.find((c) => legalTargets(g, g.active, c).length)!;
    const target = legalTargets(g, g.active, c)[0];
    const error = once<string>(inactive, "action_error");
    inactive.emit("use", { cardId: c.id, seq: g.seq, target });
    assert.match(await error, /turn/);
    const updateA = once<PublicGame>(a, "update"),
      updateB = once<PublicGame>(b, "update");
    active.emit("use", { cardId: c.id, seq: g.seq, target });
    const [ga, gb] = await Promise.all([updateA, updateB]);
    assert.deepEqual(ga.players, gb.players);
    assert.equal(ga.seq, gb.seq);
    assert.ok(ga.seq > g.seq);
    const replay = once<string>(active, "action_error");
    active.emit("use", { cardId: c.id, seq: g.seq, target });
    assert.match(await replay, /turn|stale|consumed/);
    a.disconnect();
    const resumed = once<{ game: PublicGame }>(a, "reserved");
    a.connect();
    const state = await resumed;
    assert.equal(state.game.id, g.id);
    assert.ok(state.game.seq >= ga.seq);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
test("admin settings reject invalid weights and unsafe campaigns", async () => {
  const cookie = await login("admin2@mathrix.app");
  const r = await request("/api/admin/settings", undefined, cookie);
  const settings = await r.json();
  settings.balance.maxRows = 999;
  assert.equal(
    (await request("/api/admin/settings", settings, cookie)).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/admin/campaigns",
        {
          name: "x",
          headline: "x",
          body: "x",
          image_url: "",
          destination_url: "javascript:alert(1)",
          cta: "x",
          audience: "everyone",
          active: true,
          starts_at: null,
          ends_at: null,
          duration_ms: 1000,
          weight: 1,
        },
        cookie,
      )
    ).status,
    400,
  );
});

test("H5 reservations enforce 15 seconds and preserve their deadline on reconnect", async () => {
  const cookie = await login("admin2@mathrix.app");
  const original = await (
    await request("/api/admin/settings", undefined, cookie)
  ).json();
  const configured = structuredClone(original);
  Object.assign(configured.ads, {
    enabled: true,
    pregame: true,
    guests: true,
    mode: "EXTERNAL_PROVIDER",
    everyN: 1,
    cooldownMinutes: 0,
    pregameWaitMs: 15000,
    testMode: true,
  });
  assert.equal(
    (await request("/api/admin/settings", configured, cookie)).status,
    200,
  );
  const a = socket(await guest()),
    b = socket(await guest());
  type Reservation = {
    game: PublicGame;
    ad: AdExperience;
    readyAt: number;
    readyDeadline: number;
  };
  try {
    const config = await (await request("/api/ad/config")).json();
    assert.deepEqual(config, {
      enabled: true,
      clientId: "ca-pub-6449099608711175",
      testMode: true,
    });
    a.connect();
    b.connect();
    await Promise.all([once(a, "connect"), once(b, "connect")]);
    const ra = once<Reservation>(a, "reserved"),
      rb = once<Reservation>(b, "reserved");
    a.emit("queue", {});
    b.emit("queue", {});
    const [first, other] = await Promise.all([ra, rb]);
    assert.equal(first.ad.kind, "h5");
    assert.equal(first.ad.durationMs, 15000);
    assert.equal(first.readyAt, other.readyAt);
    assert.ok(first.readyAt - first.game.serverNow >= 14900);
    const early = once<string>(a, "action_error");
    a.emit("ready", { matchId: first.game.id });
    assert.match(await early, /still running/);
    const stale = once<string>(a, "action_error");
    a.emit("ready", { matchId: "00000000-0000-4000-8000-000000000000" });
    assert.match(await stale, /Stale/);
    a.disconnect();
    const resumed = once<Reservation>(a, "reserved");
    a.connect();
    const reconnected = await resumed;
    assert.equal(reconnected.readyAt, first.readyAt);
    assert.equal(reconnected.readyDeadline, first.readyDeadline);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, first.readyAt - Date.now()) + 200),
    );
    const waiting = once<PublicGame>(a, "update");
    a.emit("ready", { matchId: first.game.id });
    assert.equal((await waiting).status, "pregame");
    const countdown = once<PublicGame>(a, "update");
    b.emit("ready", { matchId: first.game.id });
    assert.equal((await countdown).status, "countdown");
  } finally {
    a.disconnect();
    b.disconnect();
    assert.equal(
      (await request("/api/admin/settings", original, cookie)).status,
      200,
    );
  }
});

test("different registered accounts in one browser cannot match each other", async () => {
  const first = await login("admin1@mathrix.app"),
    second = await login("admin2@mathrix.app");
  const me = await request("/api/me", undefined, first);
  const browser = me.headers
    .getSetCookie()
    .find((v) => v.startsWith("mathrix_browser="))!
    .split(";")[0];
  const a = socket(`${first}; ${browser}`),
    b = socket(`${second}; ${browser}`);
  try {
    a.connect();
    await once(a, "connect");
    const queuedA = once(a, "queued");
    a.emit("queue", { consent: false });
    await queuedA;
    const disconnected = once(a, "disconnect");
    b.connect();
    await once(b, "connect");
    await disconnected;
    const queuedB = once(b, "queued");
    b.emit("queue", { consent: false });
    await queuedB;
    const cancelled = once(b, "cancelled");
    b.emit("cancel");
    await cancelled;
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
test("queue cancellation, duplicate tab takeover, reconnect and logged-out socket rejection", async () => {
  const cookie = await login("admin1@mathrix.app"),
    a = socket(cookie);
  try {
    a.connect();
    await once(a, "connect");
    const queued = once(a, "queued");
    a.emit("queue", { consent: false });
    await queued;
    const cancelled = once(a, "cancelled");
    a.emit("cancel");
    await cancelled;
    const b = socket(cookie),
      disconnected = once(a, "disconnect");
    b.connect();
    await once(b, "connect");
    await disconnected;
    try {
      const queuedB = once(b, "queued");
      b.emit("queue", { consent: false });
      await queuedB;
      await request("/api/auth/sign-out", {}, cookie);
      const rejected = once<string>(b, "action_error");
      b.emit("queue", { consent: false });
      assert.match(await rejected, /expired|disabled/);
    } finally {
      b.disconnect();
    }
  } finally {
    a.disconnect();
  }
});
test("new accounts cannot set their own admin role, are suspendable, and never reveal credentials", async () => {
  const email = `test-${Date.now()}@example.invalid`;
  const r = await request("/api/auth/sign-up/email", {
    email,
    name: "Security-Test",
    password: "secure-test-password-123",
    role: "ADMIN",
  });
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  const me = await (await request("/api/me", undefined, cookie)).json();
  assert.equal(me.role, "USER");
  assert.equal(
    (await request("/api/admin/users", undefined, cookie)).status,
    403,
  );
  const adminCookie = await login("admin2@mathrix.app");
  const inspect = await (
    await request(`/api/admin/users/${me.id}`, undefined, adminCookie)
  ).json();
  assert.ok(!JSON.stringify(inspect).includes("password"));
  await request(`/api/admin/users/${me.id}`, { disabled: true }, adminCookie);
  assert.equal(
    await (await request("/api/me", undefined, cookie)).json(),
    null,
  );
  await request(`/api/admin/users/${me.id}`, { disabled: false }, adminCookie);
  const restored = await request("/api/auth/sign-in/email", {
    email,
    password: "secure-test-password-123",
  });
  assert.equal(restored.status, 200);
});
test("completion rolls back on database failure and retries without duplicate stats", async () => {
  const players = (
    await db.query(
      'SELECT id,name FROM "user" WHERE email IN ($1,$2) ORDER BY email',
      ["admin1@mathrix.app", "admin2@mathrix.app"],
    )
  ).rows.map((p) => ({ ...p, registered: true }));
  const g = createGame(randomUUID(), 123, players);
  startGame(g, Date.now() - 100);
  finishGame(g, Date.now(), "clock");
  const counts = async () =>
    (
      await db.query(
        "SELECT user_id,played FROM player_stats WHERE user_id=ANY($1::text[]) ORDER BY user_id",
        [players.map((p) => p.id)],
      )
    ).rows;
  const before = await counts();
  // A real PostgreSQL write failure, limited to this generated test match.
  await db.query(
    `CREATE OR REPLACE FUNCTION mathrix_test_completion_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${g.id}' THEN RAISE EXCEPTION 'test completion failure'; END IF; RETURN NEW; END; $$`,
  );
  await db.query(
    "CREATE TRIGGER mathrix_test_completion_failure BEFORE INSERT ON matches FOR EACH ROW EXECUTE FUNCTION mathrix_test_completion_failure()",
  );
  try {
    await assert.rejects(persistMatch(g), /test completion failure/);
    assert.deepEqual(await counts(), before);
    assert.equal(
      (await db.query("SELECT id FROM matches WHERE id=$1", [g.id])).rowCount,
      0,
    );
  } finally {
    await db.query("DROP TRIGGER mathrix_test_completion_failure ON matches");
    await db.query("DROP FUNCTION mathrix_test_completion_failure()");
  }
  await persistMatch(g);
  await persistMatch(g);
  assert.deepEqual(
    await counts(),
    before.map((p) => ({ ...p, played: p.played + 1 })),
  );
  assert.equal(
    (await db.query("SELECT id FROM matches WHERE id=$1", [g.id])).rowCount,
    1,
  );
});

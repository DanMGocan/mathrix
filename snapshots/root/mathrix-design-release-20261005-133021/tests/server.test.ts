import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
import {
  createGuest,
  guestCode,
  prepareGuestImport,
  pendingGuestImport,
  finishGuestImport,
} from "../server/guests";
import { betterAuth } from "better-auth";
import { auth } from "../server/auth";
after(() => db.end());

test("matrix limit migration caps old settings without resetting other values", async () => {
  const sql = (
    await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8")
  ).match(
    /UPDATE settings SET value = value \|\| jsonb_build_object\([\s\S]*?;/,
  )![0];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TEMP TABLE settings (key text, value jsonb, updated_at timestamptz DEFAULT now()) ON COMMIT DROP",
    );
    for (const [maxRows, maxColumns] of [
      [8, 8],
      [8, 3],
      [3, 8],
      [3, 4],
    ]) {
      const value = {
        maxRows,
        maxColumns,
        matchMs: 54321,
        weights: { add_cell: 7 },
      };
      await client.query("DELETE FROM settings");
      await client.query(
        "INSERT INTO settings(key,value) VALUES('balance',$1),('untouched',$1)",
        [value],
      );
      await client.query(sql);
      assert.equal((await client.query(sql)).rowCount, 0);
      const rows = (
        await client.query("SELECT key,value FROM settings ORDER BY key")
      ).rows;
      assert.deepEqual(rows[0].value, {
        ...value,
        maxRows: Math.min(maxRows, 5),
        maxColumns: Math.min(maxColumns, 5),
      });
      assert.deepEqual(rows[1].value, value);
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("profiles enforce unique handles, gallery choices, account ownership and paid expiry", async () => {
  const cookies = await Promise.all([
    login("admin1@mathrix.app"),
    login("admin2@mathrix.app"),
  ]);
  const original = await Promise.all(
    cookies.map(async (cookie) =>
      (await request("/api/profile", undefined, cookie)).json(),
    ),
  );
  const input = {
    username: `Profile-${randomUUID().slice(0, 8)}`,
    city: "Berlin",
    countryCode: "DE",
    avatarId: "robot-24",
  };
  try {
    const writes = await Promise.all(
      cookies.map((cookie, i) =>
        request(
          "/api/profile",
          {
            ...input,
            username: i ? input.username.toUpperCase() : input.username,
          },
          cookie,
        ),
      ),
    );
    assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
    const winner = writes.findIndex((r) => r.status === 200);
    const profile = await writes[winner].json();
    assert.equal(profile.city, "Berlin");
    assert.equal(profile.avatarId, "robot-24");
    assert.equal(
      (
        await (await request("/api/me", undefined, cookies[winner])).json()
      ).name.toLowerCase(),
      input.username.toLowerCase(),
    );
    for (const patch of [
      { premium: true },
      { countryCode: "ZZ" },
      { avatarId: "https://example.invalid/a" },
      { city: "x".repeat(81) },
    ])
      assert.equal(
        (await request("/api/profile", { ...input, ...patch }, cookies[winner]))
          .status,
        400,
      );
    const guestCookie = await guest();
    assert.equal(
      (await request("/api/profile", input, guestCookie)).status,
      403,
    );
    assert.equal(
      (await request("/api/billing/checkout", {}, guestCookie)).status,
      403,
    );
    const guestPlayer = await (
      await request("/api/me", undefined, guestCookie)
    ).json();
    assert.match(guestPlayer.name, /^[A-Za-z]+-\d{4}$/);
    assert.equal((await request("/api/profile", input)).status, 401);
    assert.equal(
      (await request("/api/billing/checkout", {}, cookies[winner])).status,
      503,
    );
    const id = original[winner].user_id;
    await db.query(
      "INSERT INTO billing(user_id,status,paid_until) VALUES($1,'past_due',now()+interval '1 hour') ON CONFLICT(user_id) DO UPDATE SET status='past_due',paid_until=EXCLUDED.paid_until",
      [id],
    );
    assert.equal(
      (await (await request("/api/me", undefined, cookies[winner])).json())
        .premium,
      true,
    );
    assert.equal(
      (
        await (
          await request("/api/ad/config", undefined, cookies[winner])
        ).json()
      ).enabled,
      false,
    );
    await db.query(
      "UPDATE billing SET paid_until=now()-interval '1 second' WHERE user_id=$1",
      [id],
    );
    assert.equal(
      (await (await request("/api/me", undefined, cookies[winner])).json())
        .premium,
      false,
    );
  } finally {
    for (let i = 0; i < 2; i++) {
      await request(
        "/api/profile",
        {
          username: original[i].username,
          city: original[i].city,
          countryCode: original[i].countryCode,
          avatarId: original[i].avatarId,
        },
        cookies[i],
      );
      await db.query("DELETE FROM billing WHERE user_id=$1", [
        original[i].user_id,
      ]);
    }
  }
});

test("Google and Discord callbacks import only newly created accounts", async (t) => {
  const originalFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0]);
      if (
        [
          "https://oauth2.googleapis.com/token",
          "https://discord.com/api/oauth2/token",
        ].includes(url)
      )
        return Response.json({
          access_token: "test-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        });
      return originalFetch(...args);
    },
  );
  const cookies = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  for (const provider of ["google", "discord"] as const) {
    const subject = randomUUID(),
      email = `oauth-${subject}@example.invalid`;
    const options = {
      clientId: "test-client",
      clientSecret: "test-secret",
      getUserInfo: async () => ({
        user: { name: "OAuth player", email, emailVerified: true },
        data: { sub: subject, id: subject },
      }),
    };
    const oauth = betterAuth({
      ...auth.options,
      rateLimit: { enabled: false },
      socialProviders: { [provider]: options },
    });
    let accountId = "";
    for (const fresh of [true, false]) {
      const guest = await createGuest(1234);
      const token = await prepareGuestImport(guest.id);
      const start = await oauth.handler(
        new Request(`${origin}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            callbackURL: `${origin}/play`,
            newUserCallbackURL: `${origin}/auth/complete`,
            additionalData: { guestImportIntent: token },
          }),
        }),
      );
      assert.equal(start.status, 200, await start.clone().text());
      const state = new URL((await start.json()).url).searchParams.get(
        "state",
      )!;
      const callback = await oauth.handler(
        new Request(
          `${origin}/api/auth/callback/${provider}?state=${encodeURIComponent(state)}&code=test-code`,
          { headers: { Cookie: cookies(start), Origin: origin } },
        ),
      );
      assert.equal(callback.status, 302);
      assert.equal(
        callback.headers.get("location"),
        `${origin}${fresh ? "/auth/complete" : "/play"}`,
      );
      const session = await oauth.api.getSession({
        headers: new Headers({ Cookie: cookies(callback) }),
      });
      assert.ok(session);
      if (fresh) {
        accountId = session.user.id;
        assert.equal(await pendingGuestImport(accountId), guest.id);
        assert.equal(await finishGuestImport(accountId, false), guest.id);
        assert.equal(
          (
            await db.query("SELECT rating FROM player_stats WHERE user_id=$1", [
              accountId,
            ])
          ).rows[0].rating,
          1234,
        );
      } else {
        assert.equal(session.user.id, accountId);
        assert.equal(await pendingGuestImport(accountId), null);
        assert.equal(
          (await db.query('SELECT id FROM "user" WHERE id=$1', [guest.id]))
            .rowCount,
          1,
        );
      }
    }
  }
});

test("ranked rates every player combination; casual and custom only change overall stats", async () => {
  const users = (
    await db.query(
      'SELECT id,name FROM "user" WHERE email IN ($1,$2) ORDER BY email',
      ["admin1@mathrix.app", "admin2@mathrix.app"],
    )
  ).rows.map((p) => ({ ...p, registered: true }));
  for (const mode of ["ranked", "casual", "custom"] as const) {
    for (const kind of ["guests", "mixed", "registered"]) {
      const players =
        kind === "registered"
          ? users
          : [
              await createGuest(1000),
              kind === "mixed" ? users[0] : await createGuest(1000),
            ];
      const ids = players.map((p) => p.id);
      const stats = async () =>
        (
          await db.query(
            "SELECT * FROM player_stats WHERE user_id=ANY($1::text[]) ORDER BY user_id",
            [ids],
          )
        ).rows;
      const before = await stats();
      const g = createGame(
        randomUUID(),
        15,
        players,
        undefined,
        Date.now() - 200,
        mode,
        mode === "ranked" ? 1 : 2,
      );
      startGame(g, Date.now() - 100);
      g.players[0].matrix[0][0] += 5;
      finishGame(g, Date.now());
      await persistMatch(g);
      await persistMatch(g);
      const after = await stats();
      for (const row of after) {
        const old = before.find((p) => p.user_id === row.user_id);
        assert.equal(row.played, (old?.played ?? 0) + 1);
        if (mode !== "ranked") assert.equal(row.rating, old?.rating ?? 1000);
      }
      const match = (
        await db.query("SELECT mode,speed,rated FROM matches WHERE id=$1", [
          g.id,
        ])
      ).rows[0];
      assert.deepEqual(match, {
        mode,
        speed: mode === "ranked" ? 1 : 2,
        rated: mode === "ranked",
      });
      assert.equal(
        (
          await db.query("SELECT * FROM rating_history WHERE match_id=$1", [
            g.id,
          ])
        ).rowCount,
        mode === "ranked" ? 2 : 0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT * FROM match_participants WHERE match_id=$1 AND user_id IS NOT NULL",
            [g.id],
          )
        ).rowCount,
        2,
      );
    }
  }
});

test("failed imports roll back, retry safely, and skipping closes the signup opportunity", async () => {
  const source = await createGuest(1420);
  const signup = async (guestId: string) => {
    const token = await prepareGuestImport(guestId);
    const r = await request("/api/auth/sign-up/email", {
      name: "Import retry",
      email: `retry-${randomUUID()}@example.invalid`,
      password: "retry-import-password",
      guestImportIntent: token,
    });
    assert.equal(r.status, 200, await r.clone().text());
    return {
      user: (await r.json()).user,
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    };
  };
  const target = await signup(source.id);
  await db.query(
    `CREATE OR REPLACE FUNCTION mathrix_test_import_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${source.id}' THEN RAISE EXCEPTION 'test import failure'; END IF; RETURN OLD; END; $$`,
  );
  await db.query(
    'CREATE TRIGGER mathrix_test_import_failure BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION mathrix_test_import_failure()',
  );
  try {
    assert.equal(
      (await request("/api/guest/import", {}, target.cookie)).status,
      400,
    );
    assert.equal(await pendingGuestImport(target.user.id), source.id);
    assert.equal(
      (
        await db.query("SELECT rating FROM player_stats WHERE user_id=$1", [
          source.id,
        ])
      ).rows[0].rating,
      1420,
    );
    assert.equal(
      (
        await db.query("SELECT user_id FROM player_stats WHERE user_id=$1", [
          target.user.id,
        ])
      ).rowCount,
      0,
    );
  } finally {
    await db.query('DROP TRIGGER mathrix_test_import_failure ON "user"');
    await db.query("DROP FUNCTION mathrix_test_import_failure()");
  }
  assert.equal(
    (await request("/api/guest/import", {}, target.cookie)).status,
    200,
  );
  assert.equal(
    (
      await db.query("SELECT rating FROM player_stats WHERE user_id=$1", [
        target.user.id,
      ])
    ).rows[0].rating,
    1420,
  );
  const separate = await createGuest(1111),
    skipped = await signup(separate.id);
  assert.equal(
    (await request("/api/guest/import", { skip: true }, skipped.cookie)).status,
    200,
  );
  assert.equal(await pendingGuestImport(skipped.user.id), null);
  assert.equal(
    (await request("/api/guest/import", {}, skipped.cookie)).status,
    200,
  );
  assert.equal(
    (
      await db.query("SELECT rating FROM player_stats WHERE user_id=$1", [
        separate.id,
      ])
    ).rows[0].rating,
    1111,
  );
  assert.notEqual(
    (
      await request(
        "/api/guest/import-intent",
        { code: guestCode(separate.id) },
        skipped.cookie,
      )
    ).status,
    200,
  );
});

test("guest codes restore progress and signup imports it once without losing history", async () => {
  const g = await createGuest(1000),
    opponent = await createGuest(1000);
  const code = guestCode(g.id);
  const cookieOf = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  const restored = await request("/api/guest/restore", { code });
  assert.equal(restored.status, 200);
  const cookie = cookieOf(restored);
  assert.equal((await restored.json()).id, g.id);
  assert.ok(!cookie.includes(g.id));
  assert.equal(
    (await request("/api/guest/code", undefined, cookie)).status,
    200,
  );
  assert.notEqual(
    (await request("/api/guest/restore", { code: code.slice(0, -1) + "!" }))
      .status,
    200,
  );
  const match = createGame(randomUUID(), 22, [g, opponent]);
  startGame(match, Date.now() - 100);
  match.players[0].matrix[0][0] += 7;
  finishGame(match, Date.now());
  await persistMatch(match);
  const before = await (
    await request("/api/profile", undefined, cookie)
  ).json();
  const second = await request("/api/guest/restore", { code });
  assert.equal(
    (await (await request("/api/profile", undefined, cookieOf(second))).json())
      .rating,
    before.rating,
  );
  const prep = await request("/api/guest/import-intent", { code }, cookie);
  assert.equal(prep.status, 200);
  const { token } = await prep.json();
  const signup = await request("/api/auth/sign-up/email", {
    name: "Imported player",
    email: `import-${randomUUID()}@example.invalid`,
    password: "guest-import-test-password",
    guestImportIntent: token,
  });
  assert.equal(signup.status, 200, await signup.clone().text());
  const newCookie = cookieOf(signup),
    user = (await signup.json()).user;
  assert.equal(
    (await (await request("/api/me", undefined, newCookie)).json())
      .importPending,
    true,
  );
  assert.equal(
    (await request("/api/profile", undefined, newCookie)).status,
    409,
  );
  const attempts = await Promise.all([
    request("/api/guest/import", {}, newCookie),
    request("/api/guest/import", {}, newCookie),
  ]);
  assert.ok(attempts.some((r) => r.status === 200));
  assert.equal((await request("/api/guest/import", {}, newCookie)).status, 200);
  const profile = await (
    await request("/api/profile", undefined, newCookie)
  ).json();
  assert.equal(profile.name, user.username);
  for (const key of [
    "rating",
    "played",
    "wins",
    "losses",
    "draws",
    "streak",
    "highest_score",
    "total_score",
  ])
    assert.equal(profile[key], before[key]);
  assert.equal(profile.history[0].id, match.id);
  assert.equal(
    (await db.query('SELECT id FROM "user" WHERE id=$1', [g.id])).rowCount,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM rating_history WHERE user_id=$1", [user.id]))
      .rowCount,
    1,
  );
  assert.equal(
    (await request(`/api/matches/${match.id}`, undefined, newCookie)).status,
    200,
  );
  assert.notEqual((await request("/api/guest/restore", { code })).status, 200);
  assert.equal(
    await (await request("/api/me", undefined, cookie)).json(),
    null,
  );
  assert.notEqual(
    (
      await request(
        "/api/guest/import",
        { code: guestCode(opponent.id) },
        newCookie,
      )
    ).status,
    200,
  );
});
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
  const cached = logins.get(email);
  if (
    cached &&
    (await (await request("/api/me", undefined, cached)).json())?.id
  )
    return cached;
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
  let r = await request("/api/guest", {});
  if (r.status === 429) {
    await delay(60000);
    r = await request("/api/guest", {});
  }
  assert.equal(r.status, 200, await r.clone().text());
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
test("sessions persist and renew browser cookies only on browser HTTP requests", async () => {
  const account = {
    email: `session-${randomUUID()}@example.invalid`,
    name: "Session renewal",
    password: "session-test-password-123",
  };
  let signup = await request("/api/auth/sign-up/email", account);
  if (signup.status === 429 && signup.headers.has("x-retry-after")) {
    await delay(Number(signup.headers.get("x-retry-after")) * 1000 + 100);
    signup = await request("/api/auth/sign-up/email", account);
  }
  assert.equal(signup.status, 200);
  const cookies = signup.headers.getSetCookie();
  assert.ok(cookies.some((c) => /session_token=.*Max-Age=604800/i.test(c)));
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const { user } = await signup.json();
  const age = async () => {
    const expiresAt = new Date(Date.now() + 5 * 86400000);
    await db.query('UPDATE session SET "expiresAt"=$1 WHERE "userId"=$2', [
      expiresAt,
      user.id,
    ]);
    return expiresAt;
  };
  const expiry = async () =>
    (
      await db.query('SELECT "expiresAt" FROM session WHERE "userId"=$1', [
        user.id,
      ])
    ).rows[0].expiresAt as Date;
  const aged = await age();
  const internal = await request("/api/me?refresh=false", undefined, cookie);
  assert.equal((await internal.json()).id, user.id);
  assert.ok(
    !internal.headers.getSetCookie().some((c) => c.includes("session_token=")),
  );
  assert.equal((await expiry()).getTime(), aged.getTime());
  const s = socket(cookie);
  try {
    s.connect();
    await once(s, "connect");
    const queued = once(s, "queued");
    s.emit("queue", { consent: false });
    await queued;
    const cancelled = once(s, "cancelled");
    s.emit("cancel");
    await cancelled;
    assert.equal((await expiry()).getTime(), aged.getTime());
  } finally {
    s.disconnect();
  }
  for (const path of ["/api/me", "/api/guest"]) {
    await age();
    const renewed = await request(
      path,
      path === "/api/guest" ? {} : undefined,
      cookie,
    );
    const player = await renewed.json();
    assert.equal(player.id, user.id);
    assert.equal(player.registered, true);
    assert.equal(renewed.headers.get("cache-control"), "no-store");
    const setCookies = renewed.headers.getSetCookie();
    assert.ok(
      setCookies.some((c) => /session_token=.*Max-Age=604800/i.test(c)),
    );
    assert.ok(setCookies.some((c) => c.startsWith("mathrix_browser=")));
    assert.ok((await expiry()).getTime() > Date.now() + 6 * 86400000);
    const fresh = await request("/api/me", undefined, cookie);
    assert.ok(
      !fresh.headers.getSetCookie().some((c) => c.includes("session_token=")),
    );
  }
  await db.query(
    'UPDATE session SET "expiresAt"=now() - interval \'1 second\' WHERE "userId"=$1',
    [user.id],
  );
  const expired = await request("/api/me", undefined, cookie);
  assert.equal(await expired.json(), null);
  assert.ok(
    expired.headers
      .getSetCookie()
      .some((c) => /session_token=.*Max-Age=0/i.test(c)),
  );
  const guestResponse = await request("/api/guest", {});
  assert.equal((await guestResponse.json()).registered, false);
  for (const name of ["mathrix_browser", "mathrix_guest"])
    assert.ok(
      guestResponse.headers
        .getSetCookie()
        .some((c) => c.startsWith(`${name}=`)),
    );
});
test("admin design uploads preserve bytes and enforce authorization, origin and filenames", async () => {
  const cookie = await login("admin1@mathrix.app");
  const filename = `design-${randomUUID()}.pdf`;
  const bytes = Buffer.concat([
    Buffer.from("%PDF-1.4\n%%EOF\n"),
    Buffer.alloc(40 * 1024),
  ]);
  const form = () => {
    const data = new FormData();
    data.append(
      "file",
      new File([bytes], filename, { type: "application/pdf" }),
    );
    data.append("description", "Homepage design reference");
    return data;
  };
  const path = "/api/admin/design-files";
  const download = `${path}/download?filename=${encodeURIComponent(filename)}`;
  for (const deniedCookie of ["", await guest()]) {
    assert.equal((await request(path, undefined, deniedCookie)).status, 403);
    assert.equal(
      (await request(download, undefined, deniedCookie)).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + path, {
          method: "POST",
          headers: { Origin: origin, Cookie: deniedCookie },
          body: form(),
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await fetch(base + path, {
        method: "POST",
        headers: { Cookie: cookie },
        body: form(),
      })
    ).status,
    403,
  );
  const uploaded = await fetch(base + path, {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
    body: form(),
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const metadata = await uploaded.json();
  assert.equal(metadata.filename, filename);
  assert.equal(metadata.description, "Homepage design reference");
  assert.equal(metadata.size, bytes.length);
  const listed = await (await request(path, undefined, cookie)).json();
  assert.ok(
    listed.some((file: { filename: string }) => file.filename === filename),
  );
  const downloaded = await request(download, undefined, cookie);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("content-type"), "application/pdf");
  assert.match(downloaded.headers.get("content-disposition")!, /^attachment;/);
  assert.match(downloaded.headers.get("cache-control")!, /no-store/);
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  assert.equal(
    (
      await fetch(base + path, {
        method: "POST",
        headers: { Origin: origin, Cookie: cookie },
        body: form(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `${path}/download?filename=..%2Fsecret.png`,
        undefined,
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `${path}/download?filename=missing-${randomUUID()}.png`,
        undefined,
        cookie,
      )
    ).status,
    404,
  );
});
test("real websocket guests match, synchronize, reject stale/out-of-turn actions and cancel queue", async () => {
  const cookieA = await guest();
  const playerA = await (await request("/api/me", undefined, cookieA)).json();
  const cookieB = await guest();
  const playerB = await (await request("/api/me", undefined, cookieB)).json();
  await db.query(
    "UPDATE player_stats SET rating=100000,played=7 WHERE user_id=$1",
    [playerA.id],
  );
  await db.query("DELETE FROM player_stats WHERE user_id=$1", [playerB.id]);
  const a = socket(cookieA),
    b = socket(cookieB);
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
    const statsA = ra.game.players.find((p) => p.id === playerA.id)!;
    const statsB = ra.game.players.find((p) => p.id === playerB.id)!;
    const rankings = await (await request("/api/leaderboard")).json();
    assert.equal(
      statsA.rank,
      Number(rankings.find((p: { id: string }) => p.id === playerA.id).rank),
    );
    assert.equal(statsA.played, 7);
    assert.equal(statsB.rank, null);
    assert.equal(statsB.played, 0);
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
    assert.deepEqual(
      state.game.players.map(({ rank, played }) => ({ rank, played })),
      ra.game.players.map(({ rank, played }) => ({ rank, played })),
    );
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
test("admin settings reject invalid weights and unsafe campaigns", async () => {
  const cookie = await login("admin2@mathrix.app");
  const r = await request("/api/admin/settings", undefined, cookie);
  const settings = await r.json();
  for (const axis of ["maxRows", "maxColumns"]) {
    const invalid = structuredClone(settings);
    invalid.balance[axis] = 6;
    assert.equal(
      (await request("/api/admin/settings", invalid, cookie)).status,
      400,
    );
  }
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

test("a registered host invites a guest by code over real sockets", async () => {
  const a = socket(await login("admin2@mathrix.app"));
  const b = socket(await guest());
  try {
    const initialRoom = once(a, "room_waiting");
    a.connect();
    b.connect();
    await Promise.all([once(a, "connect"), once(b, "connect"), initialRoom]);
    const created = once<{ code: string; expiresAt: number }>(
      a,
      "room_waiting",
    );
    a.emit("room_create", {});
    const room = await created;
    assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
    const ra = once<{ game: PublicGame }>(a, "reserved");
    const rb = once<{ game: PublicGame }>(b, "reserved");
    b.emit("room_join", { code: room.code.toLowerCase() });
    const [host, guest] = await Promise.all([ra, rb]);
    assert.equal(host.game.id, guest.game.id);
    assert.deepEqual(
      host.game.players.map((p) => p.registered),
      [true, false],
    );
    const rejected = once<string>(a, "action_error");
    a.emit("queue", {});
    assert.match(await rejected, /Already in a match/);
  } finally {
    a.disconnect();
    b.disconnect();
  }
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
    const config = await (
      await request(
        "/api/ad/config",
        undefined,
        String(a.io.opts.extraHeaders!.Cookie),
      )
    ).json();
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
  const forged = await request("/api/auth/sign-up/email", {
    email,
    name: "Security-Test",
    password: "secure-test-password-123",
    guestImportId: "forged-import",
  });
  assert.equal(forged.status, 400);
  const r = await request("/api/auth/sign-up/email", {
    email,
    name: "Security-Test",
    password: "secure-test-password-123",
    role: "ADMIN",
    isGuest: true,
  });
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  const me = await (await request("/api/me", undefined, cookie)).json();
  assert.equal(me.role, "USER");
  assert.equal(me.registered, true);
  assert.equal(me.importPending, false);
  for (const path of [
    "/api/admin/design-files",
    "/api/admin/design-files/download?filename=anything.png",
    "/api/admin/analytics",
  ])
    assert.equal((await request(path, undefined, cookie)).status, 403);
  assert.equal(
    (await request("/api/admin/design-files", {}, cookie)).status,
    403,
  );
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
test("AI history is idempotent, supports accountless opponents, and never changes statistics", async () => {
  const registeredCookie = await login("admin2@mathrix.app");
  const outsiderCookie = await guest();
  for (const cookie of [await guest(), registeredCookie]) {
    const human = await (await request("/api/me", undefined, cookie)).json();
    const profile = async () =>
      (await request("/api/profile", undefined, cookie)).json();
    await profile();
    const stats = async () =>
      (
        await db.query("SELECT * FROM player_stats WHERE user_id=$1", [
          human.id,
        ])
      ).rows;
    const before = await stats();
    for (const reason of ["clock", "disconnect", "server_shutdown"]) {
      const id = randomUUID();
      const g = createGame(
        id,
        42,
        [human, { id: `ai:${id}`, name: "Mathrix AI", registered: false }],
        undefined,
        Date.now() - 200,
        "ai",
        2,
      );
      startGame(g, Date.now() - 100);
      finishGame(
        g,
        Date.now(),
        reason,
        reason === "disconnect" ? 0 : undefined,
      );
      await persistMatch(g);
      await persistMatch(g);
      assert.deepEqual(await stats(), before);
      assert.equal(
        (await db.query("SELECT 1 FROM rating_history WHERE match_id=$1", [id]))
          .rowCount,
        0,
      );
      assert.equal(
        (await db.query('SELECT 1 FROM "user" WHERE id=$1', [g.players[1].id]))
          .rowCount,
        0,
      );
      const history = (await profile()).history.filter(
        (m: { id: string }) => m.id === id,
      );
      assert.equal(history.length, 1);
      assert.equal(history[0].mode, "ai");
      assert.equal(history[0].speed, 2);
      assert.equal(history[0].rated, false);
      assert.equal(history[0].opponent, "Mathrix AI");
      const details = await (
        await request(`/api/matches/${id}`, undefined, cookie)
      ).json();
      assert.equal(details.participants.length, 2);
      assert.equal(details.participants[0].user_id, human.id);
      assert.equal(details.participants[1].user_id, null);
      assert.equal(details.participants[1].rating_before, null);
      assert.equal(details.participants[1].rating_after, null);
      assert.equal(
        (await request(`/api/matches/${id}`, undefined, outsiderCookie)).status,
        403,
      );
    }
  }
});

test("AI reservations apply H5 waits and premium exemption only to the human", async () => {
  const adminCookie = await login("admin1@mathrix.app");
  const original = await (
    await request("/api/admin/settings", undefined, adminCookie)
  ).json();
  const config = structuredClone(original);
  Object.assign(config.ads, {
    enabled: true,
    pregame: true,
    guests: true,
    registered: true,
    admins: true,
    mode: "EXTERNAL_PROVIDER",
    everyN: 1,
    cooldownMinutes: 0,
    pregameWaitMs: 15000,
    testMode: true,
  });
  const premiumCookie = await login("admin2@mathrix.app");
  const premium = await (
    await request("/api/me", undefined, premiumCookie)
  ).json();
  const previousBilling = (
    await db.query("SELECT * FROM billing WHERE user_id=$1", [premium.id])
  ).rows[0];
  assert.equal(previousBilling, undefined);
  const sockets: Socket[] = [];
  try {
    assert.equal(
      (await request("/api/admin/settings", config, adminCookie)).status,
      200,
    );
    await db.query(
      "INSERT INTO billing(user_id,status,paid_until) VALUES($1,'active',now()+interval '1 hour')",
      [premium.id],
    );
    for (const [cookie, isPremium] of [
      [await guest(), false],
      [premiumCookie, true],
    ] as const) {
      const s = socket(cookie);
      sockets.push(s);
      s.connect();
      await once(s, "connect");
      const reserved = once<{
        game: PublicGame;
        ad: AdExperience;
        readyAt: number;
        readyDeadline: number;
      }>(s, "reserved");
      s.emit("ai_start", { speed: 1.5 });
      const first = await reserved;
      assert.equal(first.game.mode, "ai");
      assert.deepEqual(first.game.ready, [false, true]);
      assert.equal(first.ad.kind, isPremium ? "none" : "h5");
      if (isPremium) {
        assert.equal(first.ad.durationMs, 0);
        const countdown = once<PublicGame>(s, "update");
        s.emit("ready", { matchId: first.game.id });
        assert.equal((await countdown).status, "countdown");
      } else {
        const rejected = once<string>(s, "action_error");
        s.emit("ready", { matchId: first.game.id });
        assert.match(await rejected, /still running/);
        s.disconnect();
        const resumed = once<typeof first>(s, "reserved");
        s.connect();
        const restored = await resumed;
        assert.equal(restored.game.id, first.game.id);
        assert.equal(restored.readyAt, first.readyAt);
        assert.equal(restored.readyDeadline, first.readyDeadline);
      }
    }
  } finally {
    sockets.forEach((s) => s.disconnect());
    await db.query("DELETE FROM billing WHERE user_id=$1", [premium.id]);
    await request("/api/admin/settings", original, adminCookie);
  }
});

test("legacy guest completions retain their original persistence rules", async () => {
  const registered = (
    await db.query('SELECT id,name FROM "user" WHERE email=$1', [
      "admin2@mathrix.app",
    ])
  ).rows[0];
  for (const mixed of [false, true]) {
    const guests = [0, 1].map((i) => ({
      id: randomUUID(),
      name: `Guest-${i}`,
      registered: false,
    }));
    const players = mixed
      ? [{ ...registered, registered: true }, guests[1]]
      : guests;
    const g = createGame(
      randomUUID(),
      123,
      players,
      undefined,
      Date.now(),
      "quick",
    );
    g.config.rateGuests = true;
    startGame(g, Date.now() - 100);
    finishGame(g, Date.now(), "clock");
    await persistMatch(g);
    await persistMatch(g);
    const guestIds = guests.map((p) => p.id);
    assert.equal(
      (
        await db.query(
          "SELECT user_id FROM player_stats WHERE user_id=ANY($1::text[])",
          [guestIds],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT user_id FROM rating_history WHERE user_id=ANY($1::text[])",
          [guestIds],
        )
      ).rowCount,
      0,
    );
    const participants = (
      await db.query(
        "SELECT user_id,rating_before,rating_after FROM match_participants WHERE match_id=$1 ORDER BY seat",
        [g.id],
      )
    ).rows;
    assert.equal(participants.length, 2);
    for (const p of participants.slice(mixed ? 1 : 0))
      assert.deepEqual(p, {
        user_id: null,
        rating_before: null,
        rating_after: null,
      });
    assert.equal(
      (await db.query("SELECT rated FROM matches WHERE id=$1", [g.id])).rows[0]
        .rated,
      mixed,
    );
    if (mixed)
      assert.equal(
        (
          await db.query(
            "SELECT user_id FROM rating_history WHERE match_id=$1",
            [g.id],
          )
        ).rowCount,
        1,
      );
  }
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

test("analytics authorizes admins, aggregates distributions across instances, and filters played matches", async () => {
  const { readHistory } = await import("../server/analytics");
  const { Collector } = await import("../server/metrics");
  const { defaultBalance } = await import("../lib/config");
  const cookie = await login("admin1@mathrix.app");
  assert.equal((await request("/api/admin/analytics")).status, 403);
  assert.equal(
    (await request("/api/admin/analytics?range=forever", undefined, cookie))
      .status,
    400,
  );
  const start = Date.now();
  const instances = [randomUUID(), randomUUID()];
  const games: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const c = new Collector(() => {});
      for (let n = 0; n < (i ? 1 : 99); n++)
        c.record("test_latency_ms", i ? 2000 : 1, true);
      await db.query(
        "INSERT INTO performance_minutes(bucket_start,instance_id,metrics) VALUES($1,$2,$3)",
        [new Date(start - 600000), instances[i], c.data],
      );
    }
    await db.query(
      "INSERT INTO performance_minutes(bucket_start,instance_id,metrics) VALUES($1,$2,$3)",
      [
        new Date(start - 31 * 86400000),
        instances[0],
        { test_latency_ms: { count: 10000, sum: 10000, max: 1 } },
      ],
    );
    const baseline = await readHistory("1h", start);
    assert.equal(baseline.summary.test_latency_ms.count, 100);
    assert.equal(baseline.summary.test_latency_ms.p95, 1);
    assert.equal(baseline.summary.test_latency_ms.mean, 20.99);
    for (const reason of [
      "clock",
      "disconnect",
      "server_shutdown",
      "pregame",
    ]) {
      const g = createGame(
        randomUUID(),
        42,
        [
          { id: randomUUID(), name: "Analytics A", registered: false },
          { id: randomUUID(), name: "Analytics B", registered: false },
        ],
        defaultBalance,
        start - 10000,
        "quick",
      );
      if (reason !== "pregame") startGame(g, start - 5000);
      finishGame(g, start - 1000, reason);
      await persistMatch(g);
      games.push(g.id);
    }
    const updated = await readHistory("1h", start);
    assert.equal(updated.gameplay.matches - baseline.gameplay.matches, 3);
    assert.equal(updated.gameplay.normal - baseline.gameplay.normal, 1);
    assert.equal(
      updated.gameplay.disconnected - baseline.gameplay.disconnected,
      1,
    );
    assert.equal(
      updated.gameplay.interrupted - baseline.gameplay.interrupted,
      1,
    );
    assert.equal(updated.gameplay.players, baseline.gameplay.players);
    assert.equal(
      updated.gameplay.anonymousSeats - baseline.gameplay.anonymousSeats,
      6,
    );
    assert.ok(updated.series.length <= 61);
    const result = await request(
      "/api/admin/analytics?range=30d",
      undefined,
      cookie,
    );
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal(result.headers.get("cache-control"), "no-store");
    const data = await result.json();
    assert.equal(data.range, "30d");
    assert.equal(data.summary.test_latency_ms.count, 100);
    assert.ok(data.live.startedAt > 0);
    assert.ok(data.series.length <= 181);
    assert.equal(JSON.stringify(data).includes("Analytics A"), false);
    // History includes persisted rows from both process instances.
    assert.equal(
      (await readHistory("7d", start)).summary.test_latency_ms.count,
      100,
    );
  } finally {
    await db.query(
      "DELETE FROM performance_minutes WHERE instance_id=ANY($1::uuid[])",
      [instances],
    );
    await db.query("DELETE FROM matches WHERE id=ANY($1::text[])", [games]);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeURL, parseCookies, requestIP, validOrigin } from "../lib/security";
import { createGame, startGame, finishGame } from "../lib/engine";
test("campaign links reject script, data, private and credential URLs", () => {
  for (const u of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://localhost",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "https://a:b@example.com",
    "http://172.16.0.1",
  ])
    assert.throws(() => safeURL(u));
  assert.equal(safeURL("https://mathrix.app/play"), "https://mathrix.app/play");
  assert.equal(safeURL("", true), "");
});
test("cookies parse embedded equals and Origin check is exact", () => {
  assert.deepEqual(parseCookies("a=abc=def; b=123"), {
    a: "abc=def",
    b: "123",
  });
  assert.equal(validOrigin("https://mathrix.app", "https://mathrix.app"), true);
  assert.equal(
    validOrigin("https://mathrix.app.evil.test", "https://mathrix.app"),
    false,
  );
  assert.equal(validOrigin(undefined, "https://mathrix.app"), false);
});

test("forwarded client IPs require a loopback peer and exactly one valid address", () => {
  for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
    for (const ip of ["203.0.113.7", "2001:db8::7"])
      assert.equal(
        requestIP({
          headers: { "x-forwarded-for": ` ${ip} ` },
          socket: { remoteAddress: peer },
        }),
        ip,
      );
  for (const forwarded of [
    undefined,
    "",
    "bad",
    "203.0.113.7, 203.0.113.8",
    ["203.0.113.7"],
  ])
    assert.equal(
      requestIP({
        headers: { "x-forwarded-for": forwarded },
        socket: { remoteAddress: "127.0.0.1" },
      }),
      "127.0.0.1",
    );
  assert.equal(
    requestIP({
      headers: { "x-forwarded-for": "203.0.113.7" },
      socket: { remoteAddress: "198.51.100.9" },
    }),
    "198.51.100.9",
  );
  assert.equal(requestIP({ headers: {}, socket: {} }), "unknown");
});

test("admin server rendering forwards one valid client IP with its uncached session check", async (t) => {
  let incoming = new Headers();
  let response: Response | Error;
  let captured: RequestInit | undefined;
  t.mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ toString: () => "session=test-token" }),
      headers: async () => incoming,
    },
  });
  t.mock.module("react", {
    namedExports: { cache: (fn: () => Promise<boolean>) => fn },
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: RequestInfo | URL, options?: RequestInit) => {
      assert.equal(
        String(_url),
        `${process.env.GAME_INTERNAL_URL || "http://127.0.0.1:3001"}/api/me?refresh=false`,
      );
      captured = options;
      if (response instanceof Error) throw response;
      return response;
    },
  );
  const { isAdministrator } = await import("../lib/admin-access");
  for (const [ip, expectedIP, role, status, failed] of [
    [" 203.0.113.7 ", "203.0.113.7", "ADMIN", 200, false],
    ["2001:db8::7", "2001:db8::7", "USER", 200, false],
    ["203.0.113.7, 203.0.113.8", null, "ADMIN", 200, false],
    ["invalid", null, "USER", 200, false],
    [undefined, null, "ADMIN", 200, false],
    ["203.0.113.7", "203.0.113.7", "ADMIN", 403, false],
    ["203.0.113.7", "203.0.113.7", "ADMIN", 200, true],
  ] as const) {
    incoming = new Headers(ip === undefined ? {} : { "x-forwarded-for": ip });
    response = failed
      ? Error("Backend unavailable")
      : new Response(JSON.stringify({ role }), { status });
    assert.equal(
      await isAdministrator(),
      !failed && status === 200 && role === "ADMIN",
    );
    const forwarded = new Headers(captured?.headers);
    assert.equal(forwarded.get("x-forwarded-for"), expectedIP);
    assert.equal(forwarded.get("cookie"), "session=test-token");
    assert.equal(captured?.cache, "no-store");
  }
});

test("legacy matches only write personal stats and ratings for registered players", async (t) => {
  const queries: { sql: string; values: unknown[] }[] = [];
  t.mock.module("../server/db.ts", {
    namedExports: {
      db: {
        connect: async () => ({
          release() {},
          async query(sql: string, values: unknown[] = []) {
            queries.push({ sql, values });
            return { rowCount: 1, rows: [] };
          },
        }),
      },
    },
  });
  const { persistMatch } = await import("../server/persistence");
  for (const registered of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    for (const rateGuests of [false, true]) {
      queries.length = 0;
      const players = registered.map((value, i) => ({
        id: `player-${i}`,
        name: `Player ${i}`,
        registered: value,
      }));
      const game = createGame(
        "stats-check",
        42,
        players,
        undefined,
        Date.now(),
        "quick",
      );
      game.config.rateGuests = rateGuests;
      startGame(game, 1000);
      finishGame(game, 2000);
      await persistMatch(game);
      const rated =
        registered.every(Boolean) || (rateGuests && registered.some(Boolean));
      assert.equal(
        queries.find((q) => q.sql.startsWith("INSERT INTO matches"))!.values[5],
        rated,
      );
      const participants = queries.filter((q) =>
        q.sql.startsWith("INSERT INTO match_participants"),
      );
      assert.equal(participants.length, 2);
      for (const [i, p] of players.entries()) {
        const stats = queries.filter(
          (q) =>
            /^(INSERT INTO player_stats|UPDATE player_stats)/.test(q.sql) &&
            q.values[0] === p.id,
        );
        const ratings = queries.filter(
          (q) =>
            q.sql.startsWith("INSERT INTO rating_history") &&
            q.values[0] === p.id,
        );
        assert.equal(stats.length, p.registered ? 2 : 0);
        assert.equal(ratings.length, p.registered && rated ? 1 : 0);
        assert.equal(participants[i].values[2], p.registered ? p.id : null);
        if (!p.registered)
          assert.deepEqual(participants[i].values.slice(6), [null, null]);
      }
    }
  }
});

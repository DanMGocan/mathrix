import { test } from "node:test";
import assert from "node:assert/strict";
import { safeURL, parseCookies, validOrigin } from "../lib/security";
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

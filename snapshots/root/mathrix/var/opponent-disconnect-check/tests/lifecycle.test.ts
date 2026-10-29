import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import * as http from "node:http";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { defaultBalance, defaultAds } from "../lib/config";
import {
  createGame,
  startGame,
  finishGame,
  type Game,
  type PublicGame,
} from "../lib/engine";
import type { Identity } from "../server/ads";

test("server retries recovered saves, prevents duplicate matches and restores completed results", async (t) => {
  const spool = await mkdtemp(join(tmpdir(), "mathrix-lifecycle-"));
  const previousSpool = process.env.STATE_DIR;
  process.env.STATE_DIR = spool;
  const signals = ["SIGTERM", "SIGINT"] as const;
  const listeners = signals.map((signal) => process.listeners(signal));
  t.after(async () => {
    if (previousSpool === undefined) delete process.env.STATE_DIR;
    else process.env.STATE_DIR = previousSpool;
    signals.forEach((signal, i) => {
      for (const listener of process.listeners(signal))
        if (!listeners[i].includes(listener)) process.off(signal, listener);
    });
    await rm(spool, { recursive: true, force: true });
  });
  t.mock.timers.enable({
    apis: ["Date", "setInterval", "setTimeout"],
    now: 1000,
  });
  const identities = new Map<string, Identity>();
  const io = Object.assign(new EventEmitter(), { use() {}, close() {} });
  const deferred: ((allowed: boolean) => void)[] = [];
  let pauseQueue = false;
  let pauseRooms = false;
  let allowRooms = true;
  const attempts = new Map<string, number>();
  let pendingSave: Promise<void> | undefined;
  let savingGame: Game | undefined;
  const recovered = createGame(
    randomUUID(),
    42,
    [
      { id: "old-a", name: "A", registered: false },
      { id: "old-b", name: "B", registered: false },
    ],
    defaultBalance,
    1,
    "quick",
  );
  startGame(recovered, 1);
  finishGame(recovered, 500);
  await mkdir(join(spool, "completed"));
  const recoveredPath = join(spool, "completed", `${recovered.id}.json`);
  await writeFile(recoveredPath, JSON.stringify(recovered));

  t.mock.module("node:http", {
    namedExports: {
      Agent: http.Agent,
      createServer: () => ({
        listen(_port: number, _host: string, ready: () => void) {
          ready();
        },
        close() {},
      }),
    },
  });
  t.mock.module("socket.io", {
    namedExports: {
      Server: function () {
        return io;
      },
    },
  });
  t.mock.module("../server/auth.ts", {
    namedExports: {
      auth: {
        api: {
          getSession: async () => ({ response: null, headers: new Headers() }),
        },
      },
    },
  });
  t.mock.module("../server/db.ts", {
    namedExports: {
      db: {
        query: async (sql: string, values?: string[]) => ({
          rows: sql.includes('FROM "user"')
            ? identities.has(values![0])
              ? [identities.get(values![0])]
              : []
            : [
                {
                  key: "balance",
                  value: { ...defaultBalance, matchMs: 10000 },
                },
                { key: "ads", value: { ...defaultAds, enabled: false } },
              ],
        }),
      },
      redis: {
        del: async () => {},
        set: async () => {},
        get: async (key: string) => key.slice("guest-session:".length, -7),
      },
      connectRedis: async () => {},
      rateLimit: async (key: string) => {
        if (
          (pauseQueue && key.startsWith("queue:")) ||
          (pauseRooms && key.startsWith("room:"))
        )
          return new Promise<boolean>((resolve) => deferred.push(resolve));
        return !key.startsWith("room:") || allowRooms;
      },
    },
  });
  t.mock.module("../server/persistence.ts", {
    namedExports: {
      persistMatch: async (g: Game) => {
        const count = (attempts.get(g.id) ?? 0) + 1;
        attempts.set(g.id, count);
        if (g.id === recovered.id && count === 1)
          throw Error("Temporary write failure");
        if (g.id !== recovered.id) {
          savingGame = g;
          await pendingSave;
        }
      },
    },
  });
  await import("../server/index");
  const { metrics } = await import("../server/metrics");

  async function until(check: () => boolean | Promise<boolean>) {
    const deadline = performance.now() + 3000;
    while (!(await check()) && performance.now() < deadline)
      await setImmediate();
    assert.ok(await check(), "Expected asynchronous operation to complete");
  }
  function connect(player?: Identity) {
    player ??= {
      id: randomUUID(),
      name: "Guest",
      registered: false,
      role: "GUEST",
    };
    identities.set(player.id, player);
    const handlers = new Map<
      string,
      (data?: unknown) => Promise<void> | void
    >();
    const emitted: { name: string; data: unknown }[] = [];
    const socket = {
      id: randomUUID(),
      data: { player },
      connected: true,
      request: {
        headers: { cookie: `mathrix_guest=${player.id}1234567` },
        socket: { remoteAddress: "127.0.0.1" },
      },
      on(name: string, fn: (data?: unknown) => Promise<void> | void) {
        handlers.set(name, fn);
      },
      emit(name: string, data: unknown) {
        emitted.push({ name, data: structuredClone(data) });
      },
      disconnect() {
        socket.connected = false;
        void handlers.get("disconnect")?.();
      },
      receive(name: string, data?: unknown) {
        return handlers.get(name)!(data);
      },
      messages(name: string) {
        return emitted.filter((e) => e.name === name).map((e) => e.data);
      },
    };
    io.emit("connection", socket);
    return socket;
  }
  await t.test(
    "failed startup completion retries after five seconds",
    async () => {
      assert.equal(attempts.get(recovered.id), 1);
      assert.equal(metrics.collector.data.save_failures.count, 1);
      assert.equal(
        JSON.parse(await readFile(recoveredPath, "utf8")).id,
        recovered.id,
      );
      t.mock.timers.tick(4999);
      assert.equal(attempts.get(recovered.id), 1);
      t.mock.timers.tick(1);
      await until(() => attempts.get(recovered.id) === 2);
      // Wait for unlink after the database write succeeds.
      await until(() =>
        access(recoveredPath).then(
          () => false,
          () => true,
        ),
      );
      t.mock.timers.tick(5000);
      assert.equal(attempts.get(recovered.id), 2);
    },
  );

  await t.test(
    "ranked and each casual speed pair only compatible opponents",
    async () => {
      const ids: string[] = [];
      const players = Array.from({ length: 8 }, () => connect());
      const choices = [
        { mode: "ranked", speed: 1 },
        { mode: "casual", speed: 1.5 },
        { mode: "casual", speed: 2 },
        { mode: "casual", speed: 3 },
      ];
      for (let i = 0; i < 4; i++) {
        await players[i].receive("queue", choices[i]);
        assert.equal(players[i].messages("reserved").length, 0);
      }
      for (let i = 0; i < 4; i++) {
        await players[i + 4].receive("queue", choices[i]);
        const game = (
          players[i].messages("reserved").at(-1) as { game: PublicGame }
        ).game;
        ids.push(game.id);
        assert.equal(game.mode, choices[i].mode);
        assert.equal(game.speed, choices[i].speed);
        assert.deepEqual(
          game.players.map((p) => p.id),
          [players[i].data.player.id, players[i + 4].data.player.id],
        );
      }
      const invalid = connect();
      for (const option of [
        { mode: "ranked", speed: 2 },
        { mode: "casual", speed: 1 },
        { mode: "casual", speed: 4 },
      ])
        await invalid.receive("queue", option);
      assert.equal(invalid.messages("action_error").length, 3);
      for (const p of players) p.disconnect();
      t.mock.timers.tick(16000);
      await until(() => ids.every((id) => attempts.get(id) === 1));
    },
  );
  const a = connect(),
    b = connect(),
    c = connect();
  await t.test(
    "overlapping queue requests cannot put a player into two rooms",
    async () => {
      const entered = metrics.collector.data.queue_entered?.count ?? 0;
      const paired = metrics.collector.data.queue_wait_ms?.count ?? 0;
      await b.receive("queue", {});
      await b.receive("queue", {});
      t.mock.timers.tick(500);
      pauseQueue = true;
      const first = a.receive("queue", {}),
        second = a.receive("queue", {});
      await until(() => deferred.length === 2);
      deferred.shift()!(true);
      await first;
      deferred.shift()!(true);
      await second;
      pauseQueue = false;
      await c.receive("queue", {});
      assert.equal(a.messages("reserved").length, 1);
      assert.equal(b.messages("reserved").length, 1);
      assert.equal(c.messages("reserved").length, 0);
      assert.match(String(a.messages("action_error")[0]), /Already in a match/);
      assert.equal(metrics.collector.data.queue_entered.count - entered, 3);
      assert.equal(metrics.collector.data.queue_wait_ms.count - paired, 2);
      assert.ok(metrics.collector.data.queue_wait_ms.max >= 500);
    },
  );
  await t.test(
    "disconnect during queue rate limiting cannot leave a phantom opponent",
    async () => {
      const d = connect();
      pauseQueue = true;
      const pending = d.receive("queue", {});
      await until(() => deferred.length === 1);
      d.disconnect();
      deferred.shift()!(true);
      await pending;
      pauseQueue = false;
      assert.equal(c.messages("reserved").length, 0);
    },
  );
  await t.test(
    "disconnect snapshots survive refresh and reconnect clears both players' warnings",
    async () => {
      let host = connect(),
        opponent = connect();
      await host.receive("room_create", {});
      const { code } = host.messages("room_waiting").at(-1) as { code: string };
      await opponent.receive("room_join", { code });
      const { game } = host.messages("reserved").at(-1) as { game: PublicGame };
      assert.deepEqual(game.disconnectedAt, [null, null]);

      const awayAt = Date.now();
      opponent.disconnect();
      assert.deepEqual(
        (host.messages("update").at(-1) as PublicGame).disconnectedAt,
        [null, awayAt],
      );
      host.disconnect();
      host = connect(host.data.player);
      assert.deepEqual(
        (host.messages("reserved").at(-1) as { game: PublicGame }).game
          .disconnectedAt,
        [null, awayAt],
      );
      opponent = connect(opponent.data.player);
      assert.deepEqual(
        (host.messages("update").at(-1) as PublicGame).disconnectedAt,
        [null, null],
      );

      await host.receive("ready", { matchId: game.id });
      await opponent.receive("ready", { matchId: game.id });
      t.mock.timers.tick(3000);
      host.disconnect();
      const playing = opponent.messages("update").at(-1) as PublicGame;
      assert.equal(playing.status, "playing");
      assert.deepEqual(playing.disconnectedAt, [Date.now(), null]);
      host = connect(host.data.player);
      assert.deepEqual(
        (opponent.messages("update").at(-1) as PublicGame).disconnectedAt,
        [null, null],
      );
      host.disconnect();
      opponent.disconnect();
    },
  );
  await t.test(
    "reconnect recovers the result and acknowledges persistence only after saving",
    async () => {
      const { game } = a.messages("reserved")[0] as { game: PublicGame };
      await a.receive("ready", { matchId: game.id });
      await b.receive("ready", { matchId: game.id });
      t.mock.timers.tick(3000);
      b.disconnect();
      let release!: () => void;
      pendingSave = new Promise<void>((resolve) => {
        release = resolve;
      });
      t.mock.timers.tick(10000);
      await until(() => attempts.get(game.id) === 1);
      const history = structuredClone(savingGame!.events);
      const returned = connect(b.data.player);
      assert.equal(
        (returned.messages("reserved")[0] as { game: PublicGame }).game.status,
        "finished",
      );
      assert.equal(returned.messages("persisted").length, 0);
      assert.deepEqual(savingGame!.events, history);
      release();
      await until(() => returned.messages("persisted").length === 1);
      returned.disconnect();
      const saved = connect(b.data.player);
      assert.deepEqual(saved.messages("persisted"), [{ matchId: game.id }]);
      assert.equal(
        (saved.messages("reserved")[0] as { game: PublicGame }).game.status,
        "finished",
      );
      await saved.receive("queue", {});
      const next = saved.messages("reserved").at(-1) as { game: PublicGame };
      assert.notEqual(next.game.id, game.id);
      saved.disconnect();
      const active = connect(b.data.player);
      assert.equal(
        (active.messages("reserved")[0] as { game: PublicGame }).game.id,
        next.game.id,
      );
      assert.equal(active.messages("persisted").length, 0);
    },
  );
  type Invite = { code: string; expiresAt: number };
  const roomOf = (s: ReturnType<typeof connect>) =>
    s.messages("room_waiting").at(-1) as Invite;
  await t.test(
    "room ownership, validation, cancellation and public queue isolation",
    async () => {
      const host = connect(),
        other = connect(),
        queued = connect();
      await host.receive("room_create", {});
      const room = roomOf(host);
      assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
      assert.equal(room.expiresAt, Date.now() + 900000);
      await host.receive("room_create", {});
      assert.deepEqual(roomOf(host), room);
      await host.receive("room_join", { code: room.code });
      assert.match(String(host.messages("action_error").at(-1)), /own room/);
      await host.receive("queue", {});
      assert.match(
        String(host.messages("action_error").at(-1)),
        /Cancel your room/,
      );
      await queued.receive("queue", {});
      await queued.receive("room_create", {});
      assert.match(
        String(queued.messages("action_error").at(-1)),
        /Cancel your search/,
      );
      await queued.receive("room_join", { code: room.code });
      assert.match(
        String(queued.messages("action_error").at(-1)),
        /Cancel your search/,
      );
      await queued.receive("cancel");
      await other.receive("room_join", { code: "<script>" });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /six-character/,
      );
      await other.receive("room_cancel");
      assert.deepEqual(roomOf(host), room);
      await host.receive("room_cancel");
      await other.receive("room_join", { code: room.code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /unavailable/,
      );
      await host.receive("queue", {});
      assert.equal(host.messages("queued").length, 1);
      await host.receive("cancel");
    },
  );
  await t.test(
    "rooms reconnect with the same code and expire after grace or fifteen minutes",
    async () => {
      let host = connect();
      const other = connect();
      await host.receive("room_create", {});
      const room = roomOf(host);
      host.disconnect();
      await other.receive("room_join", { code: room.code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /host is reconnecting/,
      );
      t.mock.timers.tick(1000);
      host = connect(host.data.player);
      assert.deepEqual(roomOf(host), room);
      host.disconnect();
      t.mock.timers.tick(defaultBalance.reconnectMs);
      host = connect(host.data.player);
      assert.equal(roomOf(host), null);
      await other.receive("room_join", { code: room.code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /unavailable/,
      );
      await host.receive("room_create", {});
      const expiring = roomOf(host);
      // setTime also verifies that joins check expiration before the next sweep.
      t.mock.timers.setTime(expiring.expiresAt);
      await other.receive("room_join", { code: expiring.code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /unavailable/,
      );
      assert.match(
        String(
          (host.messages("room_closed").at(-1) as { message: string }).message,
        ),
        /expired/,
      );
    },
  );
  await t.test(
    "only one simultaneous join claims the code and uses normal readiness",
    async () => {
      const host = connect(),
        first = connect(),
        second = connect(),
        outsider = connect();
      await host.receive("room_create", {});
      const { code } = roomOf(host);
      await outsider.receive("queue", {});
      await Promise.all([
        first.receive("room_join", { code: ` ${code.toLowerCase()} ` }),
        second.receive("room_join", { code }),
      ]);
      assert.equal(host.messages("reserved").length, 1);
      assert.equal(
        first.messages("reserved").length + second.messages("reserved").length,
        1,
      );
      assert.equal(outsider.messages("reserved").length, 0);
      await outsider.receive("cancel");
      const winner = first.messages("reserved").length ? first : second;
      const { game } = winner.messages("reserved")[0] as { game: PublicGame };
      assert.equal(game.players[0].id, host.data.player.id);
      assert.equal(game.status, "pregame");
      await host.receive("room_create", {});
      assert.match(
        String(host.messages("action_error").at(-1)),
        /Already in a match/,
      );
      await host.receive("ready", { matchId: game.id });
      await winner.receive("ready", { matchId: game.id });
      assert.equal(
        (winner.messages("update").at(-1) as PublicGame).status,
        "countdown",
      );
      winner.disconnect();
      const reconnects = metrics.collector.data.match_reconnects?.count ?? 0;
      const resumed = connect(winner.data.player);
      assert.equal(
        metrics.collector.data.match_reconnects.count,
        reconnects + 1,
      );
      assert.equal(
        (resumed.messages("reserved")[0] as { game: PublicGame }).game.id,
        game.id,
      );
    },
  );
  await t.test(
    "room actions recheck membership after rate limiting and enforce limits",
    async () => {
      const host = connect(),
        other = connect();
      await host.receive("room_create", {});
      const { code } = roomOf(host);
      pauseRooms = true;
      const pending = other.receive("room_join", { code });
      await until(() => deferred.length === 1);
      await other.receive("queue", {});
      deferred.shift()!(true);
      await pending;
      pauseRooms = false;
      assert.match(
        String(other.messages("action_error").at(-1)),
        /Cancel your search/,
      );
      assert.equal(host.messages("reserved").length, 0);
      await other.receive("cancel");
      allowRooms = false;
      await other.receive("room_join", { code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /Please wait/,
      );
      allowRooms = true;
      identities.delete(host.data.player.id);
      await other.receive("room_join", { code });
      assert.match(
        String(other.messages("action_error").at(-1)),
        /unavailable/,
      );
      assert.equal(host.messages("reserved").length, 0);
    },
  );
  await t.test(
    "AI starts once, accepts every speed, and reconnects without a bot account",
    async () => {
      const bots = new Set<string>();
      for (const speed of [1, 1.5, 2, 3]) {
        const human = connect();
        await human.receive("ai_start", { speed });
        const reservation = human.messages("reserved")[0] as {
          game: PublicGame;
          ad: { kind: string };
        };
        assert.equal(reservation.game.mode, "ai");
        assert.equal(reservation.game.speed, speed);
        assert.deepEqual(reservation.game.ready, [false, true]);
        assert.equal(reservation.game.players[0].id, human.data.player.id);
        assert.equal(reservation.game.players[1].name, "Mathrix AI");
        assert.equal(identities.has(reservation.game.players[1].id), false);
        bots.add(reservation.game.players[1].id);
        await human.receive("ai_start", { speed });
        assert.equal(human.messages("reserved").length, 1);
        assert.match(
          String(human.messages("action_error").at(-1)),
          /Already in a match/,
        );
        await human.receive("ready", { matchId: reservation.game.id });
        assert.equal(
          (human.messages("update").at(-1) as PublicGame).status,
          "countdown",
        );
        human.disconnect();
        const resumed = connect(human.data.player);
        assert.equal(
          (resumed.messages("reserved")[0] as { game: PublicGame }).game.id,
          reservation.game.id,
        );
      }
      assert.equal(bots.size, 4);
      const invalid = connect();
      for (const data of [{ speed: 4 }, { rated: true }, { mode: "ranked" }])
        await invalid.receive("ai_start", data);
      assert.equal(invalid.messages("action_error").length, 3);
      assert.equal(invalid.messages("reserved").length, 0);
      await invalid.receive("room_create", {});
      await invalid.receive("ai_start", {});
      assert.match(
        String(invalid.messages("action_error").at(-1)),
        /Cancel your room/,
      );
      await invalid.receive("room_cancel");
      await invalid.receive("queue", {});
      await invalid.receive("ai_start", {});
      assert.match(
        String(invalid.messages("action_error").at(-1)),
        /Cancel your search/,
      );
      await invalid.receive("cancel");
      pauseRooms = true;
      const first = invalid.receive("ai_start", {}),
        second = invalid.receive("ai_start", {});
      await until(() => deferred.length === 2);
      deferred.shift()!(true);
      await first;
      deferred.shift()!(true);
      await second;
      pauseRooms = false;
      assert.equal(invalid.messages("reserved").length, 1);
      assert.match(
        String(invalid.messages("action_error").at(-1)),
        /Already in a match/,
      );
    },
  );
  // Let writes started by the time jumps finish before removing the test spool.
  await until(async () => {
    return (await readdir(join(spool, "completed"))).length === 0;
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../lib/room";
import { createGame } from "../lib/engine";
import { adSchema, defaultAds } from "../lib/config";
const make = () =>
  new Room(
    createGame(
      "r",
      42,
      [
        { id: "a", name: "A", registered: false },
        { id: "b", name: "B", registered: false },
      ],
      undefined,
      1000,
    ),
    5000,
  );
test("ads do not run the game clock; both players must become ready", () => {
  const r = make();
  r.readyNotBefore = [2000, 4000];
  assert.throws(() => r.ready(0, 1500));
  r.ready(0, 2000);
  assert.equal(r.game.status, "pregame");
  assert.equal(r.game.endAt, 0);
  r.ready(1, 4000);
  assert.equal(r.game.status, "countdown");
  r.tick(6999);
  assert.equal(r.game.status, "countdown");
  r.tick(7000);
  assert.equal(r.game.status, "playing");
  assert.equal(r.game.endAt, 127000);
});
test("ad load failure deadline releases both players", () => {
  const r = make();
  r.tick(6000);
  assert.equal(r.game.status, "countdown");
  assert.deepEqual(r.game.ready, [true, true]);
});
test("H5 enforces the minimum wait, waits for completion, and cancels stalled reservations", () => {
  const r = make();
  r.waitForAdCompletion = true;
  r.readyNotBefore = [16000, 16000];
  r.readyDeadline = 121000;
  assert.throws(() => r.ready(0, 15999), /still running/);
  r.ready(0, 16000);
  r.ready(0, 16001); // Duplicate acknowledgment is harmless.
  r.tick(40000);
  assert.equal(r.game.status, "pregame");
  assert.equal(r.game.endAt, 0);
  r.ready(1, 45000);
  assert.equal(r.game.status, "countdown");
  r.ready(1, 45001);
  r.tick(48000);
  assert.equal(r.game.status, "playing");
  const stalled = make();
  stalled.waitForAdCompletion = true;
  assert.equal(stalled.tick(6000), "pregame_cancelled");
  assert.equal(stalled.game.endAt, 0);
  assert.deepEqual(stalled.game.ready, [false, false]);
  const disconnected = make();
  disconnected.waitForAdCompletion = true;
  disconnected.disconnect(0, 1000);
  assert.equal(disconnected.tick(16000), "pregame_cancelled");
});
test("older advertising settings receive the H5 wait default", () => {
  const old: Partial<typeof defaultAds> = { ...defaultAds };
  delete old.pregameWaitMs;
  assert.equal(adSchema.parse(old).pregameWaitMs, 15000);
  assert.equal(
    adSchema.safeParse({ ...old, pregameWaitMs: -1 }).success,
    false,
  );
});
test("brief disconnect can reconnect, abandonment forfeits", () => {
  const r = make();
  r.disconnect(0, 2000);
  r.reconnect(0, 5000);
  r.tick(30000);
  assert.notEqual(r.game.status, "finished");
  r.disconnect(1, 30000);
  r.tick(45000);
  assert.equal(r.game.status, "finished");
  assert.equal(r.game.result!.winner, 0);
  assert.equal(r.game.result!.reason, "disconnect");
});

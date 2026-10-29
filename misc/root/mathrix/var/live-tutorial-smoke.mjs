import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { chromium, expect } from "@playwright/test";
import { Pool } from "pg";

const origin = "https://mathrix.app";
let browser, context, db, guestId, request;
let check = "setup";
const report = (status, details = {}) =>
  console.log(JSON.stringify({ status, check, guestId, ...details }));

try {
  const deployed = parseEnv(readFileSync("/etc/mathrix.env", "utf8"));
  assert.equal(new URL(deployed.APP_URL).origin, origin);
  db = new Pool({ connectionString: deployed.DATABASE_URL });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Block the online transport so this smoke check cannot reserve a real match.
  await context.route("**/socket.io/**", (route) => route.abort());
  await context.routeWebSocket("**/socket.io/**", (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${origin}/play`);
  request = (path, data) => page.evaluate(async ({ path, data }) => {
    const response = await fetch(path, {
      method: data === undefined ? "GET" : "POST",
      credentials: "include",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, ok: response.ok, value: await response.json() };
  }, { path, data });

  check = "guest creation";
  const created = await request("/api/guest", {});
  assert.equal(created.status, 200);
  const guest = created.value;
  assert.equal(guest.registered, false);
  assert.match(guest.id, /^[a-f0-9-]{36}$/);
  guestId = guest.id;
  report("created");
  assert.equal(guest.tutorialEnabled, true);

  const snapshot = async () => {
    const [stats, ratings, participants, profile] = await Promise.all([
      db.query("SELECT * FROM player_stats WHERE user_id=$1", [guestId]),
      db.query("SELECT * FROM rating_history WHERE user_id=$1 ORDER BY id", [guestId]),
      db.query("SELECT * FROM match_participants WHERE user_id=$1 ORDER BY match_id,seat", [guestId]),
      request("/api/profile"),
    ]);
    assert.ok(profile.ok);
    return {
      stats: stats.rows,
      ratings: ratings.rows,
      participants: participants.rows,
      history: profile.value.history,
    };
  };
  const me = async () => {
    const response = await request("/api/me");
    assert.ok(response.ok);
    const player = response.value;
    assert.equal(player.id, guestId);
    return player;
  };
  const before = await snapshot();

  check = "tutorial offer";
  await page.goto(`${origin}/play`);
  const start = page.getByRole("link", { name: "Start tutorial", exact: true });
  await expect(page.getByRole("heading", { name: "Tutorial game", exact: true })).toBeVisible();
  await start.click();
  const board = page.locator(".tutorial-game");
  const move = async (skip = false) => {
    if (skip) await page.locator(".desktop-skip").click();
    else {
      await page.locator(".cards .card:enabled").first().click();
      const targets = page.locator(".matrix-panel .legal");
      await expect.poll(async () =>
        (await board.getAttribute("data-tutorial-phase")) === "feedback" ||
        (await targets.count()) > 0,
      ).toBe(true);
      if ((await board.getAttribute("data-tutorial-phase")) !== "feedback")
        await targets.first().click();
    }
    await expect(board).toHaveAttribute("data-tutorial-phase", "feedback");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  };
  for (let lesson = 0; lesson < 12; lesson++) {
    check = `guided lesson ${lesson + 1}`;
    await expect(board).toHaveAttribute("data-tutorial-lesson", String(lesson));
    await expect(board).toHaveAttribute("data-tutorial-phase", "instruction");
    await move(lesson === 4);
  }
  for (let turn = 0; turn < 3; turn++) {
    check = `free round ${turn + 1}`;
    await expect(board).toHaveAttribute("data-tutorial-phase", "free");
    await move();
  }
  check = "completion and unchanged progress";
  await expect(page.getByRole("heading", { name: "Tutorial complete", exact: true })).toBeVisible();
  assert.deepEqual(await snapshot(), before);
  await page.getByRole("link", { name: "Back to Play", exact: true }).click();
  await expect(start).toBeVisible();
  assert.equal((await me()).tutorialEnabled, true);
  assert.deepEqual(await snapshot(), before);

  check = "hide preference persistence";
  await page.getByRole("button", { name: "Hide tutorial", exact: true }).click();
  await expect(start).toHaveCount(0);
  assert.equal((await me()).tutorialEnabled, false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ranked mode", exact: true })).toBeVisible();
  await expect(start).toHaveCount(0);

  check = "reenable preference persistence";
  await page.goto(`${origin}/settings`);
  const show = page.getByRole("checkbox", { name: "Show tutorial game on Play", exact: true });
  await expect(show).not.toBeChecked();
  await show.click();
  await expect(show).toBeChecked();
  await expect(show).toBeEnabled();
  assert.equal((await me()).tutorialEnabled, true);
  await page.reload();
  await expect(show).toBeChecked();
  await page.goto(`${origin}/play`);
  await expect(start).toBeVisible();
  assert.deepEqual(await snapshot(), before);
  report("passed", { lessons: 12, freeRounds: 3, progressUnchanged: true, preferencePersists: true });
} catch {
  report("failed");
  process.exitCode = 1;
} finally {
  check = "fixture cleanup";
  if (guestId && db) {
    try {
      if (request) await request("/api/guest/sign-out", {});
      const removed = await db.query(
        'DELETE FROM "user" WHERE id=$1 AND "isGuest" AND email=$2 AND NOT EXISTS(SELECT 1 FROM match_participants WHERE user_id=$1) RETURNING id',
        [guestId, `${guestId}@guest.mathrix.invalid`],
      );
      assert.equal(removed.rowCount, 1);
      report("removed");
    } catch {
      report("cleanup-needed");
      process.exitCode = 1;
    }
  }
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await db?.end().catch(() => {});
}

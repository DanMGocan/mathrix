import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { browserSession } from "./auth-fixture";

const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
const isolated = Boolean(
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname.includes("_test_") &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(() => db.end());

async function progress(context: BrowserContext, id: string) {
  const [stats, ratings, matches, profile] = await Promise.all([
    db.query("SELECT * FROM player_stats WHERE user_id=$1", [id]),
    db.query("SELECT * FROM rating_history WHERE user_id=$1 ORDER BY id", [id]),
    db.query(
      "SELECT * FROM match_participants WHERE user_id=$1 ORDER BY match_id,seat",
      [id],
    ),
    context.request.get(`${origin}/api/profile`),
  ]);
  expect(profile.ok()).toBe(true);
  return {
    stats: stats.rows,
    ratings: ratings.rows,
    matches: matches.rows,
    history: (await profile.json()).history,
  };
}

async function playMove(page: Page) {
  const board = page.locator(".tutorial-game");
  await page.locator(".cards .card:enabled").first().click();
  const targets = page.locator(".matrix-panel .legal");
  await expect
    .poll(
      async () =>
        (await board.getAttribute("data-tutorial-phase")) === "feedback" ||
        (await targets.count()) > 0,
    )
    .toBe(true);
  if ((await board.getAttribute("data-tutorial-phase")) !== "feedback")
    await targets.first().click();
}

async function completeTutorial(page: Page) {
  const board = page.locator(".tutorial-game");
  for (let lesson = 0; lesson < 12; lesson++) {
    await expect(board).toHaveAttribute("data-tutorial-lesson", String(lesson));
    await expect(board).toHaveAttribute("data-tutorial-phase", "instruction");
    if (lesson === 4) await page.locator(".desktop-skip").click();
    else await playMove(page);
    await expect(board).toHaveAttribute("data-tutorial-phase", "feedback");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  for (let turn = 0; turn < 3; turn++) {
    await expect(board).toHaveAttribute("data-tutorial-lesson", "12");
    await expect(board).toHaveAttribute("data-tutorial-phase", "free");
    await playMove(page);
    await expect(board).toHaveAttribute("data-tutorial-phase", "feedback");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Tutorial complete", exact: true }),
  ).toBeVisible();
}

for (const kind of ["registered", "guest"] as const) {
  test(`tutorial ${kind}: visibility follows the player and completion preserves all progress`, async ({
    page,
    context,
    browser,
  }) => {
    test.skip(
      !isolated,
      "Requires the isolated system-test database and server.",
    );
    let id: string;
    if (kind === "registered") {
      const player = await browserSession(context, {
        email: `tutorial-${randomUUID()}@example.invalid`,
        name: "Tutorial player",
      });
      id = player.id;
    } else {
      const created = await context.request.post(`${origin}/api/guest`, {
        headers: { Origin: origin },
        data: {},
      });
      expect(created.ok()).toBe(true);
      const player = await created.json();
      expect(player.tutorialEnabled).toBe(true);
      id = player.id;
    }
    let restored: BrowserContext | undefined;
    try {
      await page.goto(`${origin}/play`);
      const start = page.getByRole("link", {
        name: "Start tutorial",
        exact: true,
      });
      await expect(start).toBeVisible();
      await page
        .getByRole("button", { name: "Hide tutorial", exact: true })
        .click();
      await expect(start).toHaveCount(0);
      expect(
        (await (await context.request.get(`${origin}/api/me`)).json())
          .tutorialEnabled,
      ).toBe(false);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Ranked mode", exact: true }),
      ).toBeVisible();
      await expect(start).toHaveCount(0);

      // Restore cookies alone: browser-local preferences cannot hide the offer.
      restored = await browser.newContext({
        storageState: { cookies: await context.cookies(), origins: [] },
      });
      await page.close();
      const reopened = await restored.newPage();
      await reopened.goto(`${origin}/play`);
      await expect(
        reopened.getByRole("button", { name: "Ranked mode", exact: true }),
      ).toBeVisible();
      const restoredStart = reopened.getByRole("link", {
        name: "Start tutorial",
        exact: true,
      });
      await expect(restoredStart).toHaveCount(0);
      await reopened.goto(`${origin}/settings`);
      const show = reopened.getByRole("checkbox", {
        name: "Show tutorial game on Play",
        exact: true,
      });
      await expect(show).not.toBeChecked();
      await show.click();
      await expect(show).toBeChecked();
      await expect(show).toBeEnabled();
      expect(
        (await (await restored.request.get(`${origin}/api/me`)).json())
          .tutorialEnabled,
      ).toBe(true);
      await reopened.reload();
      await expect(show).toBeChecked();
      await reopened.goto(`${origin}/play`);
      await expect(restoredStart).toBeVisible();

      const before = await progress(restored, id);
      await restoredStart.click();
      await completeTutorial(reopened);
      expect(await progress(restored, id)).toEqual(before);
      await reopened
        .getByRole("link", { name: "Back to Play", exact: true })
        .click();
      await expect(restoredStart).toBeVisible();
      expect(
        (await (await restored.request.get(`${origin}/api/me`)).json())
          .tutorialEnabled,
      ).toBe(true);
      expect(await progress(restored, id)).toEqual(before);
    } finally {
      await restored?.close();
      await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    }
  });
}

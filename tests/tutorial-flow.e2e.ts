import { test, expect, type Page } from "@playwright/test";
import { defaultBalance } from "../lib/config";

async function playerPage(page: Page, registered = true) {
  const player = {
    id: "tutorial-test-player",
    name: "Tutorial learner",
    role: registered ? "USER" : "GUEST",
    registered,
    tutorialEnabled: true,
  };
  const commands: string[] = [];
  let failPreference = false;
  await page.route("**/api/me", (route) => route.fulfill({ json: player }));
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: { ...defaultBalance, currentRank: null } }),
  );
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/guest/code", (route) =>
    route.fulfill({ json: { code: "saved-guest-code" } }),
  );
  await page.route("**/api/tutorial-preference", (route) => {
    if (failPreference)
      return route.fulfill({ status: 503, json: { error: "Save failed" } });
    player.tutorialEnabled = route.request().postDataJSON().enabled;
    return route.fulfill({ json: { enabled: player.tutorialEnabled } });
  });
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    ws.send(
      `0${JSON.stringify({ sid: "tutorial", upgrades: [], pingInterval: 600000, pingTimeout: 600000 })}`,
    );
    ws.onMessage((message) => {
      const frame = String(message);
      if (frame === "40") ws.send('40{"sid":"tutorial"}');
      else if (frame.startsWith("42"))
        commands.push(JSON.parse(frame.slice(2))[0]);
    });
  });
  return {
    commands,
    failPreference: (fail: boolean) => (failPreference = fail),
  };
}

async function humanMove(page: Page, keyboard: boolean, skip = false) {
  const game = page.locator(".tutorial-game");
  if (skip) {
    if (keyboard) await page.keyboard.press("q");
    else
      await page
        .getByRole("button", { name: "Skip turn", exact: true })
        .filter({ visible: true })
        .click();
  } else {
    const card = page.locator(".cards .card:enabled").first();
    if (keyboard)
      await page.keyboard.press(
        (await card.getAttribute("aria-keyshortcuts"))!,
      );
    else await card.click();
    if ((await game.getAttribute("data-tutorial-phase")) !== "feedback") {
      const target = page.locator(".matrix-panel .legal").first();
      const shortcut = await target.getAttribute("aria-keyshortcuts");
      if (keyboard && shortcut) {
        if (
          await target.evaluate(
            (el) => !!el.closest(".opponent") && el.classList.contains("axis"),
          )
        )
          await page.keyboard.press("Shift");
        await page.keyboard.press(shortcut);
      } else await target.click();
    }
  }
  await expect(game).toHaveAttribute("data-tutorial-phase", "feedback");
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".cards .card:enabled")).toHaveCount(0);
  const before = await page.locator(".matrix-panel .score b").allTextContents();
  await page.keyboard.press("q");
  await page.keyboard.press("1");
  expect(
    await page.locator(".matrix-panel .score b").allTextContents(),
  ).toEqual(before);
}

async function reply(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".tutorial-game")).toHaveAttribute(
    "data-tutorial-phase",
    "ai",
  );
  await page.clock.fastForward(600);
}

for (const [name, viewport, registered] of [
  ["desktop", { width: 1440, height: 900 }, true],
  ["mobile", { width: 390, height: 844 }, false],
] as const) {
  test(`tutorial ${name}: full guided game, three free rounds and fresh replay`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { commands } = await playerPage(page, registered);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/"))
        requests.push(new URL(request.url()).pathname);
    });
    await page.clock.install();
    await page.goto("/play?mode=tutorial");
    const game = page.locator(".tutorial-game");
    await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
    await expect(page.locator(".matrix-panel .score b")).toHaveText([
      "10",
      "10",
    ]);
    await expect(page.locator("footer")).toBeHidden();
    await expect(
      page.getByText("No time limit · No stats", { exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(180000);
    await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
    for (let lesson = 0; lesson < 12; lesson++) {
      await expect(game).toHaveAttribute(
        "data-tutorial-lesson",
        String(lesson),
      );
      await expect(game).toHaveAttribute("data-tutorial-phase", "instruction");
      if (lesson !== 4)
        await expect(
          page.getByRole("button", { name: "Skip turn", exact: true }).first(),
        ).toBeDisabled();
      await humanMove(page, name === "desktop", lesson === 4);
      if (lesson === 0) {
        await expect(page.locator(".self .score b")).toHaveText("13");
        await page.clock.fastForward(180000);
        await expect(game).toHaveAttribute("data-tutorial-phase", "feedback");
        await page.screenshot({
          path: test.info().outputPath(`tutorial-feedback-${name}.png`),
        });
      }
      if (lesson === 4)
        await expect(page.locator(".self .destroyed-total b")).toHaveText("2");
      if (lesson === 10)
        await expect(page.locator(".cards .card")).toHaveCount(5);
      await reply(page);
    }
    await expect(game).toHaveAttribute("data-tutorial-phase", "free");
    await expect(page.getByLabel("Game stage")).toHaveText("LATE STAGE");
    await page.screenshot({
      path: test.info().outputPath(`tutorial-free-${name}.png`),
    });
    for (let round = 0; round < 3; round++) {
      await expect(game).toHaveAttribute("data-tutorial-phase", "free");
      await humanMove(page, name === "desktop", true);
      await reply(page);
    }
    await expect(
      page.getByRole("heading", { name: "Tutorial complete", exact: true }),
    ).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator(".results")).not.toContainText("Saving match");
    await page
      .getByRole("button", { name: "Tutorial again", exact: true })
      .click();
    await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
    await expect(page.locator(".matrix-panel .score b")).toHaveText([
      "10",
      "10",
    ]);
    await expect(page.locator(".cards .card")).toHaveCount(4);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("link", { name: "Back to Play", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Start tutorial", exact: true }),
    ).toBeVisible();
    expect(commands).toEqual([]);
    expect(
      requests.every(
        (path) =>
          path === "/api/me" ||
          path === "/api/play-options" ||
          path === "/api/ad/config" ||
          path === "/api/guest/code",
      ),
    ).toBe(true);
  });
}

test("tutorial entry keeps actions readable and aligned on desktop and mobile", async ({
  page,
}) => {
  await playerPage(page);
  await page.goto("/play");
  const start = page.getByRole("link", { name: "Start tutorial", exact: true });
  const hide = page.getByRole("button", { name: "Hide tutorial", exact: true });
  await expect(start).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.mouse.move(0, 0);
    await expect(page.locator('[aria-labelledby="ranked-heading"]')).toHaveCSS(
      "margin-top",
      "36px",
    );
    const startBox = (await start.boundingBox())!;
    const hideBox = (await hide.boundingBox())!;
    expect(Math.abs(startBox.height - hideBox.height)).toBeLessThan(1);
    if (viewport.width === 1440)
      expect(Math.abs(startBox.y - hideBox.y)).toBeLessThan(1);
    else {
      expect(hideBox.y).toBeCloseTo(startBox.y + startBox.height + 12, 0);
      expect(hideBox.x + hideBox.width / 2).toBeCloseTo(
        startBox.x + startBox.width / 2,
        0,
      );
    }
    await expect(start).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(start).toHaveCSS("background-color", "rgb(0, 109, 175)");
    await start.hover();
    await expect(start).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(start).toHaveCSS("background-color", "rgb(0, 89, 143)");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await start.focus();
    await expect(start).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(start).toHaveCSS("background-color", "rgb(0, 109, 175)");
  }
  await start.click();
  await expect(page.locator(".tutorial-game")).toHaveAttribute(
    "data-tutorial-lesson",
    "0",
  );
});

test("tutorial visibility saves only on success and Preferences can restore it", async ({
  page,
}) => {
  const fixture = await playerPage(page);
  await page.goto("/play");
  const start = page.getByRole("link", { name: "Start tutorial", exact: true });
  await expect(start).toBeVisible();
  fixture.failPreference(true);
  await page
    .getByRole("button", { name: "Hide tutorial", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not hide" }),
  ).toBeVisible();
  await expect(start).toBeVisible();
  fixture.failPreference(false);
  await page
    .getByRole("button", { name: "Hide tutorial", exact: true })
    .click();
  await expect(start).toHaveCount(0);
  await page.reload();
  await expect(start).toHaveCount(0);
  await page.goto("/settings");
  const checkbox = page.getByRole("checkbox", {
    name: "Show tutorial game on Play",
    exact: true,
  });
  await expect(checkbox).not.toBeChecked();
  fixture.failPreference(true);
  await checkbox.click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Could not save",
  );
  await expect(checkbox).not.toBeChecked();
  fixture.failPreference(false);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.goto("/play");
  await expect(start).toBeVisible();
});

test("tutorial layout, restart, help pauses and reactive ad exclusion", async ({
  page,
}) => {
  await playerPage(page);
  let adRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/ad/config") adRequests++;
  });
  await page.clock.install();
  await page.goto("/play");
  await page.getByRole("link", { name: "Start tutorial", exact: true }).click();
  const initialAds = adRequests;
  const game = page.locator(".tutorial-game");
  await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".boards")).toBeVisible();
    expect(
      (await page.locator(".tutorial-coaching").boundingBox())!.height,
    ).toBeGreaterThanOrEqual(56);
    await expect(page.locator(".cards .card").first()).toBeVisible();
    await page.screenshot({
      path: test
        .info()
        .outputPath(`tutorial-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await humanMove(page, false);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(game).toHaveAttribute("data-tutorial-phase", "ai");
  await page.locator(".tile-help-button").first().click();
  await page.clock.fastForward(120000);
  await expect(game).toHaveAttribute("data-tutorial-phase", "ai");
  await page.keyboard.press("Escape");
  await page.clock.fastForward(600);
  await expect(game).toHaveAttribute("data-tutorial-lesson", "1");
  await page.reload();
  await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
  await humanMove(page, false);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Restart tutorial", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Game menu" }),
  ).not.toBeVisible();
  await expect(game).toHaveAttribute("data-tutorial-lesson", "0");
  expect(adRequests).toBe(initialAds);
});

test("tutorial entry requires a player and keeps the tutorial destination through sign-in", async ({
  page,
}) => {
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  await page.route("**/api/providers", (route) =>
    route.fulfill({ json: { google: true, discord: true } }),
  );
  let callback: Record<string, string> | undefined;
  await page.route("**/api/auth/sign-in/social", (route) => {
    callback = route.request().postDataJSON();
    return route.fulfill({
      json: {
        url: new URL("/auth?mode=tutorial&error=access_denied", page.url())
          .href,
      },
    });
  });
  await page.goto("/play?mode=tutorial");
  await expect(
    page.getByRole("heading", { name: "Enter the matrix", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tutorial-game")).toHaveCount(0);
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth\?mode=tutorial$/);
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(page).toHaveURL(/mode=tutorial&error=access_denied/);
  expect(callback?.callbackURL).toBe(
    new URL("/play?mode=tutorial", page.url()).href,
  );
  expect(callback?.newUserCallbackURL).toBe(
    new URL("/auth/complete?mode=tutorial", page.url()).href,
  );
});

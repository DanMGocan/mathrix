import { test, expect } from "@playwright/test";

for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`practice ${name}: unlock a shared slot and restart with four`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "getRandomValues", {
        value: (array: Uint32Array) => {
          array[0] = 1;
          return array;
        },
      });
    });
    await page.route("**/api/me", (route) => route.fulfill({ json: null }));
    await page.route("**/api/ad/config", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.clock.install({ time: new Date("2026-10-03T12:00:00Z") });
    await page.goto("/play?mode=practice");
    await expect(page.locator(".cards .card")).toHaveCount(4);
    await page.clock.pauseAt(new Date("2026-10-03T12:01:00Z"));
    await page
      .getByRole("button", { name: "About UNLOCK SLOT", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "The shared tile pool for both players",
    );
    await expect(page.getByRole("dialog")).toContainText("click “Unlock slot”");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "UNLOCK SLOT", exact: true })
      .click();
    await expect(page.locator(".matrix-panel .legal")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Unlock slot (4 → 5)", exact: true })
      .click();
    await expect(page.locator(".cards .card")).toHaveCount(5);
    await expect(page.locator(".tile-help-button")).toHaveCount(5);
    await expect(page.getByText("SHARED OPERATIONS / 5/8")).toBeVisible();
    await expect(page.locator(".matrix-panel .score b")).toHaveText([
      "10",
      "10",
    ]);
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
    await expect(page.getByLabel("Game stage")).toHaveText("EARLY STAGE");
    const cardsBeforeStages = await page
      .locator(".cards .card")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-card-id")));
    const nextStage = page.getByRole("button", {
      name: "Next stage",
      exact: true,
    });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await nextStage.click();
    await expect(page.getByLabel("Game stage")).toHaveText("MID STAGE");
    await nextStage.click();
    await expect(page.getByLabel("Game stage")).toHaveText("LATE STAGE");
    await expect(nextStage).toBeDisabled();
    expect(
      await page
        .locator(".cards .card")
        .evaluateAll((cards) =>
          cards.map((c) => c.getAttribute("data-card-id")),
        ),
    ).toEqual(cardsBeforeStages);
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Finish practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Practice again", exact: true })
      .click();
    await expect(page.locator(".cards .card")).toHaveCount(4);
    await expect(page.getByText("SHARED OPERATIONS / 4/8")).toBeVisible();
    await expect(page.getByLabel("Game stage")).toHaveText("EARLY STAGE");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(nextStage).toBeEnabled();
    await page.keyboard.press("Escape");
  });

  test(`practice ${name}: learn without clocks, read tiles, play AI and restart`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "getRandomValues", {
        value: (array: Uint32Array) => {
          array[0] = 127;
          return array;
        },
      });
    });
    await page.route("**/api/ad/config", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/me", (route) => route.fulfill({ json: null }));
    const errors: string[] = [],
      requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/\/api\/|\/socket.io\//.test(request.url()))
        requests.push(request.url());
    });
    await page.clock.install({ time: new Date("2026-10-03T12:00:00Z") });
    await page.goto("/");
    await page
      .getByRole("link", { name: "Practice mode", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Practice mode" }),
    ).toBeVisible();
    await page.clock.pauseAt(new Date("2026-10-03T12:01:00Z"));
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.locator(".practice-intro")).toContainText(
      "Very basic AI · Use this mode to learn.",
    );
    await page.keyboard.press("Escape");
    await expect(
      page.getByText("No time limit", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".game-top")).not.toContainText("MATCH CLOCK");
    await expect(page.locator(".cards .card")).toHaveCount(4);
    await expect(page.locator(".tile-help-button")).toHaveCount(4);
    await expect(page.locator('[data-operation*="_time_"]')).toHaveCount(0);
    const ids = () =>
      page
        .locator(".card")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("data-card-id")),
        );
    const initial = await ids();
    await page.clock.fastForward(180000);
    await expect(page.locator(".turn-banner")).toContainText("YOUR TURN");
    expect(await ids()).toEqual(initial);

    const about = page.getByRole("button", {
      name: "About +3 cell",
      exact: true,
    });
    await about.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Add 3 to one cell in either matrix.");
    await expect(dialog).toContainText("How to play:");
    await expect(page.locator(".card.selected")).toHaveCount(0);
    expect(await ids()).toEqual(initial);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(about).toBeFocused();

    await page.getByRole("button", { name: "+3 cell", exact: true }).click();
    await about.click();
    await expect(page.locator(".card.selected")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.locator(".matrix-panel.self .cell.legal").first().click();
    await expect(page.locator(".matrix-panel.self .score b")).toHaveText("13");
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
    const afterPlayer = await ids();
    await expect(page.locator(".card:disabled")).toHaveCount(4);
    await page.locator(".tile-help-button").first().click();
    await expect(dialog).toBeVisible();
    await page.clock.fastForward(60000);
    expect(await ids()).toEqual(afterPlayer);
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.clock.fastForward(600);
    await expect(page.locator(".turn-banner")).not.toContainText(
      "VERY BASIC AI’S TURN",
    );
    await page.clock.fastForward(2000);
    await expect(page.locator(".turn-banner")).toContainText("YOUR TURN");
    expect(await ids()).not.toEqual(afterPlayer);

    const growthScore = await page
      .locator(".matrix-panel.self .score b")
      .textContent();
    await expect(
      page.locator('[data-operation="add_row"] .tile-description').first(),
    ).toContainText("filled with 0");
    await page.locator('[data-operation="add_row"]').first().click();
    await page.locator(".matrix-panel.self .matrix-target").click();
    await expect(
      page.locator(".matrix-panel.self .matrix-row").last().locator(".cell"),
    ).toHaveText(["0", "0"]);
    await expect(page.locator(".skill")).toHaveCount(0);
    await expect(page.locator(".matrix-panel.self .score b")).toHaveText(
      growthScore!,
    );
    await page.locator(".tile-help-button").first().click();
    await page.clock.fastForward(2000);
    await expect(page.locator(".skill")).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const finalScores = await page
      .locator(".matrix-panel .score b")
      .allTextContents();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Finish practice", exact: true })
      .click();
    await expect(page.locator(".results")).toContainText("PRACTICE COMPLETE");
    expect(
      await page.locator(".result-scores strong").allTextContents(),
    ).toEqual(finalScores);
    await expect(page.locator(".results")).not.toContainText("Saving match");
    await page.clock.fastForward(60000);
    expect(
      await page.locator(".result-scores strong").allTextContents(),
    ).toEqual(finalScores);
    await page
      .getByRole("button", { name: "Practice again", exact: true })
      .click();
    await page.clock.fastForward(2000);
    await expect(page.locator(".turn-banner")).toContainText("YOUR TURN");
    expect(
      await page.locator(".matrix-panel .score b").allTextContents(),
    ).toEqual(["10", "10"]);
    expect(await ids()).toEqual(initial);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(requests.every((url) => /\/api\/(ad\/config|me)$/.test(url))).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`practice-${name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Finish practice", exact: true })
      .click();
    await page.getByRole("link", { name: "Back to Play", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Enter the matrix" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Practice mode", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

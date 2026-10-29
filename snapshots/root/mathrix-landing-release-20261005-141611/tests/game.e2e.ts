import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import {
  gameStages,
  operationIds,
  type Balance,
  type AdConfig,
} from "../lib/config";
import type { OperationId, PublicGame } from "../lib/engine";
let admin: APIRequestContext, original: { balance: Balance; ads: AdConfig };
const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
async function login(p: Page, email: string) {
  await p.goto("/auth");
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill("amdin");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
    );
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    const result = await response;
    if (result.status() !== 429 || attempt === 1) break;
    // Respect the real login rate limit when browser tests sign in in quick succession.
    await new Promise((resolve) => setTimeout(resolve, 11000));
  }
  await expect(p).toHaveURL(/\/play$/);
}
async function chooseMode(page: Page, name: string) {
  // Reconnecting can restore a saved result after the initial menu appears.
  await expect(async () => {
    const back = page.getByRole("button", {
      name: "Back to modes",
      exact: true,
    });
    if (await back.isVisible()) await back.click();
    await page
      .getByRole("button", { name, exact: true })
      .click({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}
async function queue(a: Page, b: Page) {
  for (const page of [a, b]) {
    await chooseMode(page, "Ranked mode");
    if (page === a)
      await expect(a.getByText("Searching for opponent…")).toBeVisible();
  }
  await Promise.all([
    expect(a.locator(".game")).toBeVisible({ timeout: 20000 }),
    expect(b.locator(".game")).toBeVisible({ timeout: 20000 }),
  ]);
}
async function sameMatrices(a: Page, b: Page) {
  const snapshot = (p: Page) =>
    p.locator(".matrix-panel").evaluateAll((panels) =>
      panels.map((panel) => ({
        name: panel.querySelector("h2")!.textContent,
        cells: [...panel.querySelectorAll(".cell")].map((c) => c.textContent),
      })),
    );
  // Each browser renders its own matrix first; display names may be identical.
  await expect
    .poll(
      async () =>
        JSON.stringify(await snapshot(a)) ===
        JSON.stringify((await snapshot(b)).reverse()),
    )
    .toBe(true);
}
async function settings(enabled: boolean, grow = false, tile?: OperationId) {
  const c = structuredClone(original);
  c.balance.matchMs =
    tile && ["unlock_slot", "add_row", "add_column"].includes(tile)
      ? 20000
      : 10000;
  for (const stage of gameStages)
    c.balance.weights[stage] = Object.fromEntries(
      operationIds.map((id) => [
        id,
        tile
          ? id === tile
            ? 100
            : id === "add_cell"
              ? 0.001
              : 0
          : id === "add_cell"
            ? grow
              ? 0.001
              : 100
            : grow && id === "add_row"
              ? 100
              : 0,
      ]),
    ) as Balance["weights"]["early"];
  c.ads.enabled = enabled;
  c.ads.mode = enabled ? "HOUSE_ADS" : "OFF";
  c.ads.maxWaitMs = 5000;
  c.ads.cooldownMinutes = 0;
  c.ads.everyN = 1;
  c.ads.admins = true;
  const r = await admin.post("/api/admin/settings", {
    data: c,
    headers: { Origin: origin },
  });
  expect(r.ok()).toBe(true);
}
test.beforeAll(async ({ playwright }) => {
  admin = await playwright.request.newContext({ baseURL: origin });
  const r = await admin.post("/api/auth/sign-in/email", {
    data: { email: "admin1@mathrix.app", password: "amdin" },
    headers: { Origin: origin },
  });
  expect(r.ok()).toBe(true);
  original = await (await admin.get("/api/admin/settings")).json();
});
test.afterAll(async () => {
  if (original)
    await admin.post("/api/admin/settings", {
      data: original,
      headers: { Origin: origin },
    });
  await admin?.dispose();
});

test("keyboard row targeting synchronizes across both browsers", async ({
  browser,
}) => {
  await settings(false, false, "add_row_value");
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    for (const page of [a, b]) {
      await page.goto("/play");
      await page
        .getByRole("button", { name: "Play as guest", exact: true })
        .click();
    }
    await queue(a, b);
    const active = (await a
      .locator(".self")
      .evaluate((e) => e.classList.contains("active")))
      ? a
      : b;
    const inactive = active === a ? b : a;
    await inactive.keyboard.press("1");
    await expect(inactive.locator(".card.selected")).toHaveCount(0);
    const before = Number(
      await active.locator(".opponent .score b").textContent(),
    );
    const tile = active.locator('[data-operation="add_row_value"]').first();
    const value = Number(
      (await tile.getAttribute("aria-label"))!.match(/\d+/)![0],
    );
    const columns = await active
      .locator(".opponent .matrix-columns .axis")
      .count();
    await active.keyboard.press(
      (await tile.getAttribute("aria-keyshortcuts"))!,
    );
    await expect(
      active.locator('.self .axis[aria-keyshortcuts="0"]'),
    ).toBeVisible();
    await active.keyboard.press("Shift");
    await expect(
      active.locator('.opponent .axis[aria-keyshortcuts="0"]'),
    ).toBeVisible();
    await active.keyboard.press("0");
    await expect(active.locator(".opponent .score b")).toHaveText(
      String(before + value * columns),
    );
    await sameMatrices(a, b);
    await expect(active.locator(".card.selected")).toHaveCount(0);
    await expect(active.locator(".results")).toBeVisible({ timeout: 20000 });
  } finally {
    await ca.close();
    await cb.close();
  }
});

for (const players of ["guests", "registered", "mixed"] as const) {
  test(`private room invitations support ${players}, refresh and another room`, async ({
    browser,
  }) => {
    await settings(false);
    const ca = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const cb = await browser.newContext();
    const a = await ca.newPage(),
      b = await cb.newPage();
    const guestEmail = `invite-${Date.now()}@example.invalid`;
    const password = "invite-test-password-123";
    try {
      if (players === "registered") {
        for (const [context, email] of [
          [ca, `host-${guestEmail}`],
          [cb, guestEmail],
        ] as const) {
          const created = await context.request.post(
            "/api/auth/sign-up/email",
            {
              data: { email, name: "Room player", password },
              headers: { Origin: origin },
            },
          );
          expect(created.ok()).toBe(true);
        }
        await cb.request.post("/api/auth/sign-out", {
          data: {},
          headers: { Origin: origin },
        });
        await a.goto("/play");
      } else {
        await a.goto("/play");
        await a.getByRole("button", { name: "Play as guest" }).click();
      }
      await expect(
        a.getByRole("button", { name: "Create room", exact: true }),
      ).toBeEnabled();
      await a.getByRole("button", { name: "Create room", exact: true }).click();
      if (players === "guests")
        await a.getByLabel("Room speed").selectOption("3");
      await a.getByRole("button", { name: "Create room", exact: true }).click();
      await expect(a.getByLabel("Invite link")).toBeVisible();
      const code = await a
        .getByLabel("Room code", { exact: true })
        .inputValue();
      const invite = await a.getByLabel("Invite link").inputValue();
      await a.reload();
      await expect(a.getByLabel("Invite link")).toHaveValue(invite);
      expect(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await b.goto(invite);
      if (players === "guests")
        await b.getByRole("button", { name: "Play as guest" }).click();
      else {
        await b
          .locator("main")
          .getByRole("link", { name: "Sign in", exact: true })
          .click();
        if (players === "mixed") {
          await b
            .getByRole("button", { name: "New here? Create an account" })
            .click();
          await b.getByLabel("Username").fill(`Invited-${Date.now()}`);
        }
        await b.getByLabel("Email", { exact: true }).fill(guestEmail);
        await b.getByLabel("Password", { exact: true }).fill(password);
        await b
          .getByRole("button", {
            name: players === "mixed" ? "Create account" : "Sign in",
            exact: true,
          })
          .click();
      }
      await expect(b.getByLabel("Room code", { exact: true })).toHaveValue(
        code,
      );
      await expect(
        b.getByRole("button", { name: "Join room", exact: true }),
      ).toBeEnabled();
      await b.getByRole("button", { name: "Join room", exact: true }).click();
      await Promise.all([
        expect(a.locator(".game")).toBeVisible(),
        expect(b.locator(".game")).toBeVisible(),
      ]);
      await sameMatrices(a, b);
      await expect(a.locator(".results")).toBeVisible({ timeout: 40000 });
      await expect(b.locator(".results")).toBeVisible();
      await expect(a.getByRole("link", { name: "Your profile" })).toBeVisible();
      await expect(
        a.getByRole("link", { name: "View match details" }),
      ).toBeVisible();
      const details = await (
        await ca.request.get(
          `/api${await a.getByRole("link", { name: "View match details" }).getAttribute("href")}`,
        )
      ).json();
      expect(details.rated).toBe(false);
      expect(details.mode).toBe("custom");
      expect(details.speed).toBe(players === "guests" ? 3 : 1);
      await a.getByRole("button", { name: "Create another room" }).click();
      await expect(a.getByLabel("Invite link")).toBeVisible();
      const cancelled = await a
        .getByLabel("Room code", { exact: true })
        .inputValue();
      // A prior result must not hide a new invitation for the same player.
      await b.goto(await a.getByLabel("Invite link").inputValue());
      await expect(b.getByLabel("Room code", { exact: true })).toHaveValue(
        cancelled,
      );
      await expect(
        b.getByRole("button", { name: "Join room", exact: true }),
      ).toBeEnabled();
      await a.getByRole("button", { name: "Cancel room" }).click();
      await expect(
        a.getByRole("button", { name: "Create room", exact: true }),
      ).toBeEnabled();
      await b.getByRole("button", { name: "Join room", exact: true }).click();
      await expect(
        b.getByRole("alert").filter({ hasText: "Room unavailable" }),
      ).toBeVisible();
    } finally {
      await ca.close();
      await cb.close();
    }
  });
}

test("OAuth carries the invitation in its same-origin callback", async ({
  page,
}) => {
  await page.route("**/api/providers", (route) =>
    route.fulfill({ json: { google: true, discord: false } }),
  );
  let callback = "";
  await page.route("**/api/auth/sign-in/social", (route) => {
    callback = route.request().postDataJSON().callbackURL;
    return route.fulfill({ json: { url: `${origin}/auth?room=ABC234` } });
  });
  await page.goto("/auth?room=ABC234");
  await page.getByRole("button", { name: "Google", exact: true }).click();
  await expect.poll(() => callback).toBe(`${origin}/play?room=ABC234`);
});

test("shared tiles synchronize clock changes and Transpose across both browsers", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const states = new Map<Page, PublicGame>();
  for (const p of [a, b])
    p.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        const frame = String(payload);
        if (!frame.startsWith("42")) return;
        const [event, data] = JSON.parse(frame.slice(2));
        if (event === "update") states.set(p, data);
      }),
    );
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    for (const tile of [
      "add_match_time_5",
      "add_turn_time_5",
      "sub_turn_time_15",
      "transpose",
      "sub_match_time_15",
    ] as const) {
      await settings(false, false, tile);
      await Promise.all([a.goto("/play"), b.goto("/play")]);
      await queue(a, b);
      await expect(a.locator(".card")).toHaveCount(4);
      await expect(b.locator(".card")).toHaveCount(4);
      await expect(a.getByText("SHARED OPERATIONS / 4/8")).toBeVisible();
      const before = states.get(a)!;
      const active = (await a
        .locator(".self")
        .evaluate((e) => e.classList.contains("active")))
        ? a
        : b;
      const selected = active
        .locator(`.card[data-operation="${tile}"]`)
        .first();
      const cardId = await selected.getAttribute("data-card-id");
      await selected.click();
      if (tile === "transpose")
        await active.locator(".opponent .matrix-target").click();
      else await active.locator(".clock-target").click();
      await expect.poll(() => states.get(a)?.seq).toBeGreaterThan(before.seq);
      const after = states.get(a)!;
      await expect.poll(() => states.get(b)?.seq).toBe(after.seq);
      expect(states.get(b)?.endAt).toBe(after.endAt);
      expect(states.get(b)?.turnEndsAt).toBe(after.turnEndsAt);
      expect(states.get(b)?.players).toEqual(after.players);
      expect(states.get(b)?.cards).toEqual(after.cards);
      expect(after.cards).toHaveLength(4);
      expect(after.cards.some((c) => c.id === cardId)).toBe(false);
      if (tile === "add_match_time_5") {
        expect(after.endAt).toBe(before.endAt + 5000);
        expect(after.active).toBe(1 - before.active);
      } else if (tile === "add_turn_time_5") {
        expect(after.turnEndsAt).toBe(before.turnEndsAt + 5000);
        expect(after.active).toBe(before.active);
      } else if (tile === "sub_turn_time_15") {
        expect(after.lastAction?.type).toBe("TIMEOUT");
        expect(after.active).toBe(before.active);
      } else if (tile === "transpose") {
        const target = 1 - before.active;
        expect(after.players[target].matrix).toEqual(
          before.players[target].matrix[0].map((_, column) =>
            before.players[target].matrix.map((row) => row[column]),
          ),
        );
      } else {
        expect(after.status).toBe("finished");
        expect(after.endAt).toBe(after.lastAction?.at);
      }
      await Promise.all([
        expect(a.locator(".results")).toBeVisible({ timeout: 20000 }),
        expect(b.locator(".results")).toBeVisible({ timeout: 20000 }),
      ]);
      await expect(
        a.getByRole("link", { name: "View match details" }),
      ).toBeVisible();
    }
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("unlocking grows the same shared pool from four to eight in both browsers", async ({
  browser,
}) => {
  await settings(false, false, "unlock_slot");
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    await queue(a, b);
    for (let size = 4; size < 8; size++) {
      for (const p of [a, b]) {
        await expect(p.locator(".cards .card")).toHaveCount(size);
        await expect(
          p.getByText(`SHARED OPERATIONS / ${size}/8`),
        ).toBeVisible();
      }
      const active = (await a
        .locator(".self")
        .evaluate((e) => e.classList.contains("active")))
        ? a
        : b;
      await active.locator('[data-operation="unlock_slot"]').first().click();
      await active
        .getByRole("button", {
          name: `Unlock slot (${size} → ${size + 1})`,
          exact: true,
        })
        .click();
      await expect(active.locator(".turn-banner")).toContainText(
        "OPPONENT’S TURN",
      );
      for (const p of [a, b]) {
        await expect(p.locator(".cards .card")).toHaveCount(size + 1);
        await expect(p.locator(".matrix-panel .score b")).toHaveText([
          "10",
          "10",
        ]);
        await expect(p.locator(".skill")).toHaveCount(0);
      }
      expect(
        await a
          .locator(".card")
          .evaluateAll((cards) =>
            cards.map((c) => c.getAttribute("data-card-id")),
          ),
      ).toEqual(
        await b
          .locator(".card")
          .evaluateAll((cards) =>
            cards.map((c) => c.getAttribute("data-card-id")),
          ),
      );
    }
    for (const p of [a, b]) {
      await expect(p.locator('[data-operation="unlock_slot"]')).toHaveCount(0);
      await expect(p.getByText("SHARED OPERATIONS / 8/8")).toBeVisible();
    }
    await Promise.all(
      [a, b].map((p) =>
        expect(p.locator(".results")).toBeVisible({ timeout: 30000 }),
      ),
    );
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("admin lists all tile descriptions and saves decimal rarity weights", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    p = await context.newPage();
  try {
    await login(p, "admin1@mathrix.app");
    await p.goto("/admin");
    await p.getByRole("button", { name: "Game balance", exact: true }).click();
    await expect(p.locator(".tile-list tbody tr")).toHaveCount(
      operationIds.length,
    );
    const transpose = p.locator('.tile-list tr[data-operation="transpose"]');
    await expect(transpose).toContainText("Exchange rows and columns");
    const rarity = p.getByRole("spinbutton", {
      name: "+15s your turn early rarity weight",
      exact: true,
    });
    await rarity.fill("0.2");
    const midRarity = p.getByRole("spinbutton", {
      name: "+15s your turn mid rarity weight",
      exact: true,
    });
    const lateRarity = p.getByRole("spinbutton", {
      name: "+15s your turn late rarity weight",
      exact: true,
    });
    await midRarity.fill("0.3");
    await lateRarity.fill("0");
    await p
      .getByRole("button", { name: "Save game balance", exact: true })
      .click();
    await expect(
      p.getByText(
        "Settings saved. Existing matches retain their original rules.",
      ),
    ).toBeVisible();
    await p.reload();
    await p.getByRole("button", { name: "Game balance", exact: true }).click();
    await expect(rarity).toHaveValue("0.2");
    await expect(midRarity).toHaveValue("0.3");
    await expect(lateRarity).toHaveValue("0");
    expect(
      await p
        .locator(".tile-list tbody tr")
        .evaluateAll((rows) =>
          rows.every((row) => row.querySelector("td")!.textContent!.length > 0),
        ),
    ).toBe(true);
  } finally {
    await context.close();
    await admin.post("/api/admin/settings", {
      data: original,
      headers: { Origin: origin },
    });
  }
});
test("two registered browsers play, synchronize, finish, persist history and update rating", async ({
  browser,
}) => {
  await settings(false);
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    const beforeA = await (
        await ca.request.get(origin + "/api/profile")
      ).json(),
      beforeB = await (await cb.request.get(origin + "/api/profile")).json();
    await queue(a, b);
    await sameMatrices(a, b);
    const active = (await a
      .locator(".matrix-panel.self")
      .evaluate((e) => e.classList.contains("active")))
      ? a
      : b;
    await active.locator(".card").first().click();
    await active.locator(".self .cell").first().click();
    await sameMatrices(a, b);
    await a.screenshot({
      path: `${process.env.E2E_ARTIFACT_DIR || "test-results"}/game-desktop.png`,
      fullPage: true,
    });
    await Promise.all([
      expect(a.locator(".results")).toBeVisible({ timeout: 20000 }),
      expect(b.locator(".results")).toBeVisible({ timeout: 20000 }),
    ]);
    await expect(
      a.getByRole("link", { name: "View match details" }),
    ).toBeVisible();
    const afterA = await (await ca.request.get(origin + "/api/profile")).json(),
      afterB = await (await cb.request.get(origin + "/api/profile")).json();
    expect(afterA.played).toBe(beforeA.played + 1);
    expect(afterB.played).toBe(beforeB.played + 1);
    expect(afterA.rating + afterB.rating).toBe(beforeA.rating + beforeB.rating);
    expect(afterA.rating).not.toBe(beforeA.rating);
    expect(afterA.history[0].rated).toBe(true);
    await a.getByRole("link", { name: "View match details" }).click();
    await expect(
      a.getByRole("heading", { name: "Event history" }),
    ).toBeVisible();
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("guest house ads happen before the clock, guest ranked games save ratings, mobile remains usable", async ({
  browser,
}) => {
  await settings(true);
  const ca = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    cb = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage();
  try {
    for (const p of [a, b]) {
      await p.goto("/");
      await p
        .getByRole("button", { name: "Play as Guest", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Ranked mode" }),
      ).toBeVisible();
    }
    await a.getByRole("button", { name: "Ranked mode" }).click();
    await b.getByRole("button", { name: "Ranked mode" }).click();
    await Promise.all([
      expect(a.locator(".house-ad")).toBeVisible(),
      expect(b.locator(".house-ad")).toBeVisible(),
    ]);
    await expect(
      a.getByText("Your game clock has not started.", { exact: false }),
    ).toBeVisible();
    await Promise.all([
      expect(a.locator(".game")).toBeVisible({ timeout: 15000 }),
      expect(b.locator(".game")).toBeVisible({ timeout: 15000 }),
    ]);
    await sameMatrices(a, b);
    expect(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await a.screenshot({
      path: `${process.env.E2E_ARTIFACT_DIR || "test-results"}/game-mobile.png`,
      fullPage: true,
    });
    await expect(a.locator(".results")).toBeVisible({ timeout: 20000 });
    await expect(
      a.getByText("Your rank, stats and history are saved.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      a.getByRole("link", { name: "View match details" }),
    ).toBeVisible();
    await a.getByRole("link", { name: "View match details" }).click();
    await expect(a.getByText("Ranked / RATED", { exact: false })).toBeVisible();
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("growth uses missed-turn totals, passes immediately and survives reconnect", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const states = new Map<Page, PublicGame>();
  for (const p of [a, b])
    p.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        const frame = String(payload);
        if (!frame.startsWith("42")) return;
        const [event, data] = JSON.parse(frame.slice(2));
        if (event === "update") states.set(p, data);
        else if (event === "matched") states.set(p, data.game);
      }),
    );
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    for (const tile of ["add_row", "add_column"] as const) {
      await settings(false, false, tile);
      await Promise.all([a.goto("/play"), b.goto("/play")]);
      await queue(a, b);
      const before = states.get(a)!;
      const actor = before.active;
      const active = (await a
        .locator(".self")
        .evaluate((e) => e.classList.contains("active")))
        ? a
        : b;
      const opponent = active === a ? b : a;
      await expect(
        active.locator(`[data-operation="${tile}"] .tile-description`).first(),
      ).toContainText("filled with 0");
      await expect
        .poll(() => states.get(a)?.players[actor].destroyedTiles, {
          timeout: 10000,
        })
        .toBe(2);
      const timeout = states.get(a)!;
      expect(timeout.lastAction?.type).toBe("TIMEOUT");
      expect(timeout.lastAction?.data.destroyed).toHaveLength(2);
      expect(
        timeout.cards.filter((c) =>
          before.cards.some((old) => old.id === c.id),
        ),
      ).toHaveLength(2);
      expect(timeout.players[1 - actor].destroyedTiles).toBe(0);
      await opponent.locator(`[data-operation="${tile}"]`).first().click();
      await opponent.locator(".self .matrix-target").click();
      await expect(active.locator(".turn-banner")).toContainText("YOUR TURN");
      const line = (p: Page) =>
        tile === "add_row"
          ? p.locator(".self .matrix-row").last().locator(".cell")
          : p.locator(".self .matrix-row .cell:last-child");
      await expect(line(opponent)).toHaveText(["0", "0"]);
      await expect(
        active.locator(`[data-operation="${tile}"] .tile-description`).first(),
      ).toContainText("filled with 2");
      await active.locator(`[data-operation="${tile}"]`).first().click();
      await active.locator(".self .matrix-target").click();
      await expect(line(active)).toHaveText(["2", "2"]);
      await expect(opponent.locator(".turn-banner")).toContainText("YOUR TURN");
      await expect(active.locator(".skill")).toHaveCount(0);
      expect(states.get(a)).not.toHaveProperty("minigame");
      await sameMatrices(a, b);
      await active.reload();
      await expect(active.locator(".game")).toBeVisible();
      await expect(line(active)).toHaveText(["2", "2"]);
      expect(states.get(active)?.players[actor].destroyedTiles).toBe(2);
      await sameMatrices(a, b);
      await expect(a.locator(".results")).toBeVisible({ timeout: 25000 });
      await expect(b.locator(".results")).toBeVisible();
    }
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("admin documentation works and guest/ordinary users cannot access admin APIs", async ({
  browser,
}) => {
  await settings(false);
  const c = await browser.newContext(),
    p = await c.newPage();
  try {
    await p.goto("/admin");
    await expect(
      p.getByRole("heading", { name: "Administrator access required" }),
    ).toBeVisible();
    expect((await c.request.get(origin + "/api/admin/overview")).status()).toBe(
      403,
    );
    await login(p, "admin1@mathrix.app");
    await p.goto("/admin");
    await expect(
      p.getByRole("heading", { name: "Administration" }),
    ).toBeVisible();
    const configuration = await (await admin.get("/api/admin/settings")).json();
    configuration.ads.houseDurationMs = 2500;
    expect(
      (
        await admin.post("/api/admin/settings", {
          data: configuration,
          headers: { Origin: origin },
        })
      ).ok(),
    ).toBe(true);
    await p.reload();
    await p.getByRole("button", { name: "Advertising", exact: true }).click();
    await expect(p.getByLabel("Duration (ms)", { exact: true })).toHaveValue(
      "2500",
    );
    await p.getByRole("button", { name: "New campaign", exact: true }).click();
    await expect(p.getByLabel("Duration (ms)", { exact: true })).toHaveValue(
      "2500",
    );
    await p.getByRole("link", { name: "Documentation ↗" }).click();
    await expect(
      p.getByRole("heading", { name: "How Mathrix works" }),
    ).toBeVisible();
    await expect(p.locator(".documentation")).toContainText(
      "Single-use shields",
    );
    await p.goto("/");
    await p.screenshot({
      path: "test-results/landing-desktop.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});

test("existing house campaigns can be edited and disabled", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const p = await context.newPage();
  const name = `Campaign edit regression ${Date.now()}`;
  try {
    await login(p, "admin2@mathrix.app");
    await p.goto("/admin");
    await p.getByRole("button", { name: "Advertising", exact: true }).click();
    const form = p.locator("form");
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form
      .getByLabel("Headline", { exact: true })
      .fill("Original headline");
    await form.getByLabel("Body", { exact: true }).fill("Campaign body");
    await form
      .getByLabel("Destination url", { exact: true })
      .fill("https://example.com/");
    await form.getByLabel("Cta", { exact: true }).fill("Learn more");
    const save = () =>
      p.waitForResponse(
        (r) =>
          r.url().endsWith("/api/admin/campaigns") &&
          r.request().method() === "POST",
      );
    let response = save();
    await form.getByRole("button", { name: "Save campaign" }).click();
    expect((await response).ok()).toBe(true);
    const row = p.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await form.getByLabel("Headline", { exact: true }).fill("Updated headline");
    await form.getByLabel("Active", { exact: true }).uncheck();
    response = save();
    await form.getByRole("button", { name: "Save campaign" }).click();
    expect((await response).ok()).toBe(true);
    await expect(row).toContainText("Disabled");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(form.getByLabel("Headline", { exact: true })).toHaveValue(
      "Updated headline",
    );
    await expect(form.getByLabel("Active", { exact: true })).not.toBeChecked();
  } finally {
    const campaigns = await (await admin.get("/api/admin/campaigns")).json();
    const campaign = campaigns.find((c: { name: string }) => c.name === name);
    if (campaign) {
      const { created_at: _, impressions: __, clicks: ___, ...data } = campaign;
      void _;
      void __;
      void ___;
      await admin.post("/api/admin/campaigns", {
        data: { ...data, active: false },
        headers: { Origin: origin },
      });
    }
    await context.close();
  }
});

async function h5Settings(testMode = true, pregameWaitMs = 15000) {
  const c = structuredClone(original);
  c.balance.matchMs = 10000;
  Object.assign(c.ads, {
    enabled: true,
    pregame: true,
    mode: "EXTERNAL_PROVIDER",
    admins: true,
    guests: true,
    registered: true,
    everyN: 1,
    cooldownMinutes: 0,
    pregameWaitMs,
    testMode,
  });
  expect(
    (
      await admin.post("/api/admin/settings", {
        data: c,
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
}

async function googleSdk(p: Page, behavior: string, consent = "accepted") {
  await p.route("**/pagead/js/adsbygoogle.js?*", (route) =>
    behavior === "blocked"
      ? route.abort("blockedbyclient")
      : route.fulfill({
          contentType: "application/javascript",
          body: `
        const behavior = ${JSON.stringify(behavior)}, consent = ${JSON.stringify(consent)};
        const pending = window.adsbygoogle || [];
        window.__h5_calls = 0;
        window.__h5_preloads = 0;
        function consume(o) {
          if (o.onReady) {
            window.__h5_preloads++;
            if (behavior === 'delayed') window.__h5_ready = o.onReady;
            else setTimeout(o.onReady, 0);
          }
          if (o.type) {
            window.__h5_calls++;
            window.__h5_type = o.type;
            if (behavior === 'unavailable') {
              o.adBreakDone({breakStatus:'noAdPreloaded'});
              return;
            }
            o.beforeAd();
            window.__h5_finish = () => { o.afterAd(); o.adBreakDone({breakStatus:'viewed'}); };
            if (behavior !== 'long') window.__h5_finish();
          }
        }
        window.adsbygoogle = {push:consume};
        const fc = window.googlefc;
        if (fc) {
          window.__tcfapi = (command, version, cb) => cb({
            gdprApplies:true,
            eventStatus:consent === 'unresolved' ? 'cmpuishown' : 'tcloaded',
            purpose:{consents:{1:consent === 'accepted'}},
            vendor:{consents:{755:consent === 'accepted'}}
          }, true);
          fc.showRevocationMessage = () => { window.__h5_privacyOpened = true; };
          const entries = fc.callbackQueue || [];
          fc.callbackQueue = {push:e => Object.values(e).forEach(fn => fn())};
          entries.forEach(e => fc.callbackQueue.push(e));
        }
        pending.forEach(consume);
      `,
        }),
  );
}

async function adCalls(p: Page) {
  return p.evaluate(() =>
    Number((window as unknown as Record<string, unknown>).__h5_calls || 0),
  );
}

for (const behavior of [
  "long",
  "blocked",
  "unavailable",
  "delayed",
  "refresh",
]) {
  test(`H5 ${behavior}: minimum wait, synchronized start and one placement per match`, async ({
    browser,
  }) => {
    await h5Settings();
    const ca = await browser.newContext(),
      cb = await browser.newContext();
    const a = await ca.newPage(),
      b = await cb.newPage();
    try {
      await googleSdk(a, behavior);
      await googleSdk(b, "unavailable");
      for (const p of [a, b]) {
        await p.goto("/play");
        await p.getByRole("button", { name: "Play as guest" }).click();
        await expect(
          p.getByRole("button", { name: "Ranked mode" }),
        ).toBeVisible();
      }
      const started = Date.now();
      await a.getByRole("button", { name: "Ranked mode" }).click();
      await b.getByRole("button", { name: "Ranked mode" }).click();
      await expect(a.locator(".pregame")).toBeVisible();
      await expect(
        a.getByText("Google test ad", { exact: false }),
      ).toBeVisible();
      if (behavior === "long") {
        await expect(a.getByText("Advertisement in progress…")).toBeVisible();
        // Finish initial chunk loads before testing an established connection interruption.
        await a.waitForLoadState("networkidle");
        await ca.setOffline(true);
        await a.waitForTimeout(500);
        await ca.setOffline(false);
        await a.waitForTimeout(15500);
        await expect(a.locator(".pregame")).toBeVisible();
        await expect(b.locator(".pregame")).toBeVisible();
        expect(await adCalls(a)).toBe(1);
        await a.evaluate(() =>
          (window as unknown as { __h5_finish: () => void }).__h5_finish(),
        );
      } else if (behavior === "refresh") {
        await expect.poll(() => adCalls(a)).toBe(1);
        await a.waitForTimeout(8000);
        await a.reload();
        await expect(a.locator(".pregame")).toBeVisible();
        await expect(a.getByRole("status")).toHaveText(
          /Getting ready in [1-8]s/,
        );
      } else {
        await a.waitForTimeout(6000);
        await expect(a.locator(".pregame")).toBeVisible();
      }
      await Promise.all([
        expect(a.locator(".game")).toBeVisible({ timeout: 20000 }),
        expect(b.locator(".game")).toBeVisible({ timeout: 20000 }),
      ]);
      expect(Date.now() - started).toBeGreaterThanOrEqual(18000);
      expect(await adCalls(a)).toBe(
        ["blocked", "delayed", "refresh"].includes(behavior) ? 0 : 1,
      );
      if (behavior === "refresh")
        expect(Date.now() - started).toBeLessThan(24000);
      await sameMatrices(a, b);
      if (behavior === "delayed") {
        await a.evaluate(() =>
          (window as unknown as { __h5_ready: () => void }).__h5_ready(),
        );
        expect(await adCalls(a)).toBe(0);
        await Promise.all([
          expect(a.locator(".results")).toBeVisible({ timeout: 15000 }),
          expect(b.locator(".results")).toBeVisible({ timeout: 15000 }),
        ]);
        await a.getByRole("button", { name: "Play again ↗" }).click();
        await b.getByRole("button", { name: "Play again ↗" }).click();
        await expect.poll(() => adCalls(a)).toBe(1);
        await Promise.all([
          expect(a.locator(".game")).toBeVisible({ timeout: 20000 }),
          expect(b.locator(".game")).toBeVisible({ timeout: 20000 }),
        ]);
      }
    } finally {
      await ca.close();
      await cb.close();
    }
  });
}

for (const consent of ["accepted", "denied", "unresolved"]) {
  test(`H5 live consent ${consent} gates preloading and placement`, async ({
    browser,
  }) => {
    await h5Settings(false, 1000);
    const ca = await browser.newContext(),
      cb = await browser.newContext();
    const a = await ca.newPage(),
      b = await cb.newPage();
    try {
      await googleSdk(a, "unavailable", consent);
      await googleSdk(b, "unavailable", consent);
      for (const p of [a, b]) {
        await p.goto("/play");
        await p.getByRole("button", { name: "Play as guest" }).click();
        await expect(
          p.getByRole("button", { name: "Ranked mode" }),
        ).toBeVisible();
      }
      await queue(a, b);
      expect(await adCalls(a)).toBe(consent === "accepted" ? 1 : 0);
      expect(
        await a.evaluate(() =>
          Number(
            (window as unknown as Record<string, unknown>).__h5_preloads || 0,
          ),
        ),
      ).toBe(consent === "accepted" ? 1 : 0);
      await a.goto("/settings");
      await expect(
        a.getByRole("button", { name: "Privacy and cookie settings" }),
      ).toBeEnabled();
      await a
        .getByRole("button", { name: "Privacy and cookie settings" })
        .click();
      expect(
        await a.evaluate(
          () =>
            (window as unknown as Record<string, unknown>).__h5_privacyOpened,
        ),
      ).toBe(true);
    } finally {
      await ca.close();
      await cb.close();
    }
  });
}

test("casual x2 keeps rating, saves stats and repeats the same speed", async ({
  browser,
}) => {
  await settings(false);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    for (const p of pages) {
      await p.goto("/play");
      await p
        .getByRole("button", { name: "Play as guest", exact: true })
        .click();
      for (const name of [
        "Casual mode",
        "Ranked mode",
        "Create room",
        "Join room",
      ])
        await expect(
          p.getByRole("button", { name, exact: true }),
        ).toBeVisible();
      await p.getByRole("button", { name: "Casual mode", exact: true }).click();
      await expect(p.getByRole("button", { name: /^x1.5/ })).toBeVisible();
      await expect(p.getByRole("button", { name: /^x3/ })).toBeVisible();
      await p.getByRole("button", { name: /^x2/ }).click();
    }
    for (const p of pages) {
      await expect(p.locator(".game")).toBeVisible();
      await expect(p.locator(".live-dot")).toContainText("Casual · x2");
    }
    await expect(pages[0].locator(".results")).toBeVisible({ timeout: 30000 });
    await expect(
      pages[0].getByRole("link", { name: "View match details" }),
    ).toBeVisible();
    const profile = await (
      await contexts[0].request.get("/api/profile")
    ).json();
    expect(profile.rating).toBe(1000);
    expect(profile.played).toBe(1);
    expect(profile.history[0]).toMatchObject({
      mode: "casual",
      speed: 2,
      rated: false,
    });
    await pages[0].getByRole("button", { name: "Play again ↗" }).click();
    await expect(
      pages[0].getByText("Casual · x2", { exact: true }),
    ).toBeVisible();
    await pages[0].getByRole("button", { name: "Cancel search" }).click();
    await expect(
      pages[0].getByRole("button", { name: "Casual mode", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("guest code restores on another device and imports during email signup", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  try {
    const a = await ca.newPage(),
      b = await cb.newPage();
    await a.goto("/play");
    await a.getByRole("button", { name: "Play as guest", exact: true }).click();
    await a.getByText("Your guest user code", { exact: true }).click();
    await expect(a.getByLabel("User code", { exact: true })).not.toHaveValue(
      "",
    );
    const code = await a.getByLabel("User code", { exact: true }).inputValue();
    const guest = await (await ca.request.get("/api/me")).json();
    await b.goto("/auth");
    await b.getByText("Use guest code", { exact: true }).click();
    await b.getByLabel("Guest user code", { exact: true }).fill(code);
    await b.getByRole("button", { name: "Restore guest" }).click();
    await expect(b).toHaveURL(/\/play$/);
    expect((await (await cb.request.get("/api/me")).json()).id).toBe(guest.id);
    await b
      .locator("main")
      .getByRole("link", { name: "Create account", exact: true })
      .click();
    await b.getByLabel("Import guest user code (optional)").fill(code);
    await b.getByLabel("Username").fill(`Former-${Date.now()}`);
    await b
      .getByLabel("Email", { exact: true })
      .fill(`guest-import-${Date.now()}@example.invalid`);
    await b
      .getByLabel("Password", { exact: true })
      .fill("guest-import-browser-password");
    await b
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(b).toHaveURL(/\/play$/);
    const account = await (await cb.request.get("/api/me")).json();
    await expect(b.getByLabel(`Account: ${account.name}`)).toBeVisible();
    expect(account.registered).toBe(true);
    const restore = await ca.request.post("/api/guest/restore", {
      data: { code },
      headers: { Origin: origin },
    });
    expect(restore.ok()).toBe(false);
    await b.goto("/profile");
    await expect(
      b.getByRole("heading", { name: account.name, exact: true }),
    ).toBeVisible();
    await expect(
      b.getByText("Your guest user code", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await ca.close();
    await cb.close();
  }
});

for (const kind of ["guest", "registered"] as const) {
  test(`Vs AI ${kind}: ads, legal play, reconnect, history and unchanged statistics`, async ({
    browser,
  }) => {
    test.setTimeout(90000);
    await settings(true);
    const context = await browser.newContext({
      viewport:
        kind === "guest"
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    try {
      if (kind === "guest") {
        await page.goto("/play");
        await page
          .getByRole("button", { name: "Play as guest", exact: true })
          .click();
      } else await login(page, "admin2@mathrix.app");
      const profile = async () =>
        (await context.request.get("/api/profile")).json();
      const before = await profile();
      await chooseMode(page, "Vs AI");
      const speed = kind === "guest" ? "2" : "1.5";
      await expect(page.getByLabel("Game speed")).toHaveValue("1");
      await expect(page.getByLabel("Game speed").locator("option")).toHaveCount(
        4,
      );
      await page.getByLabel("Game speed").selectOption(speed);
      await page
        .getByRole("button", { name: "Play vs AI", exact: true })
        .click();
      await expect(page.locator(".house-ad")).toBeVisible();
      await expect(
        page.getByText("Your game clock has not started.", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".game")).toBeVisible({ timeout: 15000 });
      await expect(page.locator(".live-dot")).toContainText(
        `Vs AI · x${speed} · Unranked`,
      );
      await expect(page.locator(".opponent .player-name")).toHaveText(
        "Mathrix AI",
      );
      await expect(page.locator(".self")).toHaveClass(/active/, {
        timeout: 7000,
      });
      await page.locator('[data-operation="add_cell"]').first().click();
      await page.locator(".self .cell.legal").first().click();
      await page.reload();
      await expect(page.locator(".game")).toBeVisible();
      await expect(page.locator(".live-dot")).toContainText(
        `Vs AI · x${speed}`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole("link", { name: "View match details" }),
      ).toBeVisible();
      const after = await profile();
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
        expect(after[key]).toBe(before[key]);
      expect(after.history[0]).toMatchObject({
        mode: "ai",
        speed: Number(speed),
        rated: false,
        opponent: "Mathrix AI",
      });
      const details = await (
        await context.request.get(`/api/matches/${after.history[0].id}`)
      ).json();
      expect(
        details.events.some(
          (e: { type: string; data: { actor: number } }) =>
            e.type === "OPERATION" && e.data.actor === 0,
        ),
      ).toBe(true);
      expect(
        details.events.some(
          (e: { type: string; data: { actor: number } }) =>
            e.type === "OPERATION" && e.data.actor === 1,
        ),
      ).toBe(true);
      if (kind === "guest") {
        await page.getByRole("button", { name: "Play again ↗" }).click();
        await expect(page.locator(".game")).toBeVisible({ timeout: 15000 });
        await expect(page.locator(".live-dot")).toContainText(
          `Vs AI · x${speed}`,
        );
        await expect(page.locator(".results")).toBeVisible({ timeout: 30000 });
        await page
          .getByRole("button", { name: "Back to modes", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Vs AI", exact: true }),
        ).toBeVisible();
      } else {
        await page.getByRole("link", { name: "View match details" }).click();
        await expect(page.locator("main .eyebrow")).toContainText(
          `Vs AI · x${speed} / UNRATED`,
        );
      }
      await page.goto("/profile");
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: `Vs AI · x${speed}` })
          .first(),
      ).toContainText("Mathrix AI");
    } finally {
      await context.close();
    }
  });
}

test("both players see synchronized game stages, including after reconnect", async ({
  browser,
}) => {
  await settings(false);
  const config = await (await admin.get("/api/admin/settings")).json();
  config.balance.matchMs = 24000;
  expect(
    (
      await admin.post("/api/admin/settings", {
        data: config,
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
  const ca = await browser.newContext(),
    cb = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    await queue(a, b);
    for (const stage of gameStages) {
      await Promise.all(
        [a, b].map((p) =>
          expect(p.getByLabel("Game stage")).toHaveText(
            `${stage.toUpperCase()} STAGE`,
            { timeout: 10000 },
          ),
        ),
      );
      if (stage === "mid") {
        await b.reload();
        await expect(b.getByLabel("Game stage")).toHaveText("MID STAGE");
      }
    }
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await Promise.all(
      [a, b].map((p) =>
        expect(p.locator(".results")).toBeVisible({ timeout: 10000 }),
      ),
    );
  } finally {
    await ca.close();
    await cb.close();
    await admin.post("/api/admin/settings", {
      data: original,
      headers: { Origin: origin },
    });
  }
});

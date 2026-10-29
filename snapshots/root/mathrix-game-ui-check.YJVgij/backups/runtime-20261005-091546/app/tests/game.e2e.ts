import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { operationIds, type Balance, type AdConfig } from "../lib/config";
import type { OperationId, PublicGame } from "../lib/engine";
let admin: APIRequestContext, original: { balance: Balance; ads: AdConfig };
const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
async function login(p: Page, email: string) {
  await p.goto("/auth");
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill("amdin");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByRole("button", { name: "Quick Play ↗" })).toBeVisible();
}
async function queue(a: Page, b: Page) {
  await a.getByRole("button", { name: "Quick Play ↗" }).click();
  await expect(a.getByText("Searching for opponent…")).toBeVisible();
  await b.getByRole("button", { name: "Quick Play ↗" }).click();
  await Promise.all([
    expect(a.locator(".game")).toBeVisible({ timeout: 20000 }),
    expect(b.locator(".game")).toBeVisible({ timeout: 20000 }),
  ]);
}
async function sameMatrices(a: Page, b: Page) {
  const snapshot = (p: Page) =>
    p.locator(".matrix-panel").evaluateAll((panels) =>
      panels
        .map((panel) => ({
          name: panel.querySelector("h2")!.textContent,
          cells: [...panel.querySelectorAll(".cell")].map((c) => c.textContent),
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    );
  await expect
    .poll(
      async () =>
        JSON.stringify(await snapshot(a)) === JSON.stringify(await snapshot(b)),
    )
    .toBe(true);
}
async function settings(enabled: boolean, grow = false, tile?: OperationId) {
  const c = structuredClone(original);
  c.balance.matchMs = 10000;
  c.balance.weights = Object.fromEntries(
    Object.keys(c.balance.weights).map((id) => [
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
  ) as Balance["weights"];
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
test("eight tiles synchronize clock changes and Transpose across both browsers", async ({
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
      await expect(a.locator(".card")).toHaveCount(8);
      await expect(b.locator(".card")).toHaveCount(8);
      await expect(a.getByText("SHARED OPERATIONS / 08")).toBeVisible();
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
      expect(after.cards).toHaveLength(8);
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
      name: "+15s your turn rarity weight",
      exact: true,
    });
    await rarity.fill("0.2");
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
test("guest house ads happen before the clock, guest games stay unrated, mobile remains usable", async ({
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
      await p.getByRole("button", { name: "Play as guest" }).click();
      await expect(
        p.getByRole("button", { name: "Quick Play ↗" }),
      ).toBeVisible();
    }
    await a.getByRole("button", { name: "Quick Play ↗" }).click();
    await b.getByRole("button", { name: "Quick Play ↗" }).click();
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
      a.getByText("Guest games are unrated.", { exact: false }),
    ).toBeVisible();
    await expect(
      a.getByRole("link", { name: "View match details" }),
    ).toBeVisible();
    await a.getByRole("link", { name: "View match details" }).click();
    await expect(
      a.getByText("MATCH / UNRATED", { exact: false }),
    ).toBeVisible();
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("reflex growth has server-issued targets and preserves a hit after a miss", async ({
  browser,
}) => {
  await settings(false, true);
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "admin1@mathrix.app");
    await login(b, "admin2@mathrix.app");
    await queue(a, b);
    const active = (await a
      .locator(".self")
      .evaluate((e) => e.classList.contains("active")))
      ? a
      : b;
    await active.locator('.card[data-operation="add_row"]').first().click();
    await active.locator(".self .matrix-target").click();
    await expect(active.locator(".skill-target")).toHaveText("3");
    await active.waitForTimeout(150);
    await active.locator(".skill-target").click();
    await expect(active.locator(".skill-target")).toHaveText("4");
    await sameMatrices(a, b);
    await expect(active.locator(".skill")).not.toBeVisible({ timeout: 3000 });
    expect(await active.locator(".self .matrix-row").count()).toBe(3);
    await expect(a.locator(".results")).toBeVisible({ timeout: 20000 });
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
          p.getByRole("button", { name: "Quick Play ↗" }),
        ).toBeVisible();
      }
      const started = Date.now();
      await a.getByRole("button", { name: "Quick Play ↗" }).click();
      await b.getByRole("button", { name: "Quick Play ↗" }).click();
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
          p.getByRole("button", { name: "Quick Play ↗" }),
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

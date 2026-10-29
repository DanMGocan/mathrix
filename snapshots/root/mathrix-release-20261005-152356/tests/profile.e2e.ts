import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect, type BrowserContext } from "@playwright/test";
import type { PublicGame } from "../lib/engine";

const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
const isolated = Boolean(
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname.includes("_test_"),
);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(() => db.end());
async function signup(context: BrowserContext) {
  const handle = `Robot-${randomUUID().slice(0, 8)}`;
  const response = await context.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: {
      name: handle,
      handle,
      email: `${handle}@example.invalid`,
      password: "profile-browser-test-password",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).user as { id: string; username: string };
}
async function premium(id: string) {
  await db.query(
    "INSERT INTO billing(user_id,status,paid_until) VALUES($1,'active',now()+interval '1 month')",
    [id],
  );
}

test("profile gallery, public location and unique handles persist on mobile", async ({
  page,
  context,
}) => {
  await signup(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();
  const username = `Euler-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("City (optional)", { exact: true }).fill("Berlin");
  await page.getByRole("combobox").selectOption("DE");
  await page.getByRole("radio", { name: "Robot 12", exact: true }).check();
  await page.screenshot({
    path: "/tmp/mathrix-profile-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("h1 .player-name")).toHaveText(username);
  await expect(page.locator("h1 .player-location")).toContainText(
    "Berlin, Germany",
  );
  await expect(page.locator("h1 img")).toHaveAttribute(
    "src",
    "/avatars/robot-12.svg",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: /Get Premium/ }),
  ).toBeDisabled();
  const forbidden = await context.request.post("/api/profile", {
    headers: { Origin: origin },
    data: {
      username,
      city: "Berlin",
      countryCode: "DE",
      avatarId: "robot-12",
      premium: true,
    },
  });
  expect(forbidden.status()).toBe(400);
});

for (const tiers of [
  [true, true],
  [true, false],
  [false, false],
]) {
  test(`pregame ads and synchronized start: ${tiers.map((p) => (p ? "Premium" : "Free")).join(" / ")}`, async ({
    browser,
  }) => {
    test.skip(
      !isolated,
      "Billing fixtures require the isolated system-test database.",
    );
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
    ]);
    const admin = await browser.newContext();
    let original: unknown;
    const users: { id: string }[] = [];
    try {
      const login = await admin.request.post("/api/auth/sign-in/email", {
        headers: { Origin: origin },
        data: { email: "admin1@mathrix.app", password: "amdin" },
      });
      expect(login.ok()).toBe(true);
      original = await (await admin.request.get("/api/admin/settings")).json();
      const settings = structuredClone(original) as {
        balance: Record<string, unknown>;
        ads: Record<string, unknown>;
      };
      Object.assign(settings.balance, { matchMs: 10000 });
      Object.assign(settings.ads, {
        enabled: true,
        pregame: true,
        mode: "HOUSE_ADS",
        registered: true,
        everyN: 1,
        cooldownMinutes: 0,
        maxWaitMs: 5000,
      });
      expect(
        (
          await admin.request.post("/api/admin/settings", {
            headers: { Origin: origin },
            data: settings,
          })
        ).ok(),
      ).toBe(true);
      const pages = await Promise.all(contexts.map((c) => c.newPage()));
      const reserved: {
        game: PublicGame;
        ad: { kind: string; durationMs: number };
        readyAt: number;
      }[][] = [[], []];
      const starts: number[][] = [[], []];
      const adsRequested = [0, 0];
      for (let i = 0; i < 2; i++) {
        const user = await signup(contexts[i]);
        users.push(user);
        if (tiers[i]) await premium(user.id);
        pages[i].on("request", (r) => {
          if (r.url().includes("googlesyndication")) adsRequested[i]++;
        });
        pages[i].on("websocket", (ws) =>
          ws.on("framereceived", ({ payload }) => {
            const value = String(payload);
            if (!value.startsWith("42")) return;
            const [event, data] = JSON.parse(value.slice(2));
            if (event === "reserved") reserved[i].push(data);
            if (event === "update" && data.status === "countdown")
              starts[i].push(data.startedAt);
          }),
        );
        await pages[i].goto("/play");
        await expect(
          pages[i].getByRole("button", { name: "Ranked mode", exact: true }),
        ).toBeVisible();
      }
      await pages[0]
        .getByRole("button", { name: "Ranked mode", exact: true })
        .click();
      await expect(pages[0].getByText("Searching for opponent…")).toBeVisible();
      await pages[1]
        .getByRole("button", { name: "Ranked mode", exact: true })
        .click();
      await expect.poll(() => reserved.every((r) => r.length > 0)).toBe(true);
      if (tiers[0] && !tiers[1]) {
        await expect(
          pages[0].getByRole("article", { name: "Math fun facts" }),
        ).toBeVisible();
        await pages[0].getByRole("button", { name: "Next fact" }).click();
        await expect(
          pages[0].getByRole("heading", { name: "A shortcut to 5,050" }),
        ).toBeVisible();
        await pages[0].getByRole("button", { name: "Pause cards" }).click();
        await pages[0].screenshot({
          path: "/tmp/mathrix-premium-facts.png",
          fullPage: true,
        });
      }
      for (let i = 0; i < 2; i++) {
        expect(reserved[i][0].ad.kind).toBe(tiers[i] ? "none" : "house");
        if (tiers[i]) {
          expect(reserved[i][0].ad.durationMs).toBe(0);
          expect(adsRequested[i]).toBe(0);
        }
      }
      await Promise.all(
        pages.map((p) =>
          expect(p.locator(".game")).toBeVisible({ timeout: 20000 }),
        ),
      );
      expect(starts[0][0]).toBe(starts[1][0]);
      expect(starts[0][0]).toBeGreaterThan(0);
      for (const p of pages) {
        await expect(
          p.getByRole("article", { name: "Math fun facts" }),
        ).toHaveCount(0);
        await expect(p.locator(".matrix-panel .is-premium")).toHaveCount(
          tiers.filter(Boolean).length,
        );
      }
      const premiumIds = users.filter((_, i) => tiers[i]).map((u) => u.id);
      expect(
        (
          await db.query(
            "SELECT 1 FROM ad_impressions WHERE player_id=ANY($1::text[])",
            [premiumIds],
          )
        ).rowCount,
      ).toBe(0);
      await Promise.all(
        pages.map((p) =>
          expect(p.getByRole("button", { name: "Play again ↗" })).toBeVisible({
            timeout: 20000,
          }),
        ),
      );
    } finally {
      if (original)
        await admin.request.post("/api/admin/settings", {
          headers: { Origin: origin },
          data: original,
        });
      await Promise.all([...contexts, admin].map((c) => c.close()));
      for (const user of users)
        await db.query('DELETE FROM "user" WHERE id=$1', [user.id]);
    }
  });
}

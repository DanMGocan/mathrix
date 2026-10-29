import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Me } from "../lib/client";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
const password = "session-browser-test-password";
async function signup(context: BrowserContext, name = "Session Player") {
  const email = `session-${randomUUID()}@example.invalid`;
  const create = () =>
    context.request.post("/api/auth/sign-up/email", {
      data: { email, name, password },
      headers: { Origin: origin },
    });
  let result = await create();
  if (result.status() === 429 && result.headers()["x-retry-after"]) {
    await setTimeout(Number(result.headers()["x-retry-after"]) * 1000 + 100);
    result = await create();
  }
  expect(result.ok()).toBe(true);
  return (await (await context.request.get("/api/me")).json()) as Me;
}
async function refresh(page: Page) {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/me",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}

test("session signup, navigation, reload, restored cookies and practice keep the account", async ({
  page,
  context,
  browser,
}) => {
  const email = `session-${randomUUID()}@example.invalid`;
  await page.goto("/auth");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Username").fill(`Session-${Date.now()}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
  const player: Me = await (await context.request.get("/api/me")).json();
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  await expect(page.getByLabel(`Account: ${player.name}`)).toBeVisible();
  await page.locator(".brand").click();
  await expect(
    page.locator("main").getByRole("link", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Play as guest$/i }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .locator("main")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: player.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  const token = (await context.cookies()).find((c) =>
    c.name.endsWith("session_token"),
  )!;
  expect(token.httpOnly).toBe(true);
  expect(token.sameSite).toBe("Lax");
  expect(token.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86400);
  const restored = await browser.newContext({
    storageState: await context.storageState(),
  });
  try {
    const reopened = await restored.newPage();
    await reopened.goto(origin);
    await expect(
      reopened
        .locator("main")
        .getByRole("link", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(reopened.getByLabel(`Account: ${player.name}`)).toBeHidden();
    await reopened.goto(`${origin}/profile`);
    await expect(
      reopened.getByRole("heading", { name: player.name, exact: true }),
    ).toBeVisible();
  } finally {
    await restored.close();
  }
  await page.goto("/play?mode=practice");
  await expect(page.locator(".game")).toBeVisible();
  await expect(page.getByLabel(`Account: ${player.name}`)).toBeHidden();
  expect((await (await context.request.get("/api/me")).json()).id).toBe(
    player.id,
  );
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "Back to Play", exact: true }).click();
  await expect(page.getByLabel(`Account: ${player.name}`)).toBeVisible();
  await page.goto("/auth?room=ABC234");
  await expect(page).toHaveURL(/\/play\?room=ABC234$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  let newSockets = 0;
  page.on("websocket", () => ++newSockets);
  await refresh(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  expect(newSockets).toBe(0);
  await page.getByLabel(`Account: ${player.name}`).click();
  await expect(
    page
      .locator(".account-menu")
      .getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Play as guest$/i }),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("link", { name: "Sign In", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel(`Account: ${player.name}`)).toBeVisible();
  await expect(page).toHaveURL(/\/play$/);
});

test("session mobile admin menu, logout failure and logout in another tab", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("admin2@mathrix.app");
  await page.getByLabel("Password", { exact: true }).fill("amdin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  const { name } = await (await context.request.get("/api/me")).json();
  await page.locator(".brand").click();
  await page
    .locator("main")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  const menu = page.locator(".account-menu");
  await page.getByLabel(`Account: ${name}`).click();
  for (const label of ["Profile", "Preferences", "Admin"])
    await expect(
      menu.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel(`Account: ${name}`)).toBeFocused();
  await expect(menu).not.toHaveAttribute("open");
  await page.getByLabel(`Account: ${name}`).click();
  await menu.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toHaveCount(0);
  await expect(page.getByLabel(`Account: ${name}`)).toBeVisible();
  const other = await context.newPage();
  await other.goto("/profile");
  await expect(other.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByLabel(`Account: ${name}`).click();
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await menu.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(menu.getByRole("alert")).toContainText("Could not sign out");
  await expect(page.getByLabel(`Account: ${name}`)).toBeVisible();
  await page.unroute("**/api/auth/sign-out");
  await menu.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Play as guest$/i }),
  ).toBeVisible();
  await other.bringToFront();
  await refresh(other);
  await expect(
    other.locator("nav").getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    other.locator("main").getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await other.close();
});

test("session loading and transient errors never claim an authenticated player is signed out", async ({
  page,
  context,
}) => {
  const player = await signup(context);
  for (const path of ["/", "/play", "/profile"]) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/me", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(path);
    await expect(page.locator("main").getByRole("status")).toContainText(
      "Checking session",
    );
    await expect(page.getByRole("link", { name: /Sign in/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Play as guest$/i }),
    ).toHaveCount(0);
    release();
    if (path === "/") {
      await expect(
        page
          .locator("main")
          .getByRole("link", { name: "Profile", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(`Account: ${player.name}`)).toBeHidden();
    } else
      await expect(page.getByLabel(`Account: ${player.name}`)).toBeVisible();
    if (path === "/profile")
      await expect(
        page.getByRole("heading", { name: player.name, exact: true }),
      ).toBeVisible();
    await page.unroute("**/api/me");
  }
  await expect(
    page.getByRole("heading", { name: player.name, exact: true }),
  ).toBeVisible();
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await refresh(page);
  await expect(
    page.getByRole("button", { name: "Retry session" }),
  ).toBeVisible();
  await expect(page.getByLabel(`Account: ${player.name}`)).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in/i })).toHaveCount(0);
  await page.unroute("**/api/me");
  await page.getByRole("button", { name: "Retry session" }).click();
  await expect(page.getByRole("button", { name: "Retry session" })).toHaveCount(
    0,
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry profile" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in/i })).toHaveCount(0);
  await page.unroute("**/api/profile");
  await page.getByRole("button", { name: "Retry profile" }).click();
  await expect(
    page.getByRole("heading", { name: player.name, exact: true }),
  ).toBeVisible();
});

test("session account switching and revocation reset play without retaining the old player", async ({
  page,
  context,
}) => {
  const first = await signup(context, "First Player");
  await page.goto("/play");
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  await context.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: origin },
  });
  const second = await signup(context, "Second Player");
  expect(second.id).not.toBe(first.id);
  await refresh(page);
  await expect(page.getByLabel(`Account: ${second.name}`)).toBeVisible();
  await expect(page.locator(".queue-screen .eyebrow")).toContainText(
    second.name,
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  await context.request.post("/api/auth/sign-out", {
    data: {},
    headers: { Origin: origin },
  });
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Enter the matrix" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Play as guest$/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Play as guest$/i }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to play" }),
  ).toBeVisible();
  const guest = await (await context.request.get("/api/me")).json();
  expect(guest.registered).toBe(false);
  await expect(page.locator(".queue-screen .eyebrow")).toContainText(
    guest.name,
  );
  await expect(
    page.locator("nav").getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

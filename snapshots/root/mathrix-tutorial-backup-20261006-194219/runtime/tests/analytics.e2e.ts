import { browserSession } from "./auth-fixture";
import { test, expect } from "@playwright/test";
import type { AnalyticsResponse } from "../lib/analytics";

test("admin analytics polls independently, changes range, handles empty/stale data and preserves settings", async ({
  page,
}) => {
  await browserSession(page.context(), {
    email: "admin1@mathrix.app",
    role: "ADMIN",
  });
  const real = await page.request.get("/api/admin/analytics");
  expect(real.ok(), await real.text()).toBe(true);
  const data: AnalyticsResponse = await real.json();
  data.firstSampleAt = null;
  data.series = [];
  data.summary = {};
  data.gameplay = {
    matches: 0,
    players: 0,
    anonymousSeats: 0,
    averageMs: null,
    normal: 0,
    draws: 0,
    disconnected: 0,
    interrupted: 0,
    other: 0,
    breakdown: [],
    series: [],
  };
  let requests = 0,
    fail = false;
  const ranges: string[] = [];
  await page.route("**/api/admin/analytics*", async (route) => {
    requests++;
    const range = new URL(route.request().url()).searchParams.get("range")!;
    ranges.push(range);
    await route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { error: "Analytics are temporarily unavailable" }
        : { ...data, range },
    });
  });
  await page.goto("/admin");
  await expect(
    page.getByText("Registered users", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Game balance", exact: true }).click();
  const balance = page.getByLabel("Match Ms", { exact: true });
  await expect(balance).toBeVisible();
  await balance.fill("54321");
  await page.clock.install();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Server performance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No played matches ended in this period."),
  ).toBeVisible();
  const firstRequests = requests;
  await page.clock.fastForward(11000);
  await expect.poll(() => requests).toBeGreaterThan(firstRequests);
  await expect(
    page.getByRole("button", { name: "Refresh analytics" }),
  ).toBeEnabled();
  await page.getByLabel("Analytics period").selectOption("7d");
  await expect.poll(() => ranges.at(-1)).toBe("7d");
  await expect(
    page.getByRole("button", { name: "Refresh analytics" }),
  ).toBeEnabled();
  const at = Math.floor(Date.now() / 60000) * 60000 - 120000;
  data.from = at - 60000;
  data.to = at + 120000;
  data.bucketMs = 60000;
  data.firstSampleAt = at;
  data.series = [10, 20].map((value, i) => ({
    at: at + i * 60000,
    metrics: { cpu_percent: { count: 1, mean: value, max: value, p95: null } },
  }));
  await page.getByRole("button", { name: "Refresh analytics" }).click();
  await expect(page.getByRole("img", { name: /^CPU usage\./ })).toBeVisible();
  await page.getByText("View cpu usage data", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "20%", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  fail = true;
  await page.getByRole("button", { name: "Refresh analytics" }).click();
  await expect(page.locator(".analytics").getByRole("alert")).toContainText(
    "values may be stale",
  );
  await expect(page.getByRole("img", { name: /^CPU usage\./ })).toBeVisible();
  await page.getByRole("button", { name: "Game balance", exact: true }).click();
  await expect(balance).toHaveValue("54321");
  const stopped = requests;
  await page.clock.fastForward(30000);
  expect(requests).toBe(stopped);
});

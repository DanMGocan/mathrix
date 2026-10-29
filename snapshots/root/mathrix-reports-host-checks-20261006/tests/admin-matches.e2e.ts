import { test, expect } from "@playwright/test";

test("match inspection shows and copies full IDs with clipboard failure feedback", async ({
  page,
  context,
}, testInfo) => {
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  const login = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "admin1@mathrix.app", password: "amdin" },
    headers: { Origin: origin },
  });
  expect(login.ok()).toBe(true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const ids = [
    "12345678-1234-4321-8765-123456789000",
    "12345678-1234-4321-8765-123456789001",
  ];
  await page.route("**/api/admin/matches?*", (route) =>
    route.fulfill({
      json: ids.map((id) => ({
        id,
        ended_at: "2026-10-06T12:00:00Z",
        rated: true,
        reason: "normal",
        duration_ms: 60000,
      })),
    }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Matches", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Match ID" }),
  ).toBeVisible();
  for (const id of ids) {
    const row = page.getByRole("row").filter({ hasText: id });
    await expect(row.getByRole("cell").first()).toContainText(id);
    await expect(row.getByRole("link")).toHaveAttribute(
      "href",
      `/matches/${id}`,
    );
    await row.getByRole("button", { name: `Copy match ID ${id}` }).click();
    await expect(page.getByRole("status")).toHaveText("Match ID copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
  }
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new DOMException("Clipboard access denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: `Copy match ID ${ids[0]}` }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Could not copy. Select the match ID and copy it manually.",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("matches-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("matches-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

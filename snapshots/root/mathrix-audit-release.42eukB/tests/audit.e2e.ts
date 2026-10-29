import { expect, test } from "@playwright/test";

test("Audit is private, reachable from the dashboard and readable on phones", async ({
  page,
}) => {
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  await page.goto("/admin/audit");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Audit", exact: true }),
  ).toHaveCount(0);
  async function expectPrivateResponses() {
    for (const [path, privateText] of [
      ["/admin/audit", "HOUSE_ADS"],
      ["/admin/docs", "How Mathrix works"],
    ]) {
      for (const isRSC of [false, true]) {
        const denied = await page.request.get(path, {
          headers: isRSC ? { RSC: "1" } : undefined,
        });
        if (isRSC)
          expect(denied.headers()["content-type"]).toContain(
            "text/x-component",
          );
        expect(await denied.text()).not.toContain(privateText);
      }
    }
  }
  await expectPrivateResponses();

  expect(
    (
      await page.request.post("/api/guest", {
        data: {},
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expectPrivateResponses();

  await page.context().clearCookies();
  const login = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "admin1@mathrix.app", password: "amdin" },
    headers: { Origin: origin },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Audit", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(
    page.getByRole("heading", { name: "Audit", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("6 October 2026");
  await expect(page.locator("main")).toContainText("HOUSE_ADS");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`audit-${width}.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: test.info().outputPath(`audit-${width}-top.png`),
    });
  }
  await page.getByRole("link", { name: /Admin dashboard/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/docs");
  await expect(
    page.getByRole("heading", { name: "How Mathrix works" }),
  ).toBeVisible();
  await expect(page.locator("pre.documentation")).not.toBeEmpty();
});

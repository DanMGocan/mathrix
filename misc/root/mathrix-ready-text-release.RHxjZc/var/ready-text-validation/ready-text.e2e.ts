import { test, expect } from "@playwright/test";

test("Ready to play selected text stays white on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Play as guest", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ready to play" })).toBeVisible();
  const selected = page.getByRole("button", { name: "Casual mode", exact: true });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(selected).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(selected.locator("small")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.getByRole("button", { name: "Ranked mode" }).locator("small")).toHaveCSS("color", "rgb(101, 114, 122)");
    await selected.hover();
    await expect(selected.locator("small")).toHaveCSS("color", "rgb(255, 255, 255)");
    await selected.focus();
    await expect(selected).toBeFocused();
    await expect(selected.locator("small")).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.screenshot({ path: test.info().outputPath(`ready-text-${viewport.width}.png`) });
  }
});

import { expect, test } from "@playwright/test";

test("legal pages are public and reachable from the footer on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    for (const [label, path] of [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
    ]) {
      const link = page
        .locator("footer")
        .getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", path);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page).toHaveTitle(`${label} | Mathrix`);
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
      await expect(page.locator("article h2")).toHaveCount(10);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
    }
  }
});

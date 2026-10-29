import { expect, test } from "@playwright/test";

test("public pages share the landing light theme and footer", async ({
  page,
}) => {
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    let landingFooter = "";
    for (const path of [
      "/",
      "/auth",
      "/play",
      "/how-to-play",
      "/leaderboard",
      "/settings",
      "/privacy",
      "/terms",
    ]) {
      await page.goto(path);
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await expect(page.locator("body")).toHaveCSS("color", "rgb(11, 25, 33)");
      const links = await footer.locator("a").evaluateAll((elements) =>
        elements.map((element) => ({
          href: element.getAttribute("href"),
          label: element.getAttribute("aria-label") || element.textContent,
          color: getComputedStyle(element).color,
        })),
      );
      expect(links).toHaveLength(5);
      if (path === "/") landingFooter = JSON.stringify(links);
      else expect(JSON.stringify(links)).toBe(landingFooter);
      await expect(footer).toHaveCSS(
        "padding",
        width === 390 ? "16px 20px" : "30px 48px",
      );
    }
  }
});

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

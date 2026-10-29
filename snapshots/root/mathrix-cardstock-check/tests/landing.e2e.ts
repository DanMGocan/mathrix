import { expect, test } from "@playwright/test";

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["laptop", { width: 1280, height: 720 }],
  ["phone", { width: 390, height: 844 }],
  ["small-phone", { width: 360, height: 640 }],
  ["landscape", { width: 844, height: 390 }],
] as const) {
  test(`landing ${name}: design, actions and footer fit the screen`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/me", (route) => route.fulfill({ json: null }));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Mathrix", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".landing-tagline")).toHaveText(
      "Competitive math game.… this says all.",
    );
    await expect(page.locator(".nav")).toBeHidden();
    await expect(
      page.locator(".landing-actions .button, .landing-actions button"),
    ).toHaveText(["Sign In", "Play as Guest", "How to Play"]);
    await expect(
      page.getByRole("link", { name: "Sign In", exact: true }),
    ).toHaveAttribute("href", "/auth");
    await expect(
      page.getByRole("link", { name: "How to Play", exact: true }),
    ).toHaveAttribute("href", "/how-to-play");
    const footer = page.locator("footer");
    for (const [label, href] of [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Contact Mathrix", "mailto:contact@mathrix.app"],
      ["Reddit", "https://www.reddit.com/r/mathrix/"],
      ["Discord", "https://discord.gg/y5x6RXMva8"],
    ]) {
      const link = footer.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
    await expect(footer.getByRole("link", { name: /LinkedIn/i })).toHaveCount(
      0,
    );
    const fit = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      controls: [
        ...document.querySelectorAll<HTMLElement>(
          ".landing-actions .button, .landing-actions button, .footer-social a",
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .every((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.x >= 0 && r.right <= innerWidth && r.width >= 40 && r.height >= 40
          );
        }),
    }));
    expect(fit.width).toBeLessThanOrEqual(fit.viewport);
    expect(fit.controls).toBe(true);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Sign In", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath(`landing-${name}.png`),
      fullPage: true,
    });
  });
}

test("landing keeps a registered session and restores the normal shell on other pages", async ({
  page,
}) => {
  const me = {
    id: "landing-player",
    name: "Landing player",
    registered: true,
    role: "USER",
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.goto("/");
  await expect(page.locator(".landing-actions .button")).toHaveText([
    "Profile",
    "Play",
    "How to Play",
  ]);
  await expect(
    page.getByRole("button", { name: "Play as Guest", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("href", "/profile");
  await expect(
    page.getByRole("link", { name: "Play", exact: true }),
  ).toHaveAttribute("href", "/play");
  await page.getByRole("link", { name: "How to Play", exact: true }).click();
  await expect(page.locator(".nav")).toBeVisible();
  await expect(page.getByLabel("Account: Landing player")).toBeVisible();
  await expect(
    page
      .locator("footer")
      .getByRole("link", { name: "Preferences", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: "Reddit", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Practice mode", exact: true }),
  ).toHaveAttribute("href", "/play?mode=practice");
  await page.locator(".brand").click();
  await expect(page.locator(".nav")).toBeHidden();
  await expect(page.locator(".landing-actions .button")).toHaveText([
    "Profile",
    "Play",
    "How to Play",
  ]);
});

test("landing guest creation disables duplicate submissions and recovers from failure", async ({
  page,
}) => {
  let me: {
    id: string;
    name: string;
    registered: boolean;
    role: string;
  } | null = null;
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/guest", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ status: 503, json: { error: "Please try again." } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play as Guest", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entering…", exact: true }),
  ).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.locator(".landing-error")).toHaveText("Please try again.");
  await expect(
    page.getByRole("button", { name: "Play as Guest", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/guest");
  await page.route("**/api/guest", (route) => {
    me = {
      id: "landing-guest",
      name: "Guest",
      registered: false,
      role: "USER",
    };
    return route.fulfill({ json: me });
  });
  await page
    .getByRole("button", { name: "Play as Guest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
});

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
    const logo = page.getByRole("img", { name: "Mathrix", exact: true });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", "/logo_digital.png");
    await expect(page.locator(".nav")).toBeHidden();
    await expect(
      page.locator(".landing-actions > a, .landing-actions > button"),
    ).toHaveText(["Sign in", "Play as guest"]);
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveAttribute("href", "/auth");
    await expect(page.locator(".landing-symbols")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(page.locator(".landing-symbols span")).toHaveCount(12);
    await expect(page.locator(".landing-symbols span").first()).toHaveCSS(
      "animation-name",
      "float-symbol",
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator("body")).toHaveCSS(
      "font-family",
      "Poppins, system-ui, sans-serif",
    );
    const guest = page.getByRole("button", {
      name: "Play as guest",
      exact: true,
    });
    await expect(guest).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(guest).toHaveCSS("border-width", "0px");
    expect(
      await logo.evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(1445);
    const logoBounds = await logo.boundingBox();
    expect(logoBounds).not.toBeNull();
    expect(
      Math.abs(logoBounds!.x + logoBounds!.width / 2 - viewport.width / 2),
    ).toBeLessThan(1);
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
          ".landing-actions > a, .landing-actions > button, .footer-social a",
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .every((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight &&
            r.width >= 40 &&
            r.height >= 40
          );
        }),
    }));
    expect(fit.width).toBeLessThanOrEqual(fit.viewport);
    expect(fit.controls).toBe(true);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".landing-symbols span").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.screenshot({
      path: test.info().outputPath(`landing-${name}.png`),
      fullPage: true,
    });
    await guest.click();
    const dialog = page.getByRole("dialog", {
      name: "Do you have a Guest profile code?",
    });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`guest-prompt-${name}.png`),
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
  await expect(page.locator(".landing-actions > a")).toHaveText([
    "Profile",
    "Play",
  ]);
  await expect(
    page.getByRole("button", { name: "Play as guest", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("href", "/profile");
  await expect(
    page.getByRole("link", { name: "Play", exact: true }),
  ).toHaveAttribute("href", "/play");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.locator(".nav")).toBeVisible();
  await expect(page.getByLabel("Account: Landing player")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".nav")).toHaveCSS(
    "font-family",
    "Poppins, system-ui, sans-serif",
  );
  await page.getByRole("link", { name: "How to play", exact: true }).click();
  await expect(
    page
      .locator("footer")
      .getByRole("link", { name: "Preferences", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("footer").getByRole("link", { name: "Reddit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Practice mode", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".howto-grid article").last().locator("p").last(),
  ).toContainText("Practice mode is also available on the Play page");
  await page.locator(".brand").click();
  await expect(page.locator(".nav")).toBeHidden();
  await expect(page.locator(".landing-actions > a")).toHaveText([
    "Profile",
    "Play",
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
    .getByRole("button", { name: "Play as guest", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Do you have a Guest profile code?",
  });
  expect(requests).toBe(0);
  await dialog.getByRole("button", { name: "Play without a code" }).click();
  await expect(
    dialog.getByRole("button", { name: "Entering…", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Continue progress" }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Guest profile code")).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(dialog.getByRole("alert")).toHaveText("Please try again.");
  await expect(
    dialog.getByRole("button", { name: "Play without a code", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/guest");
  await page.route("**/api/guest", (route) => {
    me = {
      id: "landing-guest",
      name: "Guest",
      registered: false,
      role: "GUEST",
    };
    return route.fulfill({ json: me });
  });
  await dialog
    .getByRole("button", { name: "Play without a code", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
});

test("guest prompt cancels safely and restores progress from landing and an invitation", async ({
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
  let creates = 0;
  const codes: string[] = [];
  await page.route("**/api/guest", (route) => {
    creates++;
    return route.fulfill({
      status: 400,
      json: { error: "Unexpected creation" },
    });
  });
  await page.route("**/api/guest/restore", (route) => {
    const { code } = route.request().postDataJSON();
    codes.push(code);
    if (code === "invalid")
      return route.fulfill({
        status: 400,
        json: { error: "Invalid or unavailable guest code" },
      });
    me = {
      id: "restored-guest",
      name: "Recovered guest",
      registered: false,
      role: "GUEST",
    };
    return route.fulfill({ json: me });
  });
  for (const start of ["/", "/play?room=ABC234"]) {
    me = null;
    await page.goto(start);
    const opener = page.getByRole("button", {
      name: "Play as guest",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "Do you have a Guest profile code?",
    });
    const previousAttempts = codes.length;
    await opener.click();
    await expect(dialog.getByLabel("Guest profile code")).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(codes.length).toBe(previousAttempts);
    expect(creates).toBe(0);
    await opener.click();
    await dialog.getByLabel("Guest profile code").fill("invalid");
    await dialog.getByRole("button", { name: "Continue progress" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Invalid or unavailable guest code",
    );
    expect(me).toBeNull();
    await expect(dialog.getByLabel("Guest profile code")).toHaveValue(
      "invalid",
    );
    await dialog
      .getByLabel("Guest profile code")
      .fill("  saved-profile-code  ");
    await dialog.getByRole("button", { name: "Continue progress" }).click();
    await expect(page).toHaveURL(
      start === "/" ? /\/play$/ : /\/play\?room=ABC234$/,
    );
    await expect(
      page.getByRole("link", { name: "Guest profile", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".queue-screen p").filter({ hasText: "Recovered guest" }),
    ).toBeVisible();
    expect(codes.slice(previousAttempts)).toEqual([
      "invalid",
      "saved-profile-code",
    ]);
    expect(creates).toBe(0);
  }
});

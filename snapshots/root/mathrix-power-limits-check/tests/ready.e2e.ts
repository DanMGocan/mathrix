import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { defaultBalance, speeds, type QueueCounts } from "../lib/config";

async function readyPage(page: Page, invitation = "") {
  const commands: [string, { mode?: string; speed?: number; code?: string }][] =
    [];
  let socket: WebSocketRoute;
  const counts: QueueCounts = {
    ranked: 2,
    casual: { 1: 0, 1.5: 1, 2: 3, 3: 4 },
  };
  const publish = (event: string, data: unknown) =>
    socket.send(`42${JSON.stringify([event, data])}`);
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        id: "ready-player",
        name: "Ready player",
        registered: true,
        role: "USER",
      },
    }),
  );
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: { ...defaultBalance, currentRank: 12 } }),
  );
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    socket = ws;
    ws.send(
      `0${JSON.stringify({ sid: "ready", upgrades: [], pingInterval: 600000, pingTimeout: 600000 })}`,
    );
    ws.onMessage((message) => {
      const frame = String(message);
      if (frame === "40") {
        ws.send('40{"sid":"ready"}');
        publish("queue_counts", counts);
      } else if (frame.startsWith("42")) {
        const [event, data] = JSON.parse(frame.slice(2));
        commands.push([event, data]);
        if (event === "queue") publish("queued", data);
        if (event === "cancel") publish("cancelled", null);
      }
    });
  });
  await page.goto(`/play${invitation ? `?room=${invitation}` : ""}`);
  await expect(
    page.getByRole("button", { name: "Ranked mode", exact: true }),
  ).toBeEnabled();
  return { commands, publish, disconnect: () => socket.close() };
}

test("Ready to play groups speeds, timing, live queues, rank and practice on desktop and phone", async ({
  page,
}) => {
  const { publish, disconnect } = await readyPage(page);
  await expect(page.locator(".mode-group > h2")).toHaveText([
    "Ranked",
    "Casual mode",
    "Play vs the AI",
    "Private Rooms",
    "Practice mode",
  ]);
  await expect(page.locator(".current-rank")).toHaveText(
    "Your current rank: #12",
  );
  for (const speed of speeds) {
    for (const mode of ["Casual", "Play vs AI"]) {
      const tile = page.getByRole("button", {
        name: `${mode} x${speed}`,
        exact: true,
      });
      await expect(tile).toContainText(`Match duration: ${120 * speed}s`);
      await expect(tile).toContainText(
        `Turn duration starts at ${6 * speed}s and shrink to 3s`,
      );
    }
  }
  await expect(
    page.getByRole("button", { name: "Casual x1.5", exact: true }),
  ).toContainText("1 player in queue");
  await expect(
    page.getByRole("button", { name: "Casual x1", exact: true }),
  ).toContainText("0 players in queue");
  await expect(page.locator(".mode-queue")).toHaveCount(5);
  publish("queue_counts", { ranked: 1, casual: { 1: 5, 1.5: 0, 2: 0, 3: 0 } });
  await expect(
    page.getByRole("button", { name: "Ranked mode", exact: true }),
  ).toContainText("1 player in queue");
  await expect(
    page.getByRole("button", { name: "Casual x1", exact: true }),
  ).toContainText("5 players in queue");
  const practice = page.getByRole("region", {
    name: "Practice mode",
    exact: true,
  });
  await expect(practice).toContainText("without match or turn time limits");
  await expect(practice).toContainText("Time-changing tiles are excluded");
  const link = practice.getByRole("link", {
    name: "Practice mode",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "/play?mode=practice");
  expect(
    await practice
      .locator("p")
      .evaluate((p) =>
        Boolean(
          p.compareDocumentPosition(p.parentElement!.querySelector("a")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("#casual-heading + p + .mode-grid")).toHaveCSS(
      "grid-template-columns",
      width > 480 ? /\S+ \S+/ : /^\S+$/,
    );
    await page.screenshot({
      path: test.info().outputPath(`ready-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Ranked mode", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "Ranked mode", exact: true }),
  ).toHaveCSS("outline-style", "solid");
  disconnect();
  await expect(page.locator(".mode-queue")).toHaveText(
    Array(5).fill("Queue unavailable"),
  );
  await expect(
    page.getByRole("button", { name: "Casual x1", exact: true }),
  ).toBeDisabled();
});

test("Ready speed tiles dispatch directly, cancel back to groups and refresh rank", async ({
  page,
}) => {
  const { commands } = await readyPage(page);
  await page.getByRole("button", { name: "Casual x1", exact: true }).click();
  await expect(page.getByText("Casual · x1", { exact: true })).toBeVisible();
  expect(commands.at(-1)).toEqual([
    "queue",
    { mode: "casual", speed: 1, consent: false },
  ]);
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: { ...defaultBalance, currentRank: 8 } }),
  );
  await page
    .getByRole("button", { name: "Cancel search", exact: true })
    .click();
  await expect(page.locator(".current-rank")).toHaveText(
    "Your current rank: #8",
  );
  await page
    .getByRole("button", { name: "Play vs AI x3", exact: true })
    .click();
  await expect
    .poll(() => commands.at(-1))
    .toEqual(["ai_start", { speed: 3, consent: false }]);
});

test("Private-room forms stay inline and invitation codes are prefilled", async ({
  page,
}) => {
  const { commands } = await readyPage(page, "ABC234");
  const join = page.getByRole("form", { name: "Join a private room" });
  await expect(join.getByLabel("Room code")).toHaveValue("ABC234");
  await expect(page.locator(".mode-group")).toHaveCount(5);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(join).toHaveCount(0);
  const create = page.getByRole("form", { name: "Create a private room" });
  await create.getByLabel("Room speed").selectOption("2");
  await create
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect
    .poll(() => commands.at(-1))
    .toEqual(["room_create", { speed: 2, consent: false }]);
});

test("Rank displays missing statistics and unavailable data without blocking play", async ({
  page,
}) => {
  await readyPage(page);
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: { ...defaultBalance, currentRank: null } }),
  );
  await page.reload();
  await expect(page.locator(".current-rank")).toHaveText(
    "Your current rank: Unranked",
  );
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.reload();
  await expect(page.locator(".current-rank")).toHaveText(
    "Your current rank: Unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Ranked mode", exact: true }),
  ).toBeEnabled();
});

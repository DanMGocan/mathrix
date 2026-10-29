import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  createGame,
  registry,
  startGame,
  publicGame,
  useOperation,
  applyOperation,
  removeRow,
  type Target,
  type OperationId,
} from "../lib/engine";
import { defaultBalance } from "../lib/config";

// Deterministic server snapshots exercise large boards without playing through random growth.
async function keyboardGame(page: Page) {
  const me = {
    id: "keyboard-player",
    name: "Keyboard player",
    registered: true,
    role: "USER",
  };
  const game = createGame(
    "keyboard",
    42,
    [{ ...me, id: "opponent", name: "Opponent" }, me],
    defaultBalance,
  );
  startGame(game, Date.now());
  game.active = 1;
  game.turnEndsAt = game.endAt = Date.now() + 600000;
  for (const p of game.players) {
    p.matrix = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => r * 5 + c + 1),
    );
    p.rowShields = [false, false, false, false, false];
    p.columnShields = [false, false, false, false, false];
  }
  const operations: OperationId[] = [
    "add_row_value",
    "add_column_value",
    "swap_rows",
    "swap_columns",
    "remove_row",
    "row_shield",
    "negate_column",
    "sub_row_value",
  ];
  const cards = operations.map((operation, i) => ({
    id: `key-${i}`,
    operation,
    value: 1,
  }));
  game.cards = structuredClone(cards);
  const actions: Target[] = [];
  let socket: WebSocketRoute;
  const publish = () => {
    game.turnEndsAt = Date.now() + 600000;
    socket.send(`42${JSON.stringify(["update", publicGame(game)])}`);
  };
  await page.route("**/api/me", (route) => route.fulfill({ json: me }));
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/play-options", (route) =>
    route.fulfill({ json: defaultBalance }),
  );
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    socket = ws;
    ws.send(
      `0${JSON.stringify({ sid: "keyboard", upgrades: [], pingInterval: 600000, pingTimeout: 600000, maxPayload: 1000000 })}`,
    );
    ws.onMessage((message) => {
      const frame = String(message);
      if (frame === "40") {
        ws.send('40{"sid":"keyboard"}');
        publish();
      } else if (frame.startsWith("42")) {
        const [event, action] = JSON.parse(frame.slice(2));
        if (event !== "use") return;
        useOperation(
          game,
          1,
          action.cardId,
          action.target,
          action.seq,
          Date.now(),
        );
        actions.push(action.target);
        publish();
      }
    });
  });
  await page.goto("/play");
  await expect(page.locator(".cards .card")).toHaveCount(8);
  return { game, cards, actions, publish, disconnect: () => socket.close() };
}

test("keyboard slots, matrix toggling, swaps and input guards", async ({
  page,
}) => {
  const { game, actions, publish, disconnect } = await keyboardGame(page);
  for (let i = 1; i <= 8; i++) {
    await page.keyboard.press(String(i));
    await expect(page.locator(".card.selected")).toHaveAttribute(
      "data-card-id",
      `key-${i - 1}`,
    );
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("1");
  await expect(page.locator(".self .axis kbd")).toHaveText([
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
  await expect(page.locator(".opponent .axis kbd")).toHaveCount(0);
  await page.keyboard.press("9");
  await page.keyboard.press("Control+0");
  await page
    .locator("body")
    .dispatchEvent("keydown", { key: "0", code: "Digit0", repeat: true });
  await page
    .locator("body")
    .dispatchEvent("keydown", { key: "0", code: "Digit0", isComposing: true });
  for (const tag of ["input", "textarea", "div"]) {
    await page.evaluate((tag) => {
      const input = document.createElement(tag);
      input.id = "shortcut-input";
      if (tag === "div") input.contentEditable = "true";
      document.body.append(input);
      input.focus();
    }, tag);
    await page.keyboard.press("0");
    await page.keyboard.press("Shift");
    await page.locator("#shortcut-input").evaluate((e) => e.remove());
  }
  await expect(page.locator(".shortcut-hint")).toContainText(
    "Targeting your matrix",
  );
  expect(actions).toHaveLength(0);
  await page.keyboard.press("Shift");
  await page
    .locator("body")
    .dispatchEvent("keydown", { key: "Shift", repeat: true });
  await expect(page.locator(".shortcut-hint")).toContainText(
    "opponent’s matrix",
  );
  await expect(page.locator(".self .axis kbd")).toHaveCount(0);
  await expect(page.locator(".opponent .axis kbd")).toHaveText([
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
  await page.keyboard.press("Shift");
  await expect(page.locator(".shortcut-hint")).toContainText(
    "Targeting your matrix",
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("5"); // Offensive tile: no shortcuts on your own matrix.
  await page.keyboard.press("0");
  await expect(page.locator(".axis kbd")).toHaveCount(0);
  expect(actions).toHaveLength(0);
  await page.keyboard.press("Shift");
  await expect(page.locator(".opponent .axis kbd")).toHaveCount(5);
  await page.locator('[data-card-id="key-2"]').click(); // Clicking another tile resets the matrix.
  await expect(page.locator(".shortcut-hint")).toContainText(
    "Targeting your matrix",
  );
  await page.keyboard.press("4");
  await expect(page.locator('.self .axis[aria-keyshortcuts="4"]')).toHaveCount(
    0,
  );
  await page.keyboard.press("4");
  expect(actions).toHaveLength(0);
  await page.keyboard.press("Shift"); // Discard the first swap target.
  await page.keyboard.press("0");
  expect(actions).toHaveLength(0);
  const before = structuredClone(game.players[0].matrix);
  await page.keyboard.press("1");
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ player: 0, row: 1, second: 0 });
  expect(game.players[0].matrix[0]).toEqual(before[1]);
  expect(game.players[0].matrix[1]).toEqual(before[0]);
  await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.keyboard.press("2"); // Opponent's turn.
  await expect(page.locator(".card.selected")).toHaveCount(0);
  game.active = 1;
  publish();
  await expect(page.locator(".turn-banner")).toContainText("YOUR TURN");
  await page.keyboard.press("2");
  await expect(page.locator(".shortcut-hint")).toContainText(
    "Targeting your matrix",
  );
  await page.keyboard.press("Escape");
  disconnect();
  await expect(page.locator(".game-status")).toContainText("Connection lost");
  await page.keyboard.press("1");
  await expect(page.locator(".card.selected")).toHaveCount(0);
});

test("target digits follow rectangular boards, transpose, shields and growth limits", async ({
  page,
}) => {
  const { game, cards, actions, publish } = await keyboardGame(page);
  await page.keyboard.press("2");
  await expect(page.locator(".self .axis kbd")).toHaveText([
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);
  await page.screenshot({
    path: test.info().outputPath("shortcuts-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".card")
      .evaluateAll((cards) =>
        cards.every((card) =>
          [...card.children].every(
            (child) =>
              child.getBoundingClientRect().bottom <=
              card.getBoundingClientRect().bottom,
          ),
        ),
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("shortcuts-mobile.png"),
    fullPage: true,
  });
  await page.keyboard.press("9");
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ player: 1, column: 4 });
  await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");

  game.active = 1;
  game.cards = structuredClone(cards);
  removeRow(game.players[1], 4);
  removeRow(game.players[1], 3);
  publish();
  await expect(page.locator(".self .matrix-row")).toHaveCount(3);
  await page.keyboard.press("2");
  await expect(page.locator(".self .axis kbd")).toHaveText([
    "3",
    "4",
    "5",
    "6",
    "7",
  ]);
  await page.keyboard.press("Shift");
  await expect(page.locator(".opponent .axis kbd")).toHaveText([
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);

  applyOperation(
    game,
    1,
    { id: "transpose", operation: "transpose", value: 1 },
    { player: 1 },
  );
  publish();
  await expect(page.locator(".self .matrix-columns .axis")).toHaveCount(3);
  await page.keyboard.press("2");
  await expect(page.locator(".self .axis kbd")).toHaveText(["5", "6", "7"]);

  game.players[1].rowShields[2] = true;
  game.cards[7] = { id: "no-growth", operation: "add_row", value: 1 };
  publish();
  await expect(page.locator('[data-card-id="no-growth"]')).toBeDisabled();
  await page.keyboard.press("8");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.keyboard.press("6");
  await expect(page.locator(".self .axis kbd")).toHaveText([
    "0",
    "1",
    "3",
    "4",
  ]);
  await page.keyboard.press("2");
  expect(actions).toHaveLength(1);

  removeRow(game.players[1], 4);
  useOperation(game, 1, "no-growth", { player: 1 }, game.seq, Date.now());
  publish();
  await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");
  await page.keyboard.press("1");
  await page.keyboard.press("Shift");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  expect(actions).toHaveLength(1);
});

test("practice shortcuts apply values and pause while help is open", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array[0] = 125;
        return array;
      },
    });
  });
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.clock.install({ time: new Date("2026-10-03T12:00:00Z") });
  await page.goto("/play?mode=practice");
  await expect(page.locator(".card")).toHaveCount(4);
  await page.clock.pauseAt(new Date("2026-10-03T12:01:00Z"));
  await page.keyboard.press("8");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.keyboard.press("2");
  await expect(page.locator(".self .axis kbd")).toHaveText(["0", "1"]);
  await page.getByRole("button", { name: "About +1 row", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Shift");
  await page.keyboard.press("0");
  await expect(page.locator(".self .score b")).toHaveText("10");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".shortcut-hint")).toContainText(
    "Targeting your matrix",
  );
  await page.keyboard.press("0");
  await expect(page.locator(".self .score b")).toHaveText("12");
  await expect(page.locator(".turn-banner")).toContainText(
    "VERY BASIC AI’S TURN",
  );
  await page.keyboard.press("3");
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(page.locator(".results")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.locator(".results")).toBeVisible();
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["laptop", { width: 1280, height: 720 }],
  ["phone", { width: 390, height: 844 }],
  ["small-phone", { width: 360, height: 640 }],
  ["landscape", { width: 844, height: 390 }],
] as const) {
  test(`design ${name}: full boards, readable tiles, scrolling and help`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { game, publish, actions } = await keyboardGame(page);
    game.players[1].name = "LongPlayerName12345678901";
    game.players[1].countryCode = "IE";
    game.players[1].rank = 191;
    game.players[1].played = 61;
    game.players[1].destroyedTiles = 4;
    game.players[0].countryCode = "UA";
    game.players[0].rank = 4;
    game.players[0].played = 8;
    game.players[0].destroyedTiles = 41;
    for (const p of game.players) {
      p.matrix[0][0] = -1000000;
      p.matrix[0][1] = 1000000;
      p.rowShields[3] = Date.now() + 30000;
    }
    const operations: OperationId[] = [
      "add_matrix",
      "add_row_value",
      "remove_column",
      "protect_row_gold",
      "add_row",
      "transpose",
      "unlock_slot",
      "add_cell",
    ];
    game.cards = operations.map((operation, i) => ({
      id: `design-${i}`,
      operation,
      value: 3,
    }));
    publish();
    const assertFit = async () => {
      const issues = await page.evaluate(() => {
        const problems: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(
          ".boards, .matrix-panel, .matrix-wrap, .cell, .pool, .game-status",
        )) {
          const r = el.getBoundingClientRect();
          if (
            r.x < -1 ||
            r.y < -1 ||
            r.right > innerWidth + 1 ||
            r.bottom > innerHeight + 1
          )
            problems.push(`Outside viewport: ${el.className}`);
        }
        for (const el of document.querySelectorAll<HTMLElement>(
          ".matrix-wrap, .cell, .axis",
        )) {
          const panel = el.closest(".matrix-panel")!.getBoundingClientRect(),
            r = el.getBoundingClientRect();
          if (r.bottom > panel.bottom || r.right > panel.right)
            problems.push(`Outside matrix: ${el.className}`);
        }
        for (const cell of document.querySelectorAll<HTMLElement>(
          ".cell, .axis",
        )) {
          const r = cell.getBoundingClientRect();
          if (r.width < 24 || r.height < 24)
            problems.push(`Small target: ${cell.className}`);
        }
        for (const card of document.querySelectorAll<HTMLElement>(".card")) {
          const r = card.getBoundingClientRect();
          for (const child of card.children) {
            const c = child.getBoundingClientRect();
            if (c.top < r.top - 1 || c.bottom > r.bottom + 1)
              problems.push(`Clipped tile text: ${child.textContent}`);
          }
        }
        for (const score of document.querySelectorAll<HTMLElement>(
          ".score b",
        )) {
          if (
            score.getBoundingClientRect().width >
            score.closest(".matrix-heading")!.clientWidth
          )
            problems.push("Score overflows profile");
        }
        for (const value of document.querySelectorAll<HTMLElement>(
          ".cell > span",
        )) {
          if (
            value.getBoundingClientRect().width >
            value.parentElement!.clientWidth
          )
            problems.push(`Clipped value: ${value.textContent}`);
        }
        if (
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight
        )
          problems.push("Page scrolls");
        return problems;
      });
      expect(issues).toEqual([]);
    };
    await expect(page.locator('[data-card-id="design-0"]')).toBeVisible();
    await expect(page.locator(".nav")).toBeHidden();
    await expect(page.locator("footer")).toBeHidden();
    await expect(page.locator(".cell")).toHaveCount(50);
    await assertFit();
    const geometry = await page.locator(".boards").boundingBox();
    await page.keyboard.press("8");
    await expect(page.locator('[data-card-id="design-7"]')).toBeInViewport({
      ratio: 1,
    });
    expect(await page.locator(".boards").boundingBox()).toEqual(geometry);
    await page.keyboard.press("Escape");
    await page.keyboard.press("1");
    await expect(page.locator(".matrix-target")).toHaveCount(2);
    await assertFit();
    await page
      .getByRole("button", { name: "About +3 matrix", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Add 3 to every cell in either matrix.",
    );
    await page.keyboard.press("2");
    expect(actions).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "About +3 matrix", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Rank #191 · Games 61 · Destroyed tiles 4",
    );
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: test.info().outputPath(`design-${name}.png`),
    });
    game.players[1].city = "A very long city name ".repeat(4).slice(0, 80);
    game.players[1].countryCode = "GS";
    game.players[1].matrix.forEach((row) => row.fill(-1000000));
    game.cards = game.cards.slice(0, 4);
    publish();
    await expect(page.locator(".empty-slot")).toHaveCount(4);
    await expect(page.locator(".empty-slot button")).toHaveCount(0);
    await assertFit();
    const allOperations = Object.keys(registry) as OperationId[];
    for (let offset = 0; offset < allOperations.length; offset += 8) {
      game.cards = allOperations
        .slice(offset, offset + 8)
        .map((operation, i) => ({
          id: `all-${offset + i}`,
          operation,
          value: 3,
        }));
      publish();
      await expect(page.locator(".card").first()).toHaveAttribute(
        "data-card-id",
        `all-${offset}`,
      );
      await assertFit();
    }
    game.status = "finished";
    game.result = { scores: [41, 120], winner: 1, reason: "time" };
    publish();
    await expect(page.locator(".results")).toBeVisible();
    await expect(page.locator(".nav")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });
}

test("touch targets and desktop dragging still submit the selected operation", async ({
  browser,
  baseURL,
  page,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const mobile = await context.newPage();
    const { actions } = await keyboardGame(mobile);
    await mobile.locator('[data-card-id="key-0"]').tap();
    await mobile.locator('.self .axis[aria-keyshortcuts="0"]').tap();
    await expect.poll(() => actions.length).toBe(1);
    expect(actions[0]).toEqual({ player: 1, row: 0 });
  } finally {
    await context.close();
  }
  const { actions } = await keyboardGame(page);
  await page
    .locator('[data-card-id="key-0"]')
    .dragTo(page.locator(".self .matrix-row .axis").first());
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ player: 1, row: 0 });
});

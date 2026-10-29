import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  createGame,
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
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(page.locator(".results")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.locator(".results")).toBeVisible();
});

import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  createGame,
  registry,
  startGame,
  publicGame,
  finishGame,
  useOperation,
  skipTurn,
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
    "multiply_row",
    "multiply_column",
    "remove_row",
    "row_shield",
    "negate_column",
    "sub_row_value",
  ];
  const cards = operations.map((operation, i) => ({
    id: `key-${i}`,
    operation,
    value: operation.startsWith("multiply") ? 2 : 1,
  }));
  game.cards = structuredClone(cards);
  const actions: Target[] = [];
  const skips: { matchId: string; seq: number }[] = [];
  const disconnectedAt: (number | null)[] = [null, null];
  let socket: WebSocketRoute;
  const publish = () => {
    game.turnEndsAt = Date.now() + 600000;
    socket.send(
      `42${JSON.stringify(["update", publicGame(game, disconnectedAt)])}`,
    );
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
        if (event === "skip") {
          skips.push(action);
          skipTurn(game, 1, action.seq, Date.now());
          publish();
          return;
        }
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
  return {
    game,
    cards,
    actions,
    skips,
    disconnectedAt,
    publish,
    disconnect: () => socket.close(),
  };
}

test("Skip turn sends the current match and sequence, refreshes tiles and disables out of turn or offline", async ({
  page,
}) => {
  const { game, cards, skips, publish, disconnect } = await keyboardGame(page);
  const skip = page.getByRole("button", { name: "Skip turn", exact: true });
  await expect(skip).toBeEnabled();
  await page.keyboard.press("1");
  await expect(page.locator(".card.selected")).toHaveCount(1);
  const before = structuredClone(game);
  await skip.click();
  await expect(skip).toBeDisabled();
  expect(skips).toEqual([{ matchId: before.id, seq: before.seq }]);
  expect(game.active).toBe(0);
  expect(
    game.cards.filter((c) => cards.some((old) => old.id === c.id)),
  ).toHaveLength(4);
  expect(game.players[1].destroyedTiles).toBe(4);
  expect(game.players[0].destroyedTiles).toBe(0);
  expect(game.players.map((p) => p.matrix)).toEqual(
    before.players.map((p) => p.matrix),
  );
  expect(game.endAt).toBe(before.endAt);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await expect(page.locator(".self .destroyed-total b")).toHaveText("4");
  await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");
  game.active = 1;
  game.seq++;
  publish();
  await expect(skip).toBeEnabled();
  disconnect();
  await expect(page.locator(".game-status")).toContainText("Connection lost");
  await expect(skip).toBeDisabled();
  expect(skips).toHaveLength(1);
});

test("opponent disconnect warning persists until reconnect or match end", async ({
  page,
}) => {
  const { game, disconnectedAt, publish } = await keyboardGame(page);
  const warning = page
    .getByRole("alert")
    .filter({ hasText: "Opponent disconnected" });
  await expect(warning).toHaveCount(0);
  disconnectedAt[1] = Date.now(); // Our own state must not trigger the opponent warning.
  publish();
  await expect(warning).toHaveCount(0);
  disconnectedAt[0] = Date.now();
  for (const status of ["pregame", "countdown", "playing"] as const) {
    game.status = status;
    publish();
    await expect(warning).toBeVisible();
    disconnectedAt[0] = null;
    publish();
    await expect(warning).toHaveCount(0);
    disconnectedAt[0] = Date.now();
  }
  game.active = 0;
  publish();
  await expect(warning).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(warning).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("opponent-disconnected-mobile.png"),
  });
  finishGame(game, Date.now(), "disconnect", 0);
  publish();
  await expect(page.locator(".results")).toBeVisible();
  await expect(warning).toHaveCount(0);
});

test("Protect marks every cell in a row or column and opponent matrix arithmetic skips them", async ({
  page,
}) => {
  const { game, publish } = await keyboardGame(page);
  game.players[0].rowShields[1] = Date.now() + 60000;
  game.players[0].columnShields[3] = Date.now() + 60000;
  game.cards[0] = { id: "protect-attack", operation: "sub_matrix", value: 1 };
  publish();
  const protectedCells = page.locator(".opponent .cell.shielded");
  await expect(protectedCells).toHaveCount(9);
  await expect(protectedCells.first()).toHaveAttribute(
    "aria-label",
    /protected from opponent changes/,
  );
  await page.keyboard.press("1");
  await page.locator(".opponent .matrix-target").click();
  await expect(page.locator(".opponent .cell")).toHaveText([
    "0",
    "1",
    "2",
    "4",
    "4",
    "6",
    "7",
    "8",
    "9",
    "10",
    "10",
    "11",
    "12",
    "14",
    "14",
    "15",
    "16",
    "17",
    "19",
    "19",
    "20",
    "21",
    "22",
    "24",
    "24",
  ]);
  game.active = 1;
  game.cards[0] = {
    id: "protected-cell-attack",
    operation: "negate_cell",
    value: -1,
  };
  publish();
  await expect(
    page.locator('.card[data-card-id="protected-cell-attack"]'),
  ).toBeVisible();
  await page.keyboard.press("1");
  await page.locator(".opponent .cell").nth(3).click();
  await expect(
    page.getByRole("status").filter({ hasText: "opponent change blocked" }),
  ).toBeVisible();
  await expect(page.locator(".opponent .cell").nth(3)).toHaveText("4");
  game.players[0].rowShields[1] = Date.now() - 1;
  publish();
  await expect(protectedCells).toHaveCount(5);
  game.players[0].columnShields[3] = Date.now() - 1;
  publish();
  await expect(protectedCells).toHaveCount(0);
});

test("square-root tile shows shared i, substitutes imaginary results and rounds down", async ({
  page,
}) => {
  const { game, publish } = await keyboardGame(page);
  game.iValue = 7;
  game.players[1].matrix[0][0] = -10;
  game.cards[0] = { id: "root", operation: "sqrt_cell", value: 1 };
  publish();
  await expect(page.getByLabel("Match i value")).toHaveText("i = 7");
  await page.getByRole("button", { name: "About √ cell", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("This match: i = 7");
  await expect(page.getByRole("dialog")).toContainText(
    "Round the complete result down",
  );
  await page.keyboard.press("Escape");
  const before = Number(await page.locator(".self .score b").textContent());
  await page
    .getByRole("button", { name: "Square root cell", exact: true })
    .click();
  await page.locator(".self .cell").first().click();
  await expect(page.locator(".self .cell").first()).toHaveText("22");
  await expect(page.locator(".self .score b")).toHaveText(String(before + 32));
  await expect(page.getByLabel("Match i value")).toHaveText("i = 7");
  expect(game.active).toBe(0);
  await page.reload();
  await expect(page.getByLabel("Match i value")).toHaveText("i = 7");
  await expect(page.locator(".self .cell").first()).toHaveText("22");
});

test("new tiles show titles and descriptions and target either board", async ({
  page,
}) => {
  const { game, publish } = await keyboardGame(page);
  const cases: [OperationId, Target, number[][], number[][]][] = [
    [
      "square_cell",
      { player: 1, row: 0, column: 0 },
      [
        [-3, 2],
        [0, 4],
      ],
      [
        [9, 2],
        [0, 4],
      ],
    ],
    [
      "cube_row",
      { player: 0, row: 0 },
      [
        [-3, 2],
        [0, 4],
      ],
      [
        [-27, 8],
        [0, 4],
      ],
    ],
    [
      "sqrt_column",
      { player: 1, column: 0 },
      [
        [-10, 2],
        [9, 4],
      ],
      [
        [22, 2],
        [3, 4],
      ],
    ],
    [
      "absolute_matrix",
      { player: 0 },
      [
        [-3, -2],
        [0, 4],
      ],
      [
        [3, 2],
        [0, 4],
      ],
    ],
    [
      "factorial_cell",
      { player: 1, row: 0, column: 0 },
      [
        [5, 2],
        [0, 4],
      ],
      [
        [120, 2],
        [0, 4],
      ],
    ],
    [
      "fibonacci_cell",
      { player: 0, row: 0, column: 0 },
      [
        [15, 2],
        [0, 4],
      ],
      [
        [610, 2],
        [0, 4],
      ],
    ],
    [
      "next_prime_cell",
      { player: 1, row: 0, column: 0 },
      [
        [7, 2],
        [0, 4],
      ],
      [
        [11, 2],
        [0, 4],
      ],
    ],
    [
      "previous_prime_cell",
      { player: 0, row: 0, column: 0 },
      [
        [7, 2],
        [0, 4],
      ],
      [
        [5, 2],
        [0, 4],
      ],
    ],
    [
      "reverse_digits_cell",
      { player: 1, row: 0, column: 0 },
      [
        [-120, 2],
        [0, 4],
      ],
      [
        [-21, 2],
        [0, 4],
      ],
    ],
    [
      "determinant_cell",
      { player: 0, row: 0, column: 0 },
      [
        [1, 2],
        [3, 4],
      ],
      [
        [-2, 2],
        [3, 4],
      ],
    ],
  ];
  for (const [operation, target, input, expected] of cases) {
    game.active = 1;
    game.iValue = 7;
    for (const p of game.players) {
      p.matrix = structuredClone(input);
      p.rowShields = [false, false];
      p.columnShields = [false, false];
    }
    game.cards[0] = { id: operation, operation, value: 1 };
    publish();
    const tile = page.locator(`.card[data-operation="${operation}"]`);
    await expect(tile.locator(".tile-title")).toHaveText(
      registry[operation].label,
    );
    await expect(tile.locator(".tile-description")).not.toBeEmpty();
    await tile.locator("..").locator(".tile-help-button").click();
    await expect(page.getByRole("dialog")).toContainText(
      registry[operation].description,
    );
    await page.keyboard.press("Escape");
    await tile.click();
    const board = page.locator(target.player === 1 ? ".self" : ".opponent");
    if (target.row !== undefined && target.column !== undefined)
      await board.locator(".cell.legal").first().click();
    else if (target.row !== undefined)
      await board.locator(".matrix-row .axis.legal").first().click();
    else if (target.column !== undefined)
      await board.locator(".matrix-columns .axis.legal").first().click();
    else await board.locator(".matrix-target.legal").click();
    await expect(board.locator(".cell")).toHaveText(
      expected.flat().map(String),
    );
    await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");
  }
  for (const [operation, value] of [
    ["factorial_cell", 6],
    ["fibonacci_cell", 16],
    ["next_prime_cell", 1000000],
    ["previous_prime_cell", 2],
    ["determinant_cell", 1],
  ] as const) {
    game.active = 1;
    for (const p of game.players) p.matrix = [[value, value]];
    game.cards[0] = { id: operation, operation, value: 1 };
    publish();
    await expect(
      page.locator(`.card[data-operation="${operation}"]`),
    ).toBeDisabled();
  }
});

test("keyboard slots, matrix toggling, row targets and input guards", async ({
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
  await page.keyboard.press("Shift");
  const before = structuredClone(game.players[0].matrix);
  await page.keyboard.press("1");
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ player: 0, row: 1 });
  expect(game.players[0].matrix[0]).toEqual(before[0]);
  expect(game.players[0].matrix[1]).toEqual(before[1].map((n) => n * 2));
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

test("target digits follow rectangular boards, shields and growth limits", async ({
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

  game.players[1].matrix = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) => row * 3 + column),
  );
  game.players[1].rowShields = Array(5).fill(false);
  game.players[1].columnShields = Array(3).fill(false);
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
        array[0] = 72;
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
  ["short-desktop", { width: 1024, height: 700 }],
  ["mid-desktop", { width: 1440, height: 800 }],
  ["phone", { width: 390, height: 844 }],
  ["mid-phone", { width: 390, height: 740 }],
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
      "absolute_matrix",
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
          ".matrix-wrap, .cell, .axis, .matrix-heading > *",
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
            if (
              c.top < r.top - 1 ||
              c.bottom > r.bottom + 1 ||
              c.left < r.left - 1 ||
              c.right > r.right + 1
            )
              problems.push(`Clipped tile text: ${child.textContent}`);
          }
          const slot = card.closest<HTMLElement>(".card-slot")!;
          const marker = slot.querySelector<HTMLElement>(".tile-scope")!;
          const m = marker.getBoundingClientRect();
          if (
            slot.dataset.scope === "row" &&
            (m.width < r.width * 0.7 || m.bottom > r.top + 1)
          )
            problems.push("Row arrow does not span the card's top edge");
          if (
            slot.dataset.scope === "column" &&
            (m.height < r.height * 0.7 || m.right > r.left + 1)
          )
            problems.push("Column arrow does not span the card's left edge");
          const grain = getComputedStyle(card, "::before");
          if (
            grain.backgroundImage === "none" ||
            grain.pointerEvents !== "none"
          )
            problems.push("Card texture is missing or intercepts input");
          const help = slot
            .querySelector<HTMLElement>(".tile-help-button")!
            .getBoundingClientRect();
          for (const child of card.children) {
            // Check text lines rather than their containers' unused space.
            const range = document.createRange();
            range.selectNodeContents(child);
            for (const line of range.getClientRects()) {
              if (
                line.right > help.left &&
                line.left < help.right &&
                line.bottom > help.top &&
                line.top < help.bottom
              )
                problems.push(`Help overlaps tile text: ${child.textContent}`);
            }
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
    if (name === "desktop" || name === "phone") {
      const card = (await page.locator(".card").first().boundingBox())!;
      expect(card.height).toBeGreaterThan(card.width);
    }
    const split = page.locator('[data-card-id="design-0"]');
    const colour = await split.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--card-colour"),
    );
    await split.hover();
    expect(
      await split.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--card-colour"),
      ),
    ).toBe(colour);
    await page.keyboard.press("1");
    await expect(split).toHaveClass(/selected/);
    await page.keyboard.press("Escape");
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
    const cardSize = (await page.locator(".card").first().boundingBox())!;
    const emptySize = (await page
      .locator(".empty-slot")
      .first()
      .boundingBox())!;
    expect(Math.abs(cardSize.width - emptySize.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardSize.height - emptySize.height)).toBeLessThanOrEqual(1);
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

test("clicks and taps play tiles while dragging and dropping do nothing", async ({
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
  const tile = page.locator('[data-card-id="key-0"]');
  const target = page.locator(".self .matrix-row .axis").first();
  expect(
    await tile.evaluate((button) => (button as HTMLButtonElement).draggable),
  ).toBe(false);
  await expect(tile).toHaveCSS("cursor", "pointer");
  await tile.dragTo(target);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  expect(actions).toHaveLength(0);
  await tile.click();
  await target.dispatchEvent("drop");
  await expect(tile).toHaveClass(/selected/);
  expect(actions).toHaveLength(0);
  await target.click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ player: 1, row: 0 });
});

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
  await expect(skip).toHaveAttribute("aria-keyshortcuts", "Q");
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

test("Q skips a selected tile and obeys text, dialog, modifier and turn guards", async ({
  page,
}) => {
  const { game, cards, skips, publish, disconnect } = await keyboardGame(page);
  await page.keyboard.press("1");
  const before = structuredClone(game);
  for (const guard of [
    { repeat: true },
    { isComposing: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ])
    await page.locator("body").dispatchEvent("keydown", {
      key: "q",
      code: "KeyQ",
      ...guard,
    });
  for (const tag of ["input", "textarea", "select", "div"]) {
    await page.evaluate((tag) => {
      const input = document.createElement(tag);
      input.id = "skip-input";
      if (tag === "div") input.contentEditable = "true";
      document.body.append(input);
      input.focus();
    }, tag);
    await page.keyboard.press("q");
    await page.locator("#skip-input").evaluate((input) => input.remove());
  }
  for (const name of ["About +1 row", "Menu"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("q");
    await page.keyboard.press("Escape");
  }
  expect(skips).toHaveLength(0);
  await expect(page.locator(".card.selected")).toHaveCount(1);
  await page.locator("body").dispatchEvent("keydown", {
    key: "Q",
    code: "KeyQ",
    shiftKey: true,
  });
  await expect(page.locator(".turn-banner")).toContainText("OPPONENT’S TURN");
  expect(skips).toEqual([{ matchId: before.id, seq: before.seq }]);
  expect(
    game.cards.filter((c) => cards.some((old) => old.id === c.id)),
  ).toHaveLength(4);
  expect(game.players[1].destroyedTiles).toBe(4);
  expect(game.players.map((p) => p.matrix)).toEqual(
    before.players.map((p) => p.matrix),
  );
  expect(game.endAt).toBe(before.endAt);
  await expect(page.locator(".card.selected")).toHaveCount(0);
  await page.keyboard.press("q");
  expect(skips).toHaveLength(1);
  game.active = 1;
  game.seq++;
  publish();
  await expect(
    page.getByRole("button", { name: "Skip turn", exact: true }),
  ).toBeEnabled();
  disconnect();
  await expect(page.locator(".game-status")).toContainText("Connection lost");
  await page.keyboard.press("q");
  expect(skips).toHaveLength(1);
});

test("mobile keyboard hints are opt-in and local while shortcuts always work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  await page.route("**/api/ad/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/settings");
  const preference = page.getByRole("checkbox", {
    name: "Show keyboard hints on mobile",
    exact: true,
  });
  await expect(preference).not.toBeChecked();
  await preference.check();
  await page.reload();
  await expect(preference).toBeChecked();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("mathrix_mobile_keyboard_hints"),
    ),
  ).toBe("on");
  const { actions } = await keyboardGame(page);
  await expect(page.locator(".game")).toHaveAttribute(
    "data-mobile-keyboard-hints",
    "true",
  );
  await expect(page.locator(".tile-key").first()).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.locator(".self .axis kbd").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip turn", exact: true }).locator("kbd"),
  ).toBeVisible();
  await page.goto("/settings");
  await preference.uncheck();
  await page.reload();
  await expect(preference).not.toBeChecked();
  await page.goto("/play");
  await expect(page.locator(".game")).toHaveAttribute(
    "data-mobile-keyboard-hints",
    "false",
  );
  await expect(page.locator(".tile-key").first()).toBeHidden();
  await page.keyboard.press("1");
  await expect(page.locator(".card.selected")).toHaveAttribute(
    "data-card-id",
    "key-0",
  );
  await expect(page.locator(".self .axis kbd").first()).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Skip turn", exact: true }).locator("kbd"),
  ).toBeHidden();
  await expect(page.locator(".self .matrix-row .axis").first()).toHaveText(
    /R1/,
  );
  await page.keyboard.press("0");
  await expect.poll(() => actions.length).toBe(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".tile-key").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip turn", exact: true }).locator("kbd"),
  ).toBeVisible();
});

test("player avatars open details, restore focus and suspend gameplay shortcuts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { game, actions, skips, publish } = await keyboardGame(page);
  game.players[1].city = "Dublin";
  game.players[1].countryCode = "IE";
  game.players[1].rank = 191;
  game.players[1].played = 61;
  game.players[1].destroyedTiles = 4;
  game.players[1].maxSquare = 7;
  game.players[1].maxCube = 9;
  publish();
  await page.keyboard.press("1");
  const ownAvatar = page.getByRole("button", {
    name: "Show your player details",
    exact: true,
  });
  await ownAvatar.click();
  const details = page.locator(".player-profile-dialog");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Keyboard player");
  await expect(details).toContainText("Dublin, Ireland");
  await expect(details).toContainText(/Rank\s*#191/);
  await expect(details).toContainText(/Games\s*61/);
  await expect(details).toContainText(/Destroyed tiles\s*4/);
  await expect(details).toContainText(/Maximum Square\s*7/);
  await expect(details).toContainText(/Maximum Cube\s*9/);
  for (const key of ["0", "Shift", "q"]) await page.keyboard.press(key);
  expect(actions).toHaveLength(0);
  expect(skips).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(ownAvatar).toBeFocused();
  await expect(page.locator(".card.selected")).toHaveCount(1);
  const opponentAvatar = page.getByRole("button", {
    name: "Show opponent player details",
    exact: true,
  });
  await opponentAvatar.click();
  await expect(details).toContainText("Opponent");
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(opponentAvatar).toBeFocused();
});

test("power counters, boosts and magnitude targets stay synchronized through reload and discard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { game, publish, actions } = await keyboardGame(page);
  for (const p of game.players) {
    p.matrix = [
      [3, 4],
      [-3, 5],
    ];
    p.rowShields = p.columnShields = [false, false];
  }
  game.cards[0] = { id: "limit-square", operation: "square_cell", value: 1 };
  game.cards[1] = { id: "limit-cube", operation: "cube_cell", value: 1 };
  game.cards[2] = { id: "boost-square", operation: "add_max_square", value: 3 };
  game.cards[3] = { id: "boost-cube", operation: "add_max_cube", value: 5 };
  publish();
  const square = page.locator('[data-card-id="limit-square"]');
  const cube = page.locator('[data-card-id="limit-cube"]');
  await expect(square).toBeDisabled();
  await expect(cube).toBeDisabled();
  await expect(page.locator('.self [data-power="square"] b')).toHaveText("0");
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText("0");
  await page.keyboard.press("3");
  await expect(page.locator('.self [data-power="square"] b')).toHaveText("3");
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText("0");
  expect(actions).toEqual([{ player: 1 }]);
  expect(game.active).toBe(0);
  const nextTurn = async () => {
    game.active = 1;
    game.seq++;
    publish();
    await expect(
      page.getByRole("button", { name: "Skip turn", exact: true }),
    ).toBeEnabled();
  };
  await nextTurn();
  await page.reload();
  await expect(page.locator('.self [data-power="square"] b')).toHaveText("3");
  await expect(square).toBeEnabled();
  await expect(cube).toBeDisabled();
  await square.locator("..").locator(".tile-help-button").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your Maximum Square: 3",
  );
  await page.keyboard.press("Escape");
  await square.click();
  await expect(page.locator(".self .cell").nth(2)).toHaveClass(/legal/);
  await expect(page.locator(".self .cell").nth(1)).not.toHaveClass(/legal/);
  await expect(page.locator(".opponent .cell").first()).toHaveClass(/legal/);
  await page.locator(".opponent .cell").first().click();
  await expect(page.locator(".opponent .cell").first()).toHaveText("9");
  await expect(page.locator('.opponent [data-power="square"] b')).toHaveText(
    "0",
  );
  await expect(page.locator('.self [data-power="square"] b')).toHaveText("3");
  await nextTurn();
  await page.keyboard.press("4");
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText("5");
  await nextTurn();
  await cube.click();
  await page.locator(".self .cell").nth(3).click();
  await expect(page.locator(".self .cell").nth(3)).toHaveText("125");
  await nextTurn();
  await page.getByRole("button", { name: "Skip turn", exact: true }).click();
  await expect(page.locator(".self .destroyed-total b")).toHaveText("4");
  await expect(page.locator('.self [data-power="square"] b')).toHaveText("7");
  await expect(page.locator('.self [data-power="cube"] b')).toHaveText("9");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".menu-players").first()).toContainText(
    "Maximum Square 7 · Maximum Cube 9",
  );
});

test("fixed-target tiles apply on click or keyboard selection without confirmation", async ({
  page,
}) => {
  const { game, cards, actions, publish } = await keyboardGame(page);
  game.config.turnStartMs = game.config.turnEndMs = 60000;
  for (const input of ["click", "keyboard"] as const) {
    for (const [operation, player] of [
      ["unlock_slot", 1],
      ["add_max_square", 1],
      ["add_max_cube", 1],
      ["add_match_time_5", 1],
      ["sub_match_time_5", 1],
      ["add_turn_time_5", 1],
      ["sub_turn_time_5", 0],
    ] as const) {
      game.active = 1;
      game.seq++;
      game.cards = structuredClone(cards.slice(0, 4));
      for (const p of game.players) {
        p.matrix = [
          [1, 2],
          [3, 4],
        ];
        p.rowShields = p.columnShields = [false, false];
      }
      const card = { id: `${input}-${operation}`, operation, value: 3 };
      game.cards[2] = card;
      publish();
      const tile = page.locator(`[data-card-id="${card.id}"]`);
      await expect(tile).toBeEnabled();
      const count = actions.length;
      if (input === "click") {
        // Switching from a selected arithmetic tile must use the clicked card.
        await page.keyboard.press("1");
        await expect(page.locator(".card.selected")).toHaveCount(1);
        await tile.click();
      } else {
        await tile.locator("..").locator(".tile-help-button").click();
        await expect(page.getByRole("dialog")).toContainText(
          "Select the tile to apply it immediately",
        );
        await page.keyboard.press("3");
        expect(actions).toHaveLength(count);
        await page.keyboard.press("Escape");
        await page.keyboard.press("3");
      }
      await expect.poll(() => actions.length).toBe(count + 1);
      expect(actions[count]).toEqual({ player });
      const event = game.events.findLast((event) => event.type === "OPERATION");
      expect(event?.data.card).toEqual(card);
      expect(game.cards.some((c) => c.id === card.id)).toBe(false);
      expect(game.active).toBe(operation === "add_turn_time_5" ? 1 : 0);
      await expect(page.locator(".card.selected")).toHaveCount(0);
      await expect(page.locator(".pool-controls button")).toHaveCount(1);
      await expect(page.locator(".matrix-target")).toHaveCount(0);
    }
  }
  for (const [operation, selector] of [
    ["factorial_cell", ".self .cell"],
    ["row_shield", ".self .matrix-row .axis"],
    ["column_shield", ".self .matrix-columns .axis"],
  ] as const) {
    game.active = 1;
    game.seq++;
    for (const [i, p] of game.players.entries()) {
      p.matrix = [[i === 1 ? 0 : 6]];
      p.rowShields = p.columnShields = [false];
    }
    game.cards[0] = { id: operation, operation, value: 1 };
    publish();
    const tile = page.locator(`[data-card-id="${operation}"]`);
    await expect(tile).toBeEnabled();
    const count = actions.length;
    await tile.click();
    await expect(tile).toHaveClass(/selected/);
    expect(actions).toHaveLength(count);
    await page.locator(`${selector}.legal`).click();
    await expect.poll(() => actions.length).toBe(count + 1);
  }
});

test("growth chooses either matrix, uses the actor’s total and respects each matrix’s limit", async ({
  page,
}) => {
  const { game, cards, actions, publish } = await keyboardGame(page);
  for (const operation of ["add_row", "add_column"] as const) {
    for (const [input, player] of [
      ["keyboard", 1],
      ["keyboard", 0],
      ["click", 1],
      ["click", 0],
    ] as const) {
      game.active = 1;
      game.seq++;
      game.cards = structuredClone(cards.slice(0, 4));
      for (const [index, p] of game.players.entries()) {
        const full = input === "click" && index !== player;
        const rows = operation === "add_row" && full ? game.config.maxRows : 2;
        const columns =
          operation === "add_column" && full ? game.config.maxColumns : 2;
        p.matrix = Array.from({ length: rows }, (_, row) =>
          Array.from(
            { length: columns },
            (_, column) => row * columns + column + 1,
          ),
        );
        p.rowShields = Array(rows).fill(false);
        p.columnShields = Array(columns).fill(false);
        p.destroyedTiles = index === 1 ? 7 : 23;
      }
      const original = game.players.map((p) => structuredClone(p.matrix));
      const card = {
        id: `${input}-${operation}-${player}`,
        operation,
        value: 3,
      };
      game.cards[2] = card;
      publish();
      const tile = page.locator(`[data-card-id="${card.id}"]`);
      await expect(tile).toBeEnabled();
      await expect(tile.locator(".tile-description")).toContainText(
        "filled with 7",
      );
      const count = actions.length;
      if (input === "keyboard") await page.keyboard.press("3");
      else await tile.click();
      await expect(tile).toHaveClass(/selected/);
      expect(actions).toHaveLength(count);
      for (const [board, key, targetPlayer] of [
        [".self", "1", 1],
        [".opponent", "2", 0],
      ] as const) {
        const target = page.locator(`${board} .matrix-target`);
        await expect(target).toContainText("Grow this matrix");
        if (input === "keyboard" || targetPlayer === player)
          await expect(target).toHaveAttribute("aria-keyshortcuts", key);
        else await expect(target).not.toHaveAttribute("aria-keyshortcuts");
      }
      const board = player === 1 ? ".self" : ".opponent";
      const target = page.locator(`${board} .matrix-target`);
      await expect(target).toBeEnabled();
      if (input === "click") {
        await expect(
          page.locator(
            `${player === 1 ? ".opponent" : ".self"} .matrix-target`,
          ),
        ).toBeDisabled();
        await page.keyboard.press(player === 1 ? "2" : "1");
        expect(actions).toHaveLength(count);
        await expect(tile).toHaveClass(/selected/);
        await target.click();
      } else await page.keyboard.press(player === 1 ? "1" : "2");
      await expect.poll(() => actions.length).toBe(count + 1);
      expect(actions[count]).toEqual({ player });
      const expected =
        operation === "add_row"
          ? [...original[player], Array(original[player][0].length).fill(7)]
          : original[player].map((row) => [...row, 7]);
      await expect(page.locator(`${board} .cell`)).toHaveText(
        expected.flat().map(String),
      );
      expect(game.players[1 - player].matrix).toEqual(original[1 - player]);
      expect(game.players.map((p) => p.destroyedTiles)).toEqual([23, 7]);
      expect(game.active).toBe(0);
      expect(game.cards.some((c) => c.id === card.id)).toBe(false);
      await expect(page.locator(".card.selected")).toHaveCount(0);
      await expect(page.locator(".matrix-target")).toHaveCount(0);
      await expect(page.locator(".skill")).toHaveCount(0);
    }
    game.active = 1;
    game.seq++;
    for (const p of game.players) {
      p.matrix = Array.from({ length: game.config.maxRows }, () =>
        Array(game.config.maxColumns).fill(1),
      );
      p.rowShields = Array(game.config.maxRows).fill(false);
      p.columnShields = Array(game.config.maxColumns).fill(false);
    }
    game.cards[2] = { id: `full-${operation}`, operation, value: 3 };
    publish();
    await expect(
      page.locator(`[data-card-id="full-${operation}"]`),
    ).toBeDisabled();
    const count = actions.length;
    await page.keyboard.press("3");
    expect(actions).toHaveLength(count);
    await expect(page.locator(".card.selected")).toHaveCount(0);
  }
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
      "cube_cell",
      { player: 0, row: 0, column: 0 },
      [
        [-3, 2],
        [0, 4],
      ],
      [
        [-27, 2],
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
    game.players[1].maxSquare = game.players[1].maxCube = 10;
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

test("whole-matrix shortcuts target your matrix with 1 and the opponent with 2", async ({
  page,
}) => {
  const { game, cards, actions, publish } = await keyboardGame(page);
  const original = game.players.map((p) => {
    const matrix = structuredClone(p.matrix);
    matrix[0][0] = -5;
    return matrix;
  });
  for (const operation of [
    "add_matrix",
    "sub_matrix",
    "absolute_matrix",
  ] as const) {
    for (const [key, player] of [
      ["1", 1],
      ["2", 0],
    ] as const) {
      game.active = 1;
      game.cards = structuredClone(cards);
      game.cards[2] = { id: "matrix-key", operation, value: 3 };
      game.players.forEach((p, i) => (p.matrix = structuredClone(original[i])));
      publish();
      const tile = page.locator('[data-card-id="matrix-key"]');
      await expect(tile).toHaveAttribute("data-operation", operation);
      await page.keyboard.press("3");
      await expect(tile).toHaveClass(/selected/);
      for (const [board, digit] of [
        [".self", "1"],
        [".opponent", "2"],
      ]) {
        const target = page.locator(`${board} .matrix-target`);
        await expect(target).toHaveAttribute("aria-keyshortcuts", digit);
        await expect(target.locator("kbd")).toHaveText(digit);
      }
      await expect(page.locator(".card[aria-keyshortcuts]")).toHaveCount(0);
      await expect(page.locator(".shortcut-hint")).toContainText(
        "1: your matrix · 2: opponent matrix",
      );
      await page.keyboard.press("4"); // Targeting keeps other digits from selecting tiles.
      await expect(tile).toHaveClass(/selected/);
      if (actions.length === 0) {
        for (const [name, viewport] of [
          ["desktop", { width: 1440, height: 900 }],
          ["mobile", { width: 390, height: 844 }],
        ] as const) {
          await page.setViewportSize(viewport);
          await page.keyboard.press("Escape");
          await page.keyboard.press("3");
          await page.screenshot({
            path: test.info().outputPath(`matrix-shortcuts-${name}.png`),
          });
        }
        await page.keyboard.press("Control+1");
        await page.locator("body").dispatchEvent("keydown", {
          key: "1",
          code: "Digit1",
          repeat: true,
        });
        for (const name of ["About +3 matrix", "Menu"]) {
          await page.getByRole("button", { name, exact: true }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("2");
          expect(actions).toHaveLength(0);
          await page.keyboard.press("Escape");
        }
        await page.keyboard.press("Escape");
        await expect(page.locator(".matrix-target")).toHaveCount(0);
        await expect(tile).toHaveAttribute("aria-keyshortcuts", "3");
        await tile.click();
      }
      const count = actions.length;
      await page.keyboard.press(key);
      await expect.poll(() => actions.length).toBe(count + 1);
      expect(actions[count]).toEqual({ player });
      const expected = original[player].map((row) =>
        row.map((n) =>
          operation === "add_matrix"
            ? n + 3
            : operation === "sub_matrix"
              ? n - 3
              : Math.abs(n),
        ),
      );
      await expect(
        page.locator(`${player === 1 ? ".self" : ".opponent"} .cell`),
      ).toHaveText(expected.flat().map(String));
      expect(game.players[1 - player].matrix).toEqual(original[1 - player]);
      await expect(page.locator(".card.selected")).toHaveCount(0);
    }
  }

  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array[0] = 14;
        return array;
      },
    });
  });
  await page.clock.install({ time: new Date("2026-10-06T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-06T12:01:00Z"));
  for (const [key, board, other] of [
    ["1", ".self", ".opponent"],
    ["2", ".opponent", ".self"],
  ]) {
    await page.goto("/play?mode=practice");
    await expect(
      page.locator('.card[data-operation="add_matrix"]'),
    ).toHaveAttribute("aria-keyshortcuts", "3");
    await page.keyboard.press("3");
    await page.keyboard.press(key);
    await expect(page.locator(`${board} .score b`)).toHaveText("22");
    await expect(page.locator(`${other} .score b`)).toHaveText("10");
    await expect(page.locator(".turn-banner")).toContainText(
      "VERY BASIC AI’S TURN",
    );
  }
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
        array[0] = 91;
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
    game.players[1].maxSquare = 10004;
    game.players[1].maxCube = 10009;
    game.players[0].countryCode = "UA";
    game.players[0].rank = 4;
    game.players[0].played = 8;
    game.players[0].destroyedTiles = 41;
    game.players[0].maxSquare = 41;
    game.players[0].maxCube = 46;
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
          ".boards, .matrix-panel, .matrix-content, .matrix-wrap, .cell, .player-power-stats, .power-total, .pool, .game-status, .skip-turn",
        )) {
          if (!el.getClientRects().length) continue;
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
          if (!el.getClientRects().length) continue;
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
          if (
            cell.classList.contains("cell") &&
            (r.width > 45 || r.height > 45)
          )
            problems.push(
              "Matrix cells are stretched beyond their compact size",
            );
        }
        for (const skip of document.querySelectorAll<HTMLElement>(
          ".skip-turn",
        )) {
          if (
            skip.getClientRects().length &&
            skip.getBoundingClientRect().height < 44
          )
            problems.push("Skip turn is too small to tap");
        }
        for (const card of document.querySelectorAll<HTMLElement>(".card")) {
          const r = card.getBoundingClientRect();
          if (r.height <= r.width) problems.push("Tile is not a portrait card");
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
          const frame = getComputedStyle(card, "::after");
          if (
            frame.borderTopStyle !== "solid" ||
            frame.pointerEvents !== "none"
          )
            problems.push("Card frame is missing or intercepts input");
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
            score.closest(".matrix-content")!.clientWidth
          )
            problems.push("Score overflows matrix");
        }
        for (const name of document.querySelectorAll<HTMLElement>(
          ".matrix-heading .player-name",
        )) {
          if (!name.getClientRects().length) continue;
          if (
            name.getBoundingClientRect().right >
            name.closest(".matrix-heading")!.getBoundingClientRect().right + 1
          )
            problems.push("Player name overflows profile");
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
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator("footer a")).toHaveCount(5);
    await expect(page.locator(".cell")).toHaveCount(50);
    await assertFit();
    const boards = (await page.locator(".boards").boundingBox())!;
    const pool = (await page.locator(".pool").boundingBox())!;
    if (viewport.width < 1024 && viewport.height <= 500) {
      expect(boards.x + boards.width).toBeLessThanOrEqual(pool.x);
    } else {
      expect(Math.abs(boards.x - pool.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(boards.width - pool.width)).toBeLessThanOrEqual(1);
    }
    if (viewport.width < 1024) {
      const self = (await page.locator(".self .matrix-content").boundingBox())!;
      const opponent = (await page
        .locator(".opponent .matrix-content")
        .boundingBox())!;
      expect(self.x + self.width).toBeLessThanOrEqual(opponent.x);
      expect(Math.abs(self.y - opponent.y)).toBeLessThanOrEqual(1);
      await expect(page.locator(".mobile-skip")).toBeVisible();
      await expect(page.locator(".desktop-skip")).toBeHidden();
      await expect(page.locator(".tile-key").first()).toBeHidden();
    } else {
      await expect(page.locator(".desktop-skip")).toBeVisible();
      await expect(page.locator(".mobile-skip")).toBeHidden();
      const avatar = (await page
        .locator(".self .matrix-heading .player-avatar")
        .boundingBox())!;
      expect(avatar.width).toBeGreaterThanOrEqual(64);
      expect(avatar.height).toBeGreaterThanOrEqual(64);
    }
    if (name === "desktop") {
      const slots = await page.locator(".card-slot").evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        }),
      );
      const firstRow = slots.filter((r) => Math.abs(r.y - slots[0].y) <= 1);
      expect(firstRow.length).toBeGreaterThan(4);
      expect(firstRow[1].x - firstRow[0].right).toBeGreaterThanOrEqual(23);
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
    const { game, actions, publish } = await keyboardGame(mobile);
    await mobile.locator('[data-card-id="key-0"]').tap();
    await mobile.locator('.self .axis[aria-keyshortcuts="0"]').tap();
    await expect.poll(() => actions.length).toBe(1);
    expect(actions[0]).toEqual({ player: 1, row: 0 });
    game.active = 1;
    game.cards[0] = { id: "tap-boost", operation: "add_max_square", value: 3 };
    publish();
    const boost = mobile.locator('[data-card-id="tap-boost"]');
    await expect(boost).toBeEnabled();
    await boost.tap();
    await expect.poll(() => actions.length).toBe(2);
    expect(actions[1]).toEqual({ player: 1 });
    await expect(mobile.locator('.self [data-power="square"] b')).toHaveText(
      "3",
    );
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

import { expect, type Page, type WebSocketRoute } from "@playwright/test";
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
} from "../../lib/engine";
import { defaultBalance } from "../../lib/config";

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

export { keyboardGame };

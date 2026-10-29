import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAIMove } from "../lib/ai";
import {
  createGame,
  startGame,
  finishGame,
  legalTargets,
  useOperation,
  type Card,
} from "../lib/engine";
import { Room } from "../lib/room";
import { speeds, type Speed } from "../lib/config";

function game(speed: Speed = 1, seed = 42) {
  const g = createGame(
    "ai-test",
    seed,
    [
      { id: "human", name: "Human", registered: false },
      { id: "ai:ai-test", name: "Mathrix AI", registered: false },
    ],
    undefined,
    1000,
    "ai",
    speed,
  );
  startGame(g, 1000);
  g.active = 1;
  return g;
}
const card = (operation: Card["operation"], value = 1): Card => ({
  id: operation,
  operation,
  value,
});

test("AI chooses useful signed operations and evaluates without mutating or seeing future draws", () => {
  const g = game();
  g.players[0].matrix = [
    [100, -20],
    [0, 0],
  ];
  g.players[1].matrix = [
    [-50, 5],
    [1, 2],
  ];
  g.cards = [card("negate_row", -1), card("add_matrix", 3)];
  const before = structuredClone(g);
  const move = chooseAIMove(g, 1001, () => 0);
  assert.deepEqual(move, {
    cardId: "negate_row",
    target: { player: 0, row: 0 },
  });
  assert.deepEqual(g, before);
  g.seed = 456;
  g.rng = 123456;
  assert.deepEqual(
    chooseAIMove(g, 1001, () => 0),
    move,
  );
  g.active = 0;
  assert.equal(chooseAIMove(g, 1001), null);
  g.active = 1;
  assert.equal(chooseAIMove(g, g.turnEndsAt), null);
  finishGame(g, 1002);
  assert.equal(chooseAIMove(g, 1003), null);
});

test("AI evaluates square roots using the shared i without mutating the board", () => {
  const g = game();
  g.iValue = 7;
  g.players[0].matrix = [
    [1, 1],
    [1, 1],
  ];
  g.players[1].matrix = [
    [-10, 1],
    [1, 1],
  ];
  g.cards = [card("sqrt_cell"), card("add_cell", 3)];
  const before = structuredClone(g);
  const move = chooseAIMove(g, 1001, () => 0)!;
  assert.deepEqual(move, {
    cardId: "sqrt_cell",
    target: { player: 1, row: 0, column: 0 },
  });
  assert.deepEqual(g, before);
  useOperation(g, 1, move.cardId, move.target, g.seq, 1001);
  assert.equal(g.players[1].matrix[0][0], 22);
});

test("AI values growth and positive protection, and respects protected removals", () => {
  const g = game();
  g.players[0].matrix = [
    [-10, -5],
    [10, 5],
  ];
  g.players[1].matrix = [
    [1, 2],
    [20, 30],
  ];
  g.cards = [card("remove_row")];
  assert.equal(chooseAIMove(g, 1001)!.target.row, 1);
  g.players[0].rowShields[1] = true;
  g.cards.push(card("add_cell", 1));
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_cell");
  g.cards = [card("row_shield")];
  assert.deepEqual(chooseAIMove(g, 1001), {
    cardId: "row_shield",
    target: { player: 1, row: 1 },
  });
  g.players[1].destroyedTiles = 3;
  g.cards = [card("add_row"), card("add_cell", 3)];
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_row");
  g.players[1].matrix = Array.from({ length: g.config.maxRows }, () => [1, 1]);
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_cell");
});

test("AI takes a winning finish, avoids a losing finish, and uses favorable clock tiles", () => {
  const g = game();
  g.players[1].matrix[0][0] += 20;
  g.endAt = 2000;
  g.cards = [card("sub_match_time_5", 5), card("add_matrix", 3)];
  assert.equal(chooseAIMove(g, 1001)!.cardId, "sub_match_time_5");
  g.players[0].matrix[0][0] += 40;
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_matrix");
  g.endAt = 30000;
  g.cards = [card("sub_match_time_5", 5), card("add_match_time_5", 5)];
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_match_time_5");
  g.players[1].matrix[0][0] += 40;
  assert.equal(chooseAIMove(g, 1001)!.cardId, "sub_match_time_5");
  for (const operation of ["add_turn_time_5", "sub_turn_time_15"] as const) {
    g.cards = [card(operation, 5)];
    assert.equal(chooseAIMove(g, 1001)!.cardId, operation);
  }
});

test("AI evaluates bounded arithmetic and determinants and ignores invalid targets", () => {
  for (const [operation, input, expected] of [
    ["factorial_cell", 5, 120],
    ["fibonacci_cell", 15, 610],
    ["square_cell", -5, 25],
    ["absolute_matrix", -5, 5],
  ] as const) {
    const g = game();
    g.players[1].maxSquare = 5;
    g.players[0].matrix = [
      [1, 1],
      [1, 1],
    ];
    g.players[1].matrix = [
      [input, 0],
      [0, 0],
    ];
    g.cards = [card(operation)];
    const before = structuredClone(g);
    const move = chooseAIMove(g, 1001, () => 0)!;
    assert.equal(move.target.player, 1);
    assert.deepEqual(g, before);
    useOperation(g, 1, move.cardId, move.target, g.seq, 1001);
    assert.equal(g.players[1].matrix[0][0], expected);
  }
  const g = game();
  g.players[0].matrix = [
    [10, 0],
    [0, 10],
  ];
  g.players[1].matrix = [
    [1, 0],
    [0, 1],
  ];
  g.cards = [card("determinant_cell")];
  assert.equal(chooseAIMove(g, 1001, () => 0)!.target.player, 1);
  for (const p of g.players) p.matrix = [[1000000, 1000000, 1000000]];
  g.cards = [
    card("factorial_cell"),
    card("fibonacci_cell"),
    card("determinant_cell"),
    card("next_prime_cell"),
    card("add_cell"),
  ];
  assert.equal(chooseAIMove(g, 1001)!.cardId, "add_cell");
});
test("AI respects its own power limits and can play a boost without changing the evaluated game", () => {
  const g = game();
  g.players[1].matrix = [
    [8, 1],
    [1, 1],
  ];
  g.players[0].maxSquare = 1000;
  g.cards = [card("square_cell"), card("add_max_square", 5)];
  const before = structuredClone(g);
  const boost = chooseAIMove(g, 1001, () => 0)!;
  assert.equal(boost.cardId, "add_max_square");
  assert.deepEqual(boost.target, { player: 1 });
  assert.deepEqual(g, before);
  useOperation(g, 1, boost.cardId, boost.target, g.seq, 1001);
  assert.equal(g.players[1].maxSquare, 5);
  g.active = 1;
  g.players[1].maxSquare = 8;
  g.cards = [card("square_cell"), card("cube_cell")];
  const power = chooseAIMove(g, 1002, () => 0)!;
  assert.deepEqual(power, {
    cardId: "square_cell",
    target: { player: 1, row: 0, column: 0 },
  });
});

test("AI moves are legal through full games at every speed", () => {
  for (const speed of speeds)
    for (let seed = 1; seed <= 10; seed++) {
      const g = game(speed, seed);
      g.config.matchMs = 10000 * speed;
      startGame(g, 1000);
      g.active = seed % 2;
      // The human's opening must leave time for the bot to take a turn.
      g.cards[0] = card("add_cell", 1);
      const room = new Room(g, 5000, () => 0.5);
      for (let now = 1000; g.status !== "finished"; now += 500) {
        const before = structuredClone(g);
        const move = chooseAIMove(g, now, () => 0.5);
        assert.deepEqual(g, before);
        if (move) {
          const c = g.cards.find((c) => c.id === move.cardId)!;
          assert.ok(
            legalTargets(g, 1, c, now).some(
              (target) =>
                JSON.stringify(target) === JSON.stringify(move.target),
            ),
          );
        }
        room.tick(now);
        if (g.status === "playing" && g.active === 0) {
          const c = g.cards.find((c) => legalTargets(g, 0, c, now).length);
          if (c)
            useOperation(g, 0, c.id, legalTargets(g, 0, c, now)[0], g.seq, now);
        }
        // Ensure randomized time extensions cannot make a regression test run indefinitely.
        assert.ok(now < 1_000_000);
      }
      assert.ok(
        g.events.some((e) => e.type === "OPERATION" && e.data.actor === 1),
      );
    }
});

test("AI readiness waits for the human ad; scheduled actions respect sequences and deadlines", () => {
  const g = game();
  g.status = "pregame";
  g.endAt = 0;
  const room = new Room(g, 5000, () => 0);
  room.readyNotBefore = [2000, 0];
  assert.deepEqual(g.ready, [false, true]);
  assert.throws(() => room.ready(0, 1999), /Advertisement/);
  room.ready(0, 2000);
  assert.equal(room.tick(4999), null);
  assert.equal(room.tick(5000), "start");
  assert.equal(room.tick(5399), null);
  assert.equal(room.tick(5400), "ai_move");
  assert.equal(g.active, 0);
  g.active = 1;
  g.seq++;
  g.cards = [card("add_turn_time_5", 5)];
  room.tick(5500);
  assert.equal(room.tick(5900), "ai_move");
  assert.equal(g.active, 1);
  assert.equal(room.tick(5900), null);
  g.cards = [card("add_cell", 1)];
  assert.equal(room.tick(6299), null);
  assert.equal(room.tick(6300), "ai_move");
  g.active = 1;
  g.seq++;
  room.tick(6400);
  g.turnEndsAt = 6450;
  assert.equal(room.tick(6450), "timeout");
  assert.equal(g.active, 0);
  const operations = g.events.filter((e) => e.type === "OPERATION").length;
  room.tick(6800);
  assert.equal(
    g.events.filter((e) => e.type === "OPERATION").length,
    operations,
  );
  g.active = 1;
  g.seq++;
  g.endAt = 6900;
  room.tick(6850);
  assert.equal(room.tick(6900), "finish");
  assert.equal(
    g.events.filter((e) => e.type === "OPERATION").length,
    operations,
  );
});

test("AI waits for ordinary timeouts and keeps playing during the human reconnect window", () => {
  const g = game();
  const room = new Room(g, 5000, () => 0);
  g.cards = [card("row_shield")];
  g.players[1].rowShields = [true, true];
  room.tick(1000);
  assert.equal(room.tick(1400), null);
  assert.equal(g.active, 1);
  assert.equal(room.tick(g.turnEndsAt), "timeout");
  g.active = 1;
  g.seq++;
  g.cards = [card("add_cell", 1)];
  room.disconnect(0, 7000);
  room.tick(7000);
  assert.equal(room.tick(7400), "ai_move");
  room.reconnect(0, 7500);
  assert.equal(room.disconnectedAt[0], null);
  room.disconnect(0, 8000);
  assert.equal(room.tick(8000 + g.config.reconnectMs), "disconnect");
  assert.equal(g.result!.winner, 1);
});

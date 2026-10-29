import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBalance,
  balanceSchema,
  operationIds,
  timeTiles,
} from "../lib/config";
import {
  createGame,
  createStartingMatrix,
  calculateScore,
  applyOperation,
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  applyShield,
  calculateTurnDuration,
  determineWinner,
  elo,
  legalTargets,
  generateOperation,
  startGame,
  useOperation,
  skillHit,
  tickGame,
  publicGame,
  registry,
  validateTarget,
  type Card,
  type Game,
} from "../lib/engine";
const players = [
  { id: "a", name: "A", registered: true },
  { id: "b", name: "B", registered: true },
];
const make = (seed = 42) =>
  createGame("test", seed, players, defaultBalance, 1000);
function card(operation: Card["operation"], value = 2): Card {
  return { id: "test-card", operation, value };
}
function playing() {
  const g = make();
  startGame(g, 1000);
  return g;
}
test("10,000 seeded starting matrices are positive integers summing to ten", () => {
  for (let seed = 1; seed <= 10000; seed++) {
    const m = createStartingMatrix({ rng: seed });
    assert.equal(calculateScore(m), 10);
    assert.ok(m.flat().every((v) => Number.isInteger(v) && v > 0));
    assert.equal(m.length, 2);
    assert.equal(m[0].length, 2);
  }
});
test("same seeds reproduce matrices, cards and first turn", () => {
  assert.deepEqual(make(500), make(500));
  assert.notDeepEqual(make(500).players, make(501).players);
  assert.equal(publicGame(make()).cards.length, 8);
  assert.ok(!("seed" in publicGame(make())));
  assert.ok(!("rng" in publicGame(make())));
});
test("signed score, winner, loss and draw", () => {
  assert.equal(
    calculateScore([
      [-5, 4],
      [2, 8],
    ]),
    9,
  );
  assert.equal(determineWinner(-5, -2), 1);
  assert.equal(determineWinner(5, 2), 0);
  assert.equal(determineWinner(10, 10), null);
});
test("all arithmetic target scopes apply correctly", () => {
  for (const scope of ["cell", "row_value", "column_value", "matrix"])
    for (const prefix of ["add", "sub"]) {
      const g = make();
      g.players[0].matrix = [
        [1, 2],
        [3, 4],
      ];
      const c = card(`${prefix}_${scope}` as Card["operation"]);
      applyOperation(g, 0, c, { player: 0, row: 0, column: 1 });
      const count = scope === "cell" ? 1 : scope === "matrix" ? 4 : 2;
      assert.equal(
        calculateScore(g.players[0].matrix),
        10 + (prefix === "sub" ? -2 : 2) * count,
      );
    }
});
test("double and negate cell/row/column", () => {
  for (const scope of ["cell", "row", "column"]) {
    const g = make();
    g.players[0].matrix = [
      [1, 2],
      [3, 4],
    ];
    applyOperation(g, 0, card(`multiply_${scope}` as Card["operation"], 2), {
      player: 0,
      row: 0,
      column: 1,
    });
    const expected = scope === "cell" ? 12 : scope === "row" ? 13 : 16;
    assert.equal(calculateScore(g.players[0].matrix), expected);
    applyOperation(g, 0, card(`negate_${scope}` as Card["operation"], -1), {
      player: 0,
      row: 0,
      column: 1,
    });
    assert.equal(
      calculateScore(g.players[0].matrix),
      scope === "cell" ? 4 : scope === "row" ? 1 : -8,
    );
  }
});
test("arithmetic cell ceiling prevents unsafe score growth", () => {
  const g = make();
  g.players[0].matrix = [
    [1000000, -1000000],
    [1, 1],
  ];
  applyOperation(g, 0, card("multiply_row", 2), { player: 0, row: 0 });
  assert.deepEqual(g.players[0].matrix[0], [1000000, -1000000]);
});
test("grow and remove rows/columns, retain rectangularity and final line", () => {
  const g = make(),
    p = g.players[0];
  addRow(p, g.config);
  assert.deepEqual(p.matrix[2], [1, 1]);
  addColumn(p, g.config);
  assert.deepEqual(
    p.matrix.map((r) => r[2]),
    [1, 1, 1],
  );
  removeRow(p, 2);
  removeColumn(p, 2);
  assert.equal(p.matrix.length, 2);
  removeRow(p, 0);
  removeColumn(p, 0);
  assert.throws(() => removeRow(p, 0), /Final/);
  assert.throws(() => removeColumn(p, 0), /Final/);
});
test("configuration bounds and ownership restrictions", () => {
  const g = make();
  g.config.maxRows = 2;
  g.config.maxColumns = 2;
  assert.throws(() => addRow(g.players[0], g.config));
  assert.throws(() => addColumn(g.players[0], g.config));
  assert.throws(() =>
    applyOperation(g, 0, card("remove_row"), { player: 0, row: 0 }),
  );
  assert.throws(() =>
    applyOperation(g, 0, card("row_shield"), { player: 1, row: 0 }),
  );
  assert.throws(() => applyOperation(g, 0, card("add_row"), { player: 1 }));
  assert.throws(() =>
    applyOperation(g, 0, card("add_cell"), { player: 0, row: -1, column: 0 }),
  );
});
test("shields consume the first removal and protect the selected line", () => {
  const g = make(),
    p = g.players[1];
  applyShield(p, "row", 1);
  assert.equal(
    applyOperation(g, 0, card("remove_row"), { player: 1, row: 1 }),
    "blocked",
  );
  assert.equal(p.matrix.length, 2);
  assert.equal(p.rowShields[1], false);
  assert.equal(
    applyOperation(g, 0, card("remove_row"), { player: 1, row: 1 }),
    "removed",
  );
  applyShield(p, "column", 0);
  assert.equal(removeColumn(p, 0), false);
  assert.equal(p.columnShields[0], false);
  assert.equal(p.matrix[0].length, 2);
});
test("swap rows and columns moves their shields with them", () => {
  const g = make();
  g.players[0].matrix = [
    [1, 2],
    [3, 4],
  ];
  applyShield(g.players[0], "row", 0);
  applyOperation(g, 0, card("swap_rows"), { player: 0, row: 0, second: 1 });
  assert.deepEqual(g.players[0].matrix, [
    [3, 4],
    [1, 2],
  ]);
  assert.deepEqual(g.players[0].rowShields, [false, true]);
  applyShield(g.players[0], "column", 0);
  applyOperation(g, 0, card("swap_columns"), {
    player: 0,
    column: 0,
    second: 1,
  });
  assert.deepEqual(g.players[0].matrix, [
    [4, 3],
    [2, 1],
  ]);
  assert.deepEqual(g.players[0].columnShields, [false, true]);
});
test("turn duration interpolates and clamps", () => {
  assert.equal(calculateTurnDuration(0), 6000);
  assert.equal(calculateTurnDuration(60000), 4500);
  assert.equal(calculateTurnDuration(120000), 3000);
  assert.equal(calculateTurnDuration(900000), 3000);
  assert.equal(calculateTurnDuration(-1), 6000);
});
test("normal operations consume a unique card, refill to eight, pass turn and reject replay", () => {
  const g = playing(),
    actor = g.active;
  g.cards[0] = card("add_cell");
  const seq = g.seq;
  useOperation(
    g,
    actor,
    "test-card",
    { player: actor, row: 0, column: 0 },
    seq,
    1500,
  );
  assert.equal(g.active, 1 - actor);
  assert.equal(g.cards.length, 8);
  assert.equal(new Set(g.cards.map((c) => c.id)).size, 8);
  assert.throws(() =>
    useOperation(
      g,
      actor,
      "test-card",
      { player: actor, row: 0, column: 0 },
      seq,
      1600,
    ),
  );
});
test("invalid actions never mutate state", () => {
  const g = playing(),
    before = structuredClone(g);
  assert.throws(() =>
    useOperation(g, 1 - g.active, g.cards[0].id, { player: 0 }, g.seq, 1200),
  );
  assert.deepEqual(g, before);
  assert.throws(() =>
    useOperation(g, g.active, g.cards[0].id, { player: 0 }, g.seq, 7000),
  );
});
test("timeout destroys exactly three cards, keeps five, passes turn", () => {
  const g = playing(),
    ids = g.cards.map((c) => c.id),
    actor = g.active;
  assert.equal(tickGame(g, 7000), "timeout");
  assert.equal(g.active, 1 - actor);
  assert.equal(g.cards.filter((c) => ids.includes(c.id)).length, 5);
  assert.equal(
    (g.events.find((e) => e.type === "TIMEOUT")!.data.destroyed as string[])
      .length,
    3,
  );
  assert.equal(g.cards.length, 8);
});
test("timeout can replace every position in the eight-tile pool", () => {
  const replaced = new Set<number>();
  for (let seed = 1; seed <= 50; seed++) {
    const g = make(seed);
    startGame(g, 1000);
    const ids = g.cards.map((c) => c.id);
    tickGame(g, 7000);
    g.cards.forEach((c, i) => {
      if (c.id !== ids[i]) replaced.add(i);
    });
  }
  assert.equal(replaced.size, 8);
});
test("all time amounts change the correct clock, consume tiles and preserve matrices", () => {
  for (const [operation, { seconds, clock }] of Object.entries(timeTiles)) {
    const g = playing(),
      actor = g.active,
      seq = g.seq;
    const before = structuredClone(g.players),
      endAt = g.endAt,
      turnEndsAt = g.turnEndsAt;
    g.cards[0] = card(operation as Card["operation"], Math.abs(seconds));
    const target = {
      player: clock === "turn" && seconds < 0 ? 1 - actor : actor,
    };
    useOperation(g, actor, "test-card", target, seq, 1500);
    assert.deepEqual(g.players, before);
    assert.equal(g.cards.length, 8);
    assert.ok(!g.cards.some((c) => c.id === "test-card"));
    assert.equal(new Set(g.cards.map((c) => c.id)).size, 8);
    assert.throws(() => useOperation(g, actor, "test-card", target, seq, 1501));
    if (clock === "match") {
      assert.equal(g.endAt, endAt + seconds * 1000);
      assert.equal(g.active, 1 - actor);
    } else {
      assert.equal(g.endAt, endAt);
      if (seconds > 0) {
        assert.equal(g.turnEndsAt, turnEndsAt + seconds * 1000);
        assert.equal(g.active, actor);
        assert.equal(g.seq, seq + 1);
      } else if (-seconds * 1000 >= calculateTurnDuration(500, g.config)) {
        assert.equal(g.active, actor);
        assert.equal(g.events.filter((e) => e.type === "TIMEOUT").length, 1);
        assert.equal(g.seq, seq + 2);
      } else {
        assert.equal(g.active, 1 - actor);
        assert.equal(
          g.turnEndsAt,
          1500 + calculateTurnDuration(500, g.config) + seconds * 1000,
        );
      }
    }
  }
});
test("match deductions finish at now, keep valid duration, and prevent revival", () => {
  for (const amount of [5, 10, 15]) {
    const g = playing(),
      actor = g.active;
    g.endAt = 1500 + amount * 1000 - 1;
    g.cards[0] = card(`sub_match_time_${amount}` as Card["operation"]);
    useOperation(g, actor, "test-card", { player: actor }, g.seq, 1500);
    assert.equal(g.status, "finished");
    assert.equal(g.endAt, 1500);
    assert.equal(g.events.at(-1)!.at, 1500);
    assert.equal(g.result!.reason, "clock");
    assert.deepEqual(g.result!.scores, [10, 10]);
    assert.throws(() =>
      useOperation(
        g,
        g.active,
        g.cards[0].id,
        { player: g.active },
        g.seq,
        1501,
      ),
    );
  }
});
test("turn bonuses stack but cannot extend the match, and invalid time targets never mutate", () => {
  const g = playing(),
    actor = g.active;
  const initialTurnEnd = g.turnEndsAt;
  for (const now of [1500, 1600]) {
    g.cards[0] = card("add_turn_time_15");
    const before = structuredClone(g);
    assert.throws(() =>
      useOperation(g, actor, "test-card", { player: 1 - actor }, g.seq, now),
    );
    assert.throws(() =>
      useOperation(
        g,
        actor,
        "test-card",
        { player: actor, row: 0 },
        g.seq,
        now,
      ),
    );
    assert.deepEqual(g, before);
    useOperation(g, actor, "test-card", { player: actor }, g.seq, now);
  }
  assert.equal(g.turnEndsAt, initialTurnEnd + 30000);
  g.endAt = 2000;
  assert.equal(tickGame(g, 2000), "finish");
  const expired = playing();
  expired.cards[0] = card("add_match_time_5");
  expired.turnEndsAt = expired.endAt + 1;
  const before = structuredClone(expired);
  assert.throws(() =>
    useOperation(
      expired,
      expired.active,
      "test-card",
      { player: expired.active },
      expired.seq,
      expired.endAt,
    ),
  );
  assert.deepEqual(expired, before);
});
test("clock targets are unique and time tiles cannot be played in a reflex stage", () => {
  const g = playing(),
    actor = g.active;
  for (const [id, { seconds, clock }] of Object.entries(timeTiles)) {
    const c = card(id as Card["operation"]);
    const player = clock === "turn" && seconds < 0 ? 1 - actor : actor;
    assert.deepEqual(legalTargets(g, actor, c), [{ player }]);
    assert.equal(validateTarget(g, actor, c, { player: 1 - player }), false);
  }
  grow(g, "row");
  g.cards[0] = card("add_turn_time_5");
  const before = structuredClone(g);
  assert.throws(() =>
    useOperation(g, actor, "test-card", { player: actor }, g.seq, 1200),
  );
  assert.deepEqual(g, before);
});
test("time generation uses fixed seconds and honors rarity and zero weights", () => {
  const g = make();
  g.config.numericMin = g.config.numericMax = 1;
  for (const id of Object.keys(timeTiles)) {
    g.config.weights = Object.fromEntries(
      operationIds.map((key) => [key, key === id ? 1 : 0]),
    ) as typeof g.config.weights;
    const c = generateOperation(g);
    assert.equal(c.operation, id);
    assert.equal(
      c.value,
      Math.abs(timeTiles[id as keyof typeof timeTiles].seconds),
    );
  }
  g.config.weights = Object.fromEntries(
    operationIds.map((id) => [id, 0]),
  ) as typeof g.config.weights;
  g.config.weights.add_match_time_5 = 3;
  g.config.weights.add_turn_time_5 = 0.3;
  let match = 0,
    turn = 0;
  for (let i = 0; i < 2000; i++) {
    const c = generateOperation(g);
    if (c.operation === "add_match_time_5") match++;
    else {
      assert.equal(c.operation, "add_turn_time_5");
      turn++;
    }
  }
  assert.ok(match > turn * 5 && match < turn * 15);
  for (const sign of ["add", "sub"])
    for (const amount of [5, 10, 15]) {
      const matchId = `${sign}_match_time_${amount}` as Card["operation"];
      const turnId = `${sign}_turn_time_${amount}` as Card["operation"];
      assert.ok(
        Math.abs(
          defaultBalance.weights[matchId] / defaultBalance.weights[turnId] - 10,
        ) < 1e-10,
      );
    }
});
test("transpose handles either rectangular matrix, moves shields, and reverses itself", () => {
  for (const player of [0, 1]) {
    const g = playing(),
      p = g.players[player],
      actor = g.active;
    p.matrix = [
      [1, -2, 3],
      [4, 5, 6],
    ];
    p.rowShields = [true, false];
    p.columnShields = [false, true, false];
    const before = structuredClone(p),
      other = structuredClone(g.players[1 - player]);
    const score = calculateScore(p.matrix);
    g.cards[0] = card("transpose");
    useOperation(g, actor, "test-card", { player }, g.seq, 1500);
    assert.deepEqual(p.matrix, [
      [1, 4],
      [-2, 5],
      [3, 6],
    ]);
    assert.deepEqual(p.rowShields, [false, true, false]);
    assert.deepEqual(p.columnShields, [true, false]);
    assert.equal(calculateScore(p.matrix), score);
    assert.equal(g.active, 1 - actor);
    assert.equal(g.cards.length, 8);
    assert.deepEqual(g.players[1 - player], other);
    applyOperation(g, g.active, card("transpose"), { player });
    assert.deepEqual(p, before);
  }
});
test("transpose rejects resulting dimension violations without mutation", () => {
  const g = playing(),
    actor = g.active;
  const p = g.players[actor];
  p.matrix = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  p.columnShields = [false, false, false];
  g.config.maxRows = 2;
  g.cards[0] = card("transpose");
  const before = structuredClone(g);
  assert.equal(validateTarget(g, actor, g.cards[0], { player: actor }), false);
  assert.throws(() =>
    useOperation(g, actor, "test-card", { player: actor }, g.seq, 1500),
  );
  assert.deepEqual(g, before);
  g.config.maxRows = 8;
  p.matrix = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  p.rowShields = [false, false, false];
  p.columnShields = [false, false];
  g.config.maxColumns = 2;
  assert.equal(validateTarget(g, actor, g.cards[0], { player: actor }), false);
});
test("older weights gain only new defaults, and non-arithmetic tiles cannot make a balance valid", () => {
  const weights: Record<string, number> = { ...defaultBalance.weights };
  delete weights.transpose;
  for (const id of Object.keys(timeTiles)) delete weights[id];
  weights.add_cell = 0;
  const parsed = balanceSchema.parse({ ...defaultBalance, weights });
  assert.equal(parsed.weights.add_cell, 0);
  assert.equal(parsed.weights.transpose, 6);
  assert.equal(parsed.weights.add_turn_time_15, 0.1);
  weights.add_turn_time_15 = 0;
  assert.equal(
    balanceSchema.parse({ ...defaultBalance, weights }).weights
      .add_turn_time_15,
    0,
  );
  const noArithmetic = Object.fromEntries(
    operationIds.map((id) => [
      id,
      id in timeTiles || id === "transpose" ? 1 : 0,
    ]),
  );
  assert.equal(
    balanceSchema.safeParse({ ...defaultBalance, weights: noArithmetic })
      .success,
    false,
  );
  for (const invalid of [
    null,
    [],
    { ...defaultBalance.weights, add_turn_time_5: -1 },
    { ...defaultBalance.weights, unknown: 1 },
  ])
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, weights: invalid }).success,
      false,
    );
  delete weights.sub_cell;
  assert.equal(
    balanceSchema.safeParse({ ...defaultBalance, weights }).success,
    false,
  );
  assert.equal(Object.keys(registry).length, operationIds.length);
  assert.ok(Object.values(registry).every((d) => d.description.length > 0));
});
test("weighted cards have a legal target and disabled operations never appear", () => {
  const g = make();
  for (let i = 0; i < 1000; i++) {
    const c = generateOperation(g);
    assert.ok([0, 1].some((a) => legalTargets(g, a, c).length));
  }
  g.config.weights.add_row = 0;
  for (let i = 0; i < 200; i++)
    assert.notEqual(generateOperation(g).operation, "add_row");
});
function grow(g: Game, axis: "row" | "column") {
  g.cards[0] = card(`add_${axis}`);
  useOperation(g, g.active, "test-card", { player: g.active }, g.seq, 1100);
}
test("growth skill starts at line width+1 and every hit adds exactly one", () => {
  for (const axis of ["row", "column"] as const) {
    const g = playing(),
      actor = g.active;
    grow(g, axis);
    assert.equal(g.minigame!.stage.number, 3);
    const s = g.minigame!.stage;
    const before = calculateScore(g.players[actor].matrix);
    skillHit(g, actor, s.id, s.x, s.y, 1200);
    assert.equal(calculateScore(g.players[actor].matrix), before + 1);
    assert.equal(g.minigame!.stage.number, 4);
    assert.ok(g.minigame!.stage.size < s.size);
    assert.ok(
      g.minigame!.stage.expiresAt - g.minigame!.stage.issuedAt <
        s.expiresAt - s.issuedAt,
    );
    assert.throws(() => skillHit(g, actor, s.id, s.x, s.y, 1300));
    assert.throws(() => skillHit(g, 1 - actor, 2, s.x, s.y, 1300));
  }
});
test("impossible skill attempts and clicks outside target are rejected", () => {
  const g = playing();
  grow(g, "row");
  const s = g.minigame!.stage;
  assert.throws(() => skillHit(g, g.active, s.id, s.x, s.y, 1101));
  assert.throws(() => skillHit(g, g.active, s.id, 0, 0, 1200));
  assert.throws(() => skillHit(g, g.active, s.id, s.x, s.y, s.expiresAt));
});
test("skill failure preserves points and passes turn; clock expiry preserves points", () => {
  const g = playing(),
    actor = g.active;
  grow(g, "row");
  const s = g.minigame!.stage;
  skillHit(g, actor, s.id, s.x, s.y, 1200);
  const sum = calculateScore(g.players[actor].matrix);
  assert.equal(tickGame(g, g.minigame!.stage.expiresAt), "skill_end");
  assert.equal(calculateScore(g.players[actor].matrix), sum);
  assert.equal(g.active, 1 - actor);
  g.cards[0] = card("add_column");
  useOperation(g, g.active, "test-card", { player: g.active }, g.seq, 3000);
  assert.equal(tickGame(g, g.endAt), "finish");
  assert.equal(g.status, "finished");
  assert.deepEqual(
    g.result!.scores,
    g.players.map((p) => calculateScore(p.matrix)),
  );
});
test("Elo win/loss/draw is standard and zero-sum", () => {
  assert.deepEqual(elo(1000, 1000, 1), [1016, 984]);
  assert.deepEqual(elo(1000, 1000, 0), [984, 1016]);
  assert.deepEqual(elo(1000, 1000, 0.5), [1000, 1000]);
  assert.equal(elo(1700, 800, 0)[0] + elo(1700, 800, 0)[1], 2500);
});
test("invalid balancing cannot leave a match without legal operations", () => {
  assert.throws(() =>
    balanceSchema.parse({
      ...defaultBalance,
      weights: Object.fromEntries(
        Object.keys(defaultBalance.weights).map((k) => [k, 0]),
      ),
    }),
  );
  assert.throws(() => balanceSchema.parse({ ...defaultBalance, maxRows: 100 }));
  assert.throws(() =>
    balanceSchema.parse({ ...defaultBalance, turnEndMs: 9000 }),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBalance,
  balanceSchema,
  operationIds,
  timeTiles,
  protectTiles,
  queueSchema,
  roomCreateSchema,
  speeds,
  gameStages,
} from "../lib/config";

test("multiplayer speed scales match and opening turns, keeping the same floor", () => {
  for (const speed of speeds) {
    const g = createGame(
      "speed",
      1,
      [
        { id: "a", name: "A", registered: false },
        { id: "b", name: "B", registered: false },
      ],
      defaultBalance,
      1000,
      speed === 1 ? "ranked" : "casual",
      speed,
    );
    startGame(g, 1000);
    assert.equal(g.endAt - g.startedAt, 120000 * speed);
    assert.equal(g.turnEndsAt - g.startedAt, 6000 * speed);
    assert.equal(
      calculateTurnDuration(g.config.matchMs / 2, g.config),
      (6000 * speed + 3000) / 2,
    );
    assert.equal(calculateTurnDuration(g.config.matchMs, g.config), 3000);
    assert.equal(calculateTurnDuration(g.config.matchMs * 2, g.config), 3000);
    assert.equal(publicGame(g).speed, speed);
    assert.equal(roomCreateSchema.parse({ speed }).speed, speed);
    assert.equal(queueSchema.parse({ mode: "casual", speed }).speed, speed);
  }
  assert.deepEqual(queueSchema.parse({}), {
    consent: false,
    mode: "ranked",
    speed: 1,
  });
  for (const request of [
    { mode: "ranked", speed: 2 },
    { mode: "custom", speed: 1 },
    { mode: "casual", speed: 4 },
    { mode: "casual", speed: 2, rated: true },
  ])
    assert.equal(queueSchema.safeParse(request).success, false);
  assert.equal(defaultBalance.turnStartMs, 6000);
});
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
  isShieldActive,
  isCellProtected,
  calculateTurnDuration,
  determineWinner,
  elo,
  legalTargets,
  generateOperation,
  startGame,
  getGameStage,
  advancePracticeStage,
  useOperation,
  tickGame,
  publicGame,
  finishGame,
  playPracticeAI,
  skipPracticeTurn,
  skipTurn,
  registry,
  validateTarget,
  type Card,
  type Game,
  type Target,
} from "../lib/engine";
const players = [
  { id: "a", name: "A", registered: true },
  { id: "b", name: "B", registered: true },
];
const make = (seed = 42) =>
  createGame("test", seed, players, defaultBalance, 1000);
test("event history retains the original deck after moves and timeouts", () => {
  const g = make();
  const history = structuredClone(g.events);
  startGame(g, 1000);
  const c = g.cards.find((c) => legalTargets(g, g.active, c, 1100).length)!;
  useOperation(
    g,
    g.active,
    c.id,
    legalTargets(g, g.active, c, 1100)[0],
    g.seq,
    1100,
  );
  tickGame(g, 10000);
  assert.deepEqual(g.events.slice(0, history.length), history);
});
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
  assert.equal(publicGame(make()).cards.length, 4);
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
test("match i is seeded, inclusive, public, recorded and fixed through play", () => {
  const values = new Set<number>();
  for (let seed = 1; seed <= 500; seed++) {
    const g = make(seed);
    assert.ok(Number.isInteger(g.iValue) && g.iValue >= 1 && g.iValue <= 50);
    values.add(g.iValue);
    assert.equal(publicGame(g).iValue, g.iValue);
    assert.equal(
      g.events.find((e) => e.type === "RESERVED")!.data.iValue,
      g.iValue,
    );
  }
  assert.ok(values.has(1) && values.has(50));
  for (const mode of [
    "ranked",
    "casual",
    "custom",
    "ai",
    "practice",
  ] as const) {
    const g = createGame("i", 42, players, defaultBalance, 1000, mode);
    const iValue = g.iValue;
    assert.equal(
      createGame("i", 42, players, defaultBalance, 1000, mode).iValue,
      iValue,
    );
    startGame(g, 1000);
    g.cards[0] = card("sqrt_cell");
    useOperation(
      g,
      g.active,
      "test-card",
      { player: 0, row: 0, column: 0 },
      g.seq,
      1500,
    );
    if (mode !== "practice") tickGame(g, g.turnEndsAt);
    finishGame(g, 8000);
    assert.equal(g.iValue, iValue);
    assert.equal(publicGame(g).iValue, iValue);
  }
});
test("square roots substitute i per cell, round down last, clamp and pass the turn", () => {
  for (const [input, iValue, expected] of [
    [-9, 7, 21],
    [-10, 7, 22],
    [-2, 7, 9],
    [-1, 7, 7],
    [2, 7, 1],
    [9, 7, 3],
    [0, 7, 0],
    [-2, 1, 1],
    [-4, 50, 100],
    [-100, 50, 100],
  ]) {
    for (const player of [0, 1]) {
      const g = playing(),
        actor = g.active;
      g.iValue = iValue;
      g.config.maxCellValue = 100;
      g.players[player].matrix = [
        [input, -16],
        [25, 0],
      ];
      const other = structuredClone(g.players[1 - player]);
      g.cards[0] = card("sqrt_cell", 1);
      const beforeInvalid = structuredClone(g);
      assert.throws(() =>
        useOperation(
          g,
          actor,
          "test-card",
          { player, row: 2, column: 0 },
          g.seq,
          1500,
        ),
      );
      assert.deepEqual(g, beforeInvalid);
      useOperation(
        g,
        actor,
        "test-card",
        { player, row: 0, column: 0 },
        g.seq,
        1500,
      );
      assert.deepEqual(g.players[player].matrix, [
        [expected, -16],
        [25, 0],
      ]);
      assert.deepEqual(g.players[1 - player], other);
      assert.equal(calculateScore(g.players[player].matrix), expected + 9);
      assert.equal(g.active, 1 - actor);
      assert.equal(g.cards.length, 4);
      assert.ok(g.cards.every((c) => c.id !== "test-card"));
      assert.equal(g.iValue, iValue);
    }
  }
});
test("square-root weights fill missing settings, preserve zero and generate a fixed-value tile", () => {
  const config = structuredClone(defaultBalance);
  for (const stage of gameStages)
    Reflect.deleteProperty(config.weights[stage], "sqrt_cell");
  const parsed = balanceSchema.parse(config);
  for (const stage of gameStages) {
    assert.equal(parsed.weights[stage].sqrt_cell, 6);
    config.weights[stage].sqrt_cell = 0;
  }
  assert.equal(balanceSchema.parse(config).weights.early.sqrt_cell, 0);
  const g = createGame("sqrt", 42, players, config, 1000);
  for (let i = 0; i < 100; i++)
    assert.notEqual(generateOperation(g).operation, "sqrt_cell");
  for (const id of operationIds)
    g.config.weights.early[id] = id === "sqrt_cell" ? 6 : 0;
  const generated = generateOperation(g);
  assert.equal(generated.operation, "sqrt_cell");
  assert.equal(generated.value, 1);
});
test("power limits combine discards and independent boosts in every mode and reset each game", () => {
  for (const mode of [
    "ranked",
    "casual",
    "custom",
    "ai",
    "practice",
  ] as const) {
    const g = createGame("limits", 42, players, defaultBalance, 1000, mode);
    startGame(g, 1000);
    const actor = g.active;
    const p = g.players[actor];
    const matrices = structuredClone(g.players.map((p) => p.matrix));
    assert.deepEqual(
      g.players.map((p) => [p.maxSquare, p.maxCube]),
      [
        [0, 0],
        [0, 0],
      ],
    );
    g.cards[0] = card("add_max_cube", 3);
    const seq = g.seq;
    assert.deepEqual(legalTargets(g, actor, g.cards[0]), [{ player: actor }]);
    assert.equal(
      useOperation(g, actor, "test-card", { player: actor }, seq, 1100),
      "power_limit",
    );
    assert.equal(g.active, 1 - actor);
    assert.equal(g.seq, seq + 1);
    assert.equal(g.cards.length, 4);
    assert.ok(!g.cards.some((c) => c.id === "test-card"));
    assert.deepEqual([p.destroyedTiles, p.maxSquare, p.maxCube], [0, 0, 3]);
    assert.deepEqual(
      g.players.map((p) => p.matrix),
      matrices,
    );
    assert.equal(
      g.events.findLast((e) => e.type === "OPERATION")!.data.effect,
      "power_limit",
    );
    skipTurn(g, 1 - actor, g.seq, 1200);
    skipTurn(g, actor, g.seq, 1300);
    assert.deepEqual([p.destroyedTiles, p.maxSquare, p.maxCube], [2, 2, 5]);
    assert.deepEqual(
      [g.players[1 - actor].maxSquare, g.players[1 - actor].maxCube],
      [2, 2],
    );
    if (mode === "practice") skipTurn(g, g.active, g.seq, 1400);
    else assert.equal(tickGame(g, g.turnEndsAt), "timeout");
    g.cards[0] = card("add_max_square", 5);
    useOperation(
      g,
      actor,
      "test-card",
      { player: actor },
      g.seq,
      mode === "practice" ? 1500 : g.turnEndsAt - 1,
    );
    assert.deepEqual([p.destroyedTiles, p.maxSquare, p.maxCube], [2, 7, 5]);
    const view = JSON.parse(JSON.stringify(publicGame(g)));
    assert.deepEqual(
      [view.players[actor].maxSquare, view.players[actor].maxCube],
      [7, 5],
    );
    const fresh = createGame("fresh", 42, players, defaultBalance, 1000, mode);
    assert.deepEqual(
      fresh.players.map((p) => [p.maxSquare, p.maxCube]),
      [
        [0, 0],
        [0, 0],
      ],
    );
  }
  for (const operation of ["add_max_square", "add_max_cube"] as const)
    for (const value of [1, 2, 3, 4, 5]) {
      const g = playing(),
        actor = g.active,
        p = g.players[actor];
      p.maxSquare = p.maxCube = 10000;
      g.cards[0] = card(operation, value);
      useOperation(g, actor, "test-card", { player: actor }, g.seq, 1500);
      assert.equal(
        p[operation === "add_max_square" ? "maxSquare" : "maxCube"],
        10000 + value,
      );
      assert.equal(
        p[operation === "add_max_square" ? "maxCube" : "maxSquare"],
        10000,
      );
      assert.equal(p.destroyedTiles, 0);
    }
});

test("cell powers use the actor's independent magnitude limits and reject invalid targets without mutation", () => {
  for (const operation of ["square_cell", "cube_cell"] as const)
    for (const player of [0, 1])
      for (const value of [-100, -9, -8, 0, 8, 9, 100]) {
        const g = playing(),
          actor = g.active;
        g.players[1 - actor].maxSquare = g.players[1 - actor].maxCube = 1000;
        const limit = operation === "square_cell" ? "maxSquare" : "maxCube";
        g.players[actor][limit] = 8;
        g.players[actor][limit === "maxSquare" ? "maxCube" : "maxSquare"] = 0;
        g.players[player].matrix[0][0] = value;
        g.cards[0] = card(operation);
        const target = { player, row: 0, column: 0 };
        const allowed = Math.abs(value) <= 8;
        assert.equal(validateTarget(g, actor, g.cards[0], target), allowed);
        assert.deepEqual(
          legalTargets(publicGame(g), actor, g.cards[0]),
          legalTargets(g, actor, g.cards[0]),
        );
        const before = structuredClone(g);
        if (!allowed) {
          assert.throws(
            () => useOperation(g, actor, "test-card", target, g.seq, 1500),
            /Illegal target/,
          );
          assert.deepEqual(g, before);
        } else {
          useOperation(g, actor, "test-card", target, g.seq, 1500);
          assert.equal(
            g.players[player].matrix[0][0],
            value ** (operation === "square_cell" ? 2 : 3),
          );
          assert.equal(g.players[actor][limit], 8);
          assert.deepEqual(
            g.players[player].matrix[1],
            before.players[player].matrix[1],
          );
        }
      }
  const g = playing(),
    actor = g.active;
  for (const operation of ["square_cell", "cube_cell"] as const) {
    g.players[actor].matrix[0][0] = 0;
    assert.equal(
      validateTarget(g, actor, card(operation), {
        player: actor,
        row: 0,
        column: 0,
      }),
      true,
    );
    g.players[actor].matrix[0][0] = 1;
    assert.equal(
      validateTarget(g, actor, card(operation), {
        player: actor,
        row: 0,
        column: 0,
      }),
      false,
    );
    assert.equal(
      validateTarget(g, actor, card(operation), { player: actor, row: 0 }),
      false,
    );
  }
  for (const operation of ["add_max_square", "add_max_cube"] as const) {
    assert.equal(
      validateTarget(g, actor, card(operation), { player: 1 - actor }),
      false,
    );
    assert.equal(
      validateTarget(g, actor, card(operation), { player: actor, row: 0 }),
      false,
    );
    for (const value of [-1, 0, 1.5, 6, NaN])
      assert.equal(
        validateTarget(g, actor, card(operation, value), { player: actor }),
        false,
      );
  }
});

test("new scoped arithmetic works on either matrix, replaces its card and passes", () => {
  const original = [
    [-3, 2],
    [0, 4],
  ];
  for (const [kind, values] of [
    [
      "square",
      [
        [9, 4],
        [0, 16],
      ],
    ],
    [
      "cube",
      [
        [-27, 8],
        [0, 64],
      ],
    ],
    [
      "sqrt",
      [
        [12, 1],
        [0, 2],
      ],
    ],
    [
      "absolute",
      [
        [3, 2],
        [0, 4],
      ],
    ],
  ] as const)
    for (const scope of kind === "square" || kind === "cube"
      ? ["cell"]
      : kind === "absolute"
        ? ["cell", "row", "column", "matrix"]
        : ["cell", "row", "column"])
      for (const player of [0, 1]) {
        const g = playing(),
          actor = g.active;
        g.iValue = 7;
        g.players[actor].maxSquare = g.players[actor].maxCube = 4;
        g.players[player].matrix = structuredClone(original);
        const other = structuredClone(g.players[1 - player]);
        const operation = `${kind}_${scope}` as Card["operation"];
        g.cards[0] = card(operation, 999);
        const target = {
          player,
          ...(scope === "cell" || scope === "row" ? { row: 0 } : {}),
          ...(scope === "cell" || scope === "column" ? { column: 0 } : {}),
        };
        assert.deepEqual(
          legalTargets(publicGame(g), actor, g.cards[0]),
          legalTargets(g, actor, g.cards[0]),
        );
        useOperation(g, actor, "test-card", target, g.seq, 1500);
        assert.deepEqual(
          g.players[player].matrix,
          original.map((r, row) =>
            r.map((v, column) =>
              scope === "matrix" ||
              (scope === "cell" && row === 0 && column === 0) ||
              (scope === "row" && row === 0) ||
              (scope === "column" && column === 0)
                ? values[row][column]
                : v,
            ),
          ),
        );
        assert.deepEqual(g.players[1 - player], other);
        assert.equal(g.active, 1 - actor);
        assert.equal(g.cards.length, 4);
        assert.ok(!g.cards.some((c) => c.id === "test-card"));
      }
  for (const [operation, input, expected] of [
    ["square_cell", -1000, 100],
    ["cube_cell", -1000, -100],
    ["cube_cell", 1000, 100],
    ["reverse_digits_cell", 123, 100],
    ["factorial_cell", 5, 100],
    ["fibonacci_cell", 15, 100],
  ] as const) {
    const g = playing();
    g.config.maxCellValue = 100;
    g.players[0].maxSquare = g.players[0].maxCube = 1000;
    g.players[0].matrix[0][0] = input;
    applyOperation(g, 0, card(operation), { player: 0, row: 0, column: 0 });
    assert.equal(g.players[0].matrix[0][0], expected);
  }
});
test("factorial, Fibonacci, strict primes and reversed digits enforce their domains", () => {
  const cases: [Card["operation"], number, number | null][] = [
    ...[1, 1, 2, 6, 24, 120].map(
      (result, input): [Card["operation"], number, number] => [
        "factorial_cell",
        input,
        result,
      ],
    ),
    ["factorial_cell", -1, null],
    ["factorial_cell", 6, null],
    ["fibonacci_cell", 0, 0],
    ["fibonacci_cell", 1, 1],
    ["fibonacci_cell", 2, 1],
    ["fibonacci_cell", 15, 610],
    ["fibonacci_cell", -1, null],
    ["fibonacci_cell", 16, null],
    ["fibonacci_cell", 20, null],
    ["next_prime_cell", -10000, 2],
    ["next_prime_cell", 0, 2],
    ["next_prime_cell", 1, 2],
    ["next_prime_cell", 2, 3],
    ["next_prime_cell", 7, 11],
    ["next_prime_cell", 9972, 9973],
    ["next_prime_cell", 9973, null],
    ["next_prime_cell", 10000, null],
    ["previous_prime_cell", -7, null],
    ["previous_prime_cell", 0, null],
    ["previous_prime_cell", 1, null],
    ["previous_prime_cell", 2, null],
    ["previous_prime_cell", 3, 2],
    ["previous_prime_cell", 11, 7],
    ["previous_prime_cell", 10000, 9973],
    ["reverse_digits_cell", -120, -21],
    ["reverse_digits_cell", 0, 0],
    ["reverse_digits_cell", 1000, 1],
    ["reverse_digits_cell", 123, 321],
  ];
  for (const [operation, input, expected] of cases)
    for (const player of [0, 1]) {
      const g = playing(),
        actor = g.active;
      const target = { player, row: 0, column: 0 };
      g.players[player].matrix[0][0] = input;
      g.cards[0] = card(operation, 999);
      const before = structuredClone(g);
      assert.equal(
        validateTarget(g, actor, g.cards[0], target),
        expected !== null,
      );
      assert.deepEqual(
        legalTargets(publicGame(g), actor, g.cards[0]),
        legalTargets(g, actor, g.cards[0]),
      );
      if (expected === null) {
        assert.throws(
          () => useOperation(g, actor, "test-card", target, g.seq, 1500),
          /Illegal target/,
        );
        assert.deepEqual(g, before);
      } else {
        useOperation(g, actor, "test-card", target, g.seq, 1500);
        assert.equal(g.players[player].matrix[0][0], expected);
        assert.deepEqual(g.players[1 - player], before.players[1 - player]);
        assert.equal(g.active, 1 - actor);
        assert.equal(g.cards.length, 4);
      }
    }
  const g = make();
  g.config.maxCellValue = 100;
  g.players[0].matrix = [
    [96, 97],
    [99, 100],
  ];
  assert.deepEqual(
    legalTargets(publicGame(g), 0, card("next_prime_cell")).filter(
      (t) => t.player === 0,
    ),
    [{ player: 0, row: 0, column: 0 }],
  );
  for (const operation of ["factorial_cell", "fibonacci_cell"] as const)
    assert.equal(
      validateTarget(g, 0, card(operation), { player: 0, row: 0, column: 0 }),
      false,
    );
});
test("determinant replaces only the selected cell and stays exact before clamping", () => {
  const cancellation = [
    [999999, 999998, 0, 0],
    [1000000, 999999, 0, 0],
    [0, 0, 999999, 999998],
    [0, 0, 1000000, 999999],
  ];
  const cases: [number[][], number][] = [
    [[[-5]], -5],
    [
      [
        [1, 2],
        [3, 4],
      ],
      -2,
    ],
    [
      [
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ],
      -306,
    ],
    [
      [
        [2, 1, 1, 1],
        [0, -3, 1, 1],
        [0, 0, 4, 1],
        [0, 0, 0, 5],
      ],
      -120,
    ],
    [
      Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (r === c ? r + 2 : 0)),
      ),
      720,
    ],
    [cancellation, 1],
    [cancellation.map((r) => [...r, 0]).concat([[0, 0, 0, 0, 1]]), 1],
    [
      [
        [1000000, 1000000],
        [1000000, 1000000],
      ],
      0,
    ],
    [
      Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (r === c ? 1000000 : 0)),
      ),
      10000,
    ],
    [
      [
        [0, 1000000],
        [1000000, 0],
      ],
      -10000,
    ],
  ];
  for (const [matrix, expected] of cases)
    for (const player of [0, 1]) {
      const g = playing(),
        actor = g.active;
      g.players[player].matrix = structuredClone(matrix);
      const row = matrix.length - 1,
        column = matrix.length - 1;
      g.cards[0] = card("determinant_cell");
      useOperation(g, actor, "test-card", { player, row, column }, g.seq, 1500);
      const result = structuredClone(matrix);
      result[row][column] = expected;
      assert.deepEqual(g.players[player].matrix, result);
      assert.doesNotThrow(() => JSON.stringify(g));
    }
  const g = playing();
  g.players[0].matrix = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  g.players[1].matrix = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  g.cards[0] = card("determinant_cell");
  assert.deepEqual(legalTargets(g, 0, g.cards[0]), []);
  const before = structuredClone(g);
  assert.throws(
    () =>
      useOperation(
        g,
        g.active,
        "test-card",
        { player: 0, row: 0, column: 0 },
        g.seq,
        1500,
      ),
    /Illegal target/,
  );
  assert.deepEqual(g, before);
});
test("new arithmetic weights migrate, generate fixed cards and cannot strand draws", () => {
  const unary = operationIds.filter((id) =>
    [
      "square",
      "cube",
      "sqrt",
      "absolute",
      "factorial",
      "fibonacci",
      "next_prime",
      "previous_prime",
      "reverse",
      "determinant",
    ].includes(registry[id].kind),
  );
  assert.equal(unary.length, 15);
  const legacy = structuredClone(defaultBalance);
  for (const stage of gameStages) {
    for (const id of unary) Reflect.deleteProperty(legacy.weights[stage], id);
    legacy.weights[stage].add_cell = 0;
  }
  const migrated = balanceSchema.parse(legacy);
  for (const stage of gameStages) {
    for (const id of unary) assert.equal(migrated.weights[stage][id], 6);
    assert.equal(migrated.weights[stage].add_cell, 0);
  }
  for (const id of unary) {
    const g = make();
    for (const p of g.players) p.maxSquare = p.maxCube = 10000;
    g.config.weights.early = Object.fromEntries(
      operationIds.map((key) => [key, key === id ? 6 : 0]),
    ) as typeof g.config.weights.early;
    assert.equal(generateOperation(g).operation, id);
    assert.equal(generateOperation(g).value, 1);
    g.config.weights.early[id] = 0;
    g.config.weights.early.add_cell = 1;
    assert.equal(generateOperation(g).operation, "add_cell");
  }
  for (const id of [
    "factorial_cell",
    "fibonacci_cell",
    "next_prime_cell",
    "previous_prime_cell",
    "determinant_cell",
  ] as const) {
    const weights = Object.fromEntries(
      operationIds.map((key) => [key, key === id ? 6 : 0]),
    );
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, weights }).success,
      false,
    );
    const config = balanceSchema.parse({
      ...defaultBalance,
      weights: { ...weights, add_cell: 1 },
    });
    const g = createGame("conditional", 42, players, config, 1000);
    const input = id === "previous_prime_cell" ? 0 : g.config.maxCellValue;
    for (const p of g.players) p.matrix = [[input, input]];
    for (let draw = 0; draw < 10; draw++)
      assert.equal(generateOperation(g).operation, "add_cell");
  }
});
test("power tile settings discard removed scopes and boosters draw all five values independently of arithmetic", () => {
  const removed = ["square_row", "square_column", "cube_row", "cube_column"];
  const legacy = structuredClone(defaultBalance);
  for (const stage of gameStages) {
    Reflect.deleteProperty(legacy.weights[stage], "add_max_square");
    Reflect.deleteProperty(legacy.weights[stage], "add_max_cube");
    Object.assign(
      legacy.weights[stage],
      Object.fromEntries(removed.map((id) => [id, 8])),
    );
    legacy.weights[stage].square_cell = 0;
  }
  const parsed = balanceSchema.parse(legacy);
  for (const stage of gameStages) {
    assert.equal(parsed.weights[stage].add_max_square, 6);
    assert.equal(parsed.weights[stage].add_max_cube, 6);
    assert.equal(parsed.weights[stage].square_cell, 0);
    for (const id of removed) {
      assert.ok(!(id in parsed.weights[stage]));
      assert.ok(!(id in registry));
    }
  }
  parsed.weights.early.add_max_cube = 0;
  assert.equal(balanceSchema.parse(parsed).weights.early.add_max_cube, 0);
  for (const operation of [
    "add_max_square",
    "add_max_cube",
    "square_cell",
    "cube_cell",
  ] as const) {
    const weights = Object.fromEntries(
      operationIds.map((id) => [id, id === operation ? 6 : 0]),
    );
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, weights }).success,
      false,
    );
    if (operation === "square_cell" || operation === "cube_cell") {
      const g = make();
      g.config.weights.early = {
        ...g.config.weights.early,
        ...weights,
        add_cell: 1,
      };
      for (let i = 0; i < 20; i++)
        assert.equal(generateOperation(g).operation, "add_cell");
      continue;
    }
    const values = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const g = make(seed);
      g.config.numericMin = g.config.numericMax = 3;
      g.config.weights.early = { ...g.config.weights.early, ...weights };
      for (let i = 0; i < 20; i++) {
        const drawn = generateOperation(g);
        assert.equal(drawn.operation, operation);
        values.add(drawn.value);
      }
    }
    assert.deepEqual(values, new Set([1, 2, 3, 4, 5]));
  }
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
test("cell ceiling defaults to 10,000, rejects higher settings and caps arithmetic", () => {
  assert.equal(defaultBalance.maxCellValue, 10000);
  for (const maxCellValue of [100, 10000])
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, maxCellValue }).success,
      true,
    );
  for (const maxCellValue of [99, 10001, 1000000])
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, maxCellValue }).success,
      false,
    );
  for (const [operation, input, expected] of [
    ["add_cell", 9999, 10000],
    ["sub_cell", -9999, -10000],
    ["multiply_cell", 6000, 10000],
    ["multiply_row", -6000, -10000],
    ["multiply_column", 6000, 10000],
    ["add_matrix", 9999, 10000],
    ["sub_matrix", -9999, -10000],
    ["square_cell", -101, 10000],
    ["cube_cell", -30, -10000],
    ["multiply_cell", 4999, 9998],
    ["negate_cell", -10000, 10000],
    ["multiply_cell", 0, 0],
  ] as const) {
    const g = make();
    g.players[0].matrix[0][0] = input;
    g.players[0].maxSquare = g.players[0].maxCube = Math.abs(input);
    applyOperation(
      g,
      0,
      card(operation, operation.startsWith("negate") ? -1 : 2),
      { player: 0, row: 0, column: 0 },
    );
    assert.equal(g.players[0].matrix[0][0], expected);
  }
  assert.equal(calculateScore([[10000, 10000]]), 20000);
});
test("growth caps new cells without spending the destroyed-tile total", () => {
  for (const [maxCellValue, destroyedTiles, expected] of [
    [100, 0, 0],
    [100, 99, 99],
    [100, 100, 100],
    [100, 101, 100],
    [10000, 9999, 9999],
    [10000, 10000, 10000],
    [10000, 10001, 10000],
  ]) {
    const g = make(),
      p = g.players[0];
    g.config.maxCellValue = maxCellValue;
    p.destroyedTiles = destroyedTiles;
    addRow(p, g.config);
    assert.deepEqual(p.matrix[2], [expected, expected]);
    addColumn(p, g.config);
    assert.deepEqual(
      p.matrix.map((row) => row[2]),
      [expected, expected, expected],
    );
    assert.equal(p.destroyedTiles, destroyedTiles);
  }
});
test("grow and remove rows/columns, retain rectangularity and final line", () => {
  const g = make(),
    p = g.players[0];
  addRow(p, g.config);
  assert.deepEqual(p.matrix[2], [0, 0]);
  addColumn(p, g.config);
  assert.deepEqual(
    p.matrix.map((r) => r[2]),
    [0, 0, 0],
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
test("matrix limits default to 5×5 and reject a sixth row or column", () => {
  assert.equal(defaultBalance.maxRows, 5);
  assert.equal(defaultBalance.maxColumns, 5);
  for (const axis of ["maxRows", "maxColumns"] as const) {
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, [axis]: 5 }).success,
      true,
    );
    assert.equal(
      balanceSchema.safeParse({ ...defaultBalance, [axis]: 6 }).success,
      false,
    );
  }
  const g = make(),
    p = g.players[0];
  for (let i = 2; i < 5; i++) {
    addRow(p, g.config);
    addColumn(p, g.config);
  }
  const before = structuredClone(p);
  assert.equal(p.matrix.length, 5);
  assert.equal(p.matrix[0].length, 5);
  assert.throws(() => addRow(p, g.config), /Maximum rows/);
  assert.throws(() => addColumn(p, g.config), /Maximum columns/);
  assert.equal(validateTarget(g, 0, card("add_row"), { player: 0 }), false);
  assert.equal(validateTarget(g, 0, card("add_column"), { player: 0 }), false);
  assert.deepEqual(p, before);
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
test("every Protect tier blocks repeated removals until its exact server deadline", () => {
  for (const [id, { target, seconds }] of Object.entries(protectTiles)) {
    const g = playing(),
      actor = g.active,
      p = g.players[actor];
    const axis = target === "ROW" ? "row" : "column";
    const t = { player: actor, [axis]: 0 };
    const protect = card(id as Card["operation"], 999);
    const before = structuredClone(g);
    for (const invalid of [
      { ...t, player: 1 - actor },
      { ...t, [axis]: -1 },
      { ...t, [axis]: 2 },
      { player: actor },
    ])
      assert.throws(() => applyOperation(g, actor, protect, invalid, 1500));
    assert.deepEqual(g, before);
    g.cards[0] = protect;
    assert.equal(useOperation(g, actor, "test-card", t, g.seq, 1500), "shield");
    const shields = axis === "row" ? p.rowShields : p.columnShields;
    const expiresAt = 1500 + seconds * 1000;
    assert.equal(shields[0], expiresAt);
    assert.equal(g.active, 1 - actor);
    assert.equal(g.cards.length, 4);
    assert.ok(!g.cards.some((c) => c.id === "test-card"));
    assert.equal(calculateScore(p.matrix), 10);
    assert.equal(
      JSON.parse(JSON.stringify(publicGame(g))).players[actor][
        axis === "row" ? "rowShields" : "columnShields"
      ][0],
      expiresAt,
    );
    const protectedPlayers = structuredClone(g.players);
    const attack = card(`remove_${axis}`);
    for (const now of [1501, expiresAt - 1]) {
      assert.equal(isShieldActive(shields[0], now), true);
      assert.equal(applyOperation(g, 1 - actor, attack, t, now), "blocked");
      assert.deepEqual(g.players, protectedPlayers);
      assert.equal(validateTarget(g, actor, protect, t, now), false);
      assert.equal(
        validateTarget(g, actor, card(`${axis}_shield`), t, now),
        false,
      );
      assert.ok(
        !legalTargets(g, actor, protect, now).some((x) => x[axis] === 0),
      );
      assert.throws(() => applyOperation(g, actor, protect, t, now));
    }
    assert.equal(isShieldActive(shields[0], expiresAt), false);
    assert.equal(validateTarget(g, actor, protect, t, expiresAt), true);
    assert.ok(
      legalTargets(g, actor, protect, expiresAt).some((x) => x[axis] === 0),
    );
    const expired = structuredClone(g);
    applyOperation(expired, actor, protect, t, expiresAt);
    assert.equal(
      (axis === "row"
        ? expired.players[actor].rowShields
        : expired.players[actor].columnShields)[0],
      expiresAt + seconds * 1000,
    );
    assert.equal(applyOperation(g, 1 - actor, attack, t, expiresAt), "removed");
    assert.equal(p.rowShields.length, p.matrix.length);
    assert.equal(p.columnShields.length, p.matrix[0].length);
  }
});
test("every Protect tier preserves all its cells against opponent arithmetic until expiry", () => {
  for (const [id, { target, seconds }] of Object.entries(protectTiles))
    for (const owner of [0, 1]) {
      const g = playing(),
        p = g.players[owner],
        axis = target === "ROW" ? "row" : "column",
        expiresAt = 1500 + seconds * 1000;
      p.matrix = [
        [5, -16],
        [15, -36],
      ];
      for (const player of g.players) player.maxSquare = player.maxCube = 36;
      applyOperation(
        g,
        owner,
        card(id as Card["operation"]),
        { player: owner, [axis]: 0 },
        1500,
      );
      for (const operation of operationIds.filter(
        (id) =>
          ![
            "grow",
            "remove",
            "shield",
            "time",
            "unlock",
            "power_limit",
          ].includes(registry[id].kind),
      )) {
        const attack = card(operation, operation.startsWith("negate") ? -1 : 2);
        for (const t of legalTargets(g, 1 - owner, attack, 1600).filter(
          (t) => t.player === owner,
        )) {
          const own = structuredClone(g),
            opponent = structuredClone(g),
            expired = structuredClone(g);
          assert.equal(
            applyOperation(own, owner, attack, t, 1600),
            "arithmetic",
          );
          assert.equal(
            applyOperation(expired, 1 - owner, attack, t, expiresAt),
            "arithmetic",
          );
          assert.deepEqual(
            expired.players[owner].matrix,
            own.players[owner].matrix,
          );
          const expected = own.players[owner].matrix.map((r, row) =>
            r.map((v, column) =>
              (axis === "row" ? row === 0 : column === 0)
                ? p.matrix[row][column]
                : v,
            ),
          );
          const effect = applyOperation(
            opponent,
            1 - owner,
            attack,
            t,
            expiresAt - 1,
          );
          assert.deepEqual(
            opponent.players[owner].matrix,
            expected,
            `${id}: ${operation} ${JSON.stringify(t)}`,
          );
          assert.equal(
            effect,
            p.matrix.some((r, row) =>
              r.some(
                (_, column) =>
                  !isCellProtected(p, row, column, expiresAt - 1) &&
                  (registry[operation].target === "MATRIX" ||
                    (registry[operation].target === "ROW" && row === t.row) ||
                    (registry[operation].target === "COLUMN" &&
                      column === t.column) ||
                    (registry[operation].target === "CELL" &&
                      row === t.row &&
                      column === t.column)),
              ),
            )
              ? "arithmetic"
              : "blocked",
          );
          assert.deepEqual(opponent.players[1 - owner], g.players[1 - owner]);
          assert.deepEqual(opponent.players[owner].rowShields, p.rowShields);
          assert.deepEqual(
            opponent.players[owner].columnShields,
            p.columnShields,
          );
        }
      }
    }
});
test("Protect blocks crossing removals without consuming protection", () => {
  for (const [id, { target, seconds }] of Object.entries(protectTiles))
    for (const owner of [0, 1]) {
      const g = playing(),
        axis = target === "ROW" ? "row" : "column",
        expiresAt = 1500 + seconds * 1000;
      applyOperation(
        g,
        owner,
        card(id as Card["operation"]),
        { player: owner, [axis]: 0 },
        1500,
      );
      for (const operation of ["remove_row", "remove_column"] as const)
        for (const index of [0, 1]) {
          const t = {
              player: owner,
              [operation === "remove_row" ? "row" : "column"]: index,
            },
            attack = card(operation),
            probe = structuredClone(g),
            expired = structuredClone(g);
          const blocked = operation !== `remove_${axis}` || index === 0;
          probe.active = 1 - owner;
          probe.cards[0] = attack;
          assert.equal(
            useOperation(probe, 1 - owner, attack.id, t, probe.seq, 1600),
            blocked ? "blocked" : "removed",
          );
          if (blocked) assert.deepEqual(probe.players, g.players);
          assert.equal(probe.active, owner);
          assert.ok(!probe.cards.some((c) => c.id === attack.id));
          assert.equal(
            probe.events.at(-2)?.data.effect,
            blocked ? "blocked" : "removed",
          );
          assert.equal(
            applyOperation(expired, 1 - owner, attack, t, expiresAt),
            "removed",
          );
        }
      const p = structuredClone(g.players[owner]);
      assert.equal(
        axis === "row" ? removeColumn(p, 1, 1600) : removeRow(p, 1, 1600),
        false,
      );
      assert.deepEqual(p, g.players[owner]);
    }
});
test("overlapping Protect timers cover new cells independently and preserve crossing single-use shields", () => {
  const g = playing(),
    p = g.players[0];
  p.matrix = [
    [1, 2],
    [3, 4],
  ];
  p.destroyedTiles = 3;
  applyOperation(g, 0, card("protect_row_bronze"), { player: 0, row: 0 }, 1500);
  applyOperation(
    g,
    0,
    card("protect_column_silver"),
    { player: 0, column: 0 },
    1500,
  );
  applyOperation(g, 0, card("add_row"), { player: 0 }, 1600);
  applyOperation(g, 0, card("add_column"), { player: 0 }, 1600);
  assert.equal(isCellProtected(p, 0, 2, 1600), true);
  assert.equal(isCellProtected(p, 2, 0, 1600), true);
  applyOperation(g, 1, card("sub_matrix"), { player: 0 }, 1600);
  assert.deepEqual(p.matrix, [
    [1, 2, 3],
    [3, 2, 1],
    [3, 1, 1],
  ]);
  assert.equal(isCellProtected(p, 0, 2, 11500), false);
  assert.equal(isCellProtected(p, 0, 0, 11500), true);
  assert.equal(isCellProtected(p, 0, 0, 21500), false);
  applyShield(p, "row", 1);
  const before = structuredClone(p);
  assert.equal(removeRow(p, 1, 11500), false);
  assert.deepEqual(p, before);
  assert.equal(isCellProtected(p, 1, 1, 11500), false);
  assert.equal(
    applyOperation(
      g,
      1,
      card("add_cell"),
      { player: 0, row: 1, column: 1 },
      11500,
    ),
    "arithmetic",
  );
  assert.equal(p.matrix[1][1], 4);
});
test("timed protection follows shifted line indexes without extending", () => {
  for (const [id, { target, seconds }] of Object.entries(protectTiles)) {
    const g = playing(),
      p = g.players[0];
    const axis = target === "ROW" ? "row" : "column";
    axis === "row" ? addRow(p, g.config) : addColumn(p, g.config);
    applyOperation(
      g,
      0,
      card(id as Card["operation"]),
      { player: 0, [axis]: 2 },
      1500,
    );
    const expiresAt = 1500 + seconds * 1000;
    assert.deepEqual(axis === "row" ? p.rowShields : p.columnShields, [
      false,
      false,
      expiresAt,
    ]);
    applyOperation(
      g,
      1,
      card(`remove_${axis}`),
      { player: 0, [axis]: 0 },
      1700,
    );
    assert.deepEqual(axis === "row" ? p.rowShields : p.columnShields, [
      false,
      expiresAt,
    ]);
    assert.equal(
      applyOperation(
        g,
        1,
        card(`remove_${axis}`),
        { player: 0, [axis]: 1 },
        expiresAt - 1,
      ),
      "blocked",
    );
    assert.equal(
      applyOperation(
        g,
        1,
        card(`remove_${axis}`),
        { player: 0, [axis]: 1 },
        expiresAt,
      ),
      "removed",
    );
  }
});
test("Protect generation uses fixed durations and respects disabled and migrated weights", () => {
  const g = make();
  for (const [id, { seconds, weight }] of Object.entries(protectTiles)) {
    g.config.weights.early = Object.fromEntries(
      operationIds.map((key) => [key, key === id ? weight : 0]),
    ) as typeof g.config.weights.early;
    assert.deepEqual(generateOperation(g), {
      id: `c${g.cardSeq}`,
      operation: id,
      value: seconds,
    });
    g.config.weights.early[id as keyof typeof protectTiles] = 0;
    g.config.weights.early.add_cell = 1;
    assert.equal(generateOperation(g).operation, "add_cell");
    applyShield(g.players[0], "row", 0);
    assert.equal(
      validateTarget(
        g,
        0,
        card("protect_row_gold"),
        { player: 0, row: 0 },
        1500,
      ),
      false,
    );
  }
  const onlyProtect = Object.fromEntries(
    operationIds.map((id) => [id, id in protectTiles ? 1 : 0]),
  );
  assert.equal(
    balanceSchema.safeParse({ ...defaultBalance, weights: onlyProtect })
      .success,
    false,
  );
});
test("removed swaps are discarded from saved weights and cannot be generated or played", () => {
  const remaining = { ...defaultBalance.weights.early, add_cell: 0 };
  const legacy = { ...remaining, swap_rows: 6, swap_columns: 0, transpose: 6 };
  for (const weights of [
    legacy,
    Object.fromEntries(gameStages.map((stage) => [stage, legacy])),
  ]) {
    const config = balanceSchema.parse({ ...defaultBalance, weights });
    for (const stage of gameStages)
      assert.deepEqual(config.weights[stage], remaining);
    const g = createGame("removed-swaps", 42, players, config, 1000);
    startGame(g, 1000);
    for (const now of [1000, 41000, 81000])
      for (let i = 0; i < 100; i++)
        assert.ok(
          !["swap_rows", "swap_columns", "transpose"].includes(
            generateOperation(g, now).operation,
          ),
        );
    for (const id of ["swap_rows", "swap_columns", "transpose"]) {
      assert.ok(!operationIds.some((operation) => operation === id));
      assert.ok(!(id in registry));
      assert.deepEqual(legalTargets(g, 0, card(id as Card["operation"])), []);
      const removed = card(id as Card["operation"]);
      const before = structuredClone(g);
      assert.equal(validateTarget(g, 0, removed, { player: 0, row: 0 }), false);
      assert.throws(
        () => applyOperation(g, 0, removed, { player: 0, row: 0 }),
        /Illegal target/,
      );
      assert.deepEqual(g, before);
    }
  }
  assert.equal(
    balanceSchema.safeParse({
      ...defaultBalance,
      weights: { ...legacy, unknown: 1 },
    }).success,
    false,
  );
});
test("turn duration interpolates and clamps", () => {
  assert.equal(calculateTurnDuration(0), 6000);
  assert.equal(calculateTurnDuration(60000), 4500);
  assert.equal(calculateTurnDuration(120000), 3000);
  assert.equal(calculateTurnDuration(900000), 3000);
  assert.equal(calculateTurnDuration(-1), 6000);
});
test("normal operations consume a unique card, preserve pool size, pass turn and reject replay", () => {
  for (let size = 4; size <= 8; size++) {
    const g = playing(),
      actor = g.active;
    while (g.cards.length < size) g.cards.push(generateOperation(g));
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
    assert.equal(g.cards.length, size);
    assert.equal(new Set(g.cards.map((c) => c.id)).size, g.cards.length);
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
  }
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
test("either player can unlock shared slots from four to eight in both modes", () => {
  for (const mode of ["quick", "practice"] as const) {
    const g = createGame("slots", 42, players, defaultBalance, 1000, mode);
    startGame(g, 1000);
    const initialPlayers = structuredClone(g.players);
    const reserved = structuredClone(
      g.events.find((e) => e.type === "RESERVED"),
    );
    const endAt = g.endAt;
    assert.equal(g.cards.length, 4);
    for (let size = 4; size < 8; size++) {
      const actor = g.active,
        seq = g.seq;
      g.cards = g.cards.map((c) => ({
        ...c,
        operation: "unlock_slot",
        value: 1,
      }));
      const used = g.cards[0];
      assert.deepEqual(legalTargets(publicGame(g), actor, used), [
        { player: actor },
      ]);
      assert.equal(
        useOperation(g, actor, used.id, { player: actor }, seq, 1100 + size),
        "unlock",
      );
      assert.equal(g.cards.length, size + 1);
      assert.equal(new Set(g.cards.map((c) => c.id)).size, size + 1);
      assert.ok(!g.cards.some((c) => c.id === used.id));
      assert.equal(g.active, 1 - actor);
      assert.equal(g.seq, seq + 1);
      assert.equal(g.endAt, endAt);
      assert.deepEqual(g.players, initialPlayers);
      assert.equal(publicGame(g).cards.length, size + 1);
      const after = structuredClone(g);
      assert.throws(() =>
        useOperation(g, actor, used.id, { player: actor }, seq, 1200),
      );
      assert.deepEqual(g, after);
    }
    assert.ok(g.cards.every((c) => c.operation !== "unlock_slot"));
    assert.deepEqual(
      g.events.find((e) => e.type === "RESERVED"),
      reserved,
    );
    assert.deepEqual(legalTargets(g, g.active, card("unlock_slot")), []);
    g.cards[0] = card("unlock_slot");
    const full = structuredClone(g);
    assert.throws(() =>
      useOperation(g, g.active, "test-card", { player: g.active }, g.seq, 1500),
    );
    assert.deepEqual(g, full);
    for (let i = 0; i < 100; i++)
      assert.notEqual(generateOperation(g).operation, "unlock_slot");
  }
});
test("unlock rejects matrix targets, wrong players, deadlines and out-of-turn actions without mutation", () => {
  const g = playing(),
    actor = g.active;
  g.cards[0] = card("unlock_slot");
  const before = structuredClone(g);
  for (const target of [
    { player: 1 - actor },
    { player: actor, row: 0 },
    { player: actor, column: 0 },
    { player: actor, second: 0 },
  ]) {
    assert.throws(() =>
      useOperation(g, actor, "test-card", target, g.seq, 1500),
    );
    assert.deepEqual(g, before);
  }
  for (const now of [g.turnEndsAt, g.endAt]) {
    assert.throws(() =>
      useOperation(g, actor, "test-card", { player: actor }, g.seq, now),
    );
    assert.deepEqual(g, before);
  }
  grow(g, "row");
  g.cards[0] = card("unlock_slot");
  const afterGrowth = structuredClone(g);
  assert.throws(() =>
    useOperation(g, actor, "test-card", { player: actor }, g.seq, 1200),
  );
  assert.deepEqual(g, afterGrowth);
});
test("unlock tiles are random, have value one, and respect zero weight", () => {
  const openings = new Set<boolean>();
  for (let seed = 1; seed <= 100; seed++) {
    const g = make(seed);
    openings.add(g.cards.some((c) => c.operation === "unlock_slot"));
    assert.ok(
      g.cards
        .filter((c) => c.operation === "unlock_slot")
        .every((c) => c.value === 1),
    );
  }
  assert.deepEqual(openings, new Set([true, false]));
  const config = structuredClone(defaultBalance);
  config.weights.early.unlock_slot = 0;
  const g = createGame("disabled", 42, players, config, 1000);
  assert.ok(g.cards.every((c) => c.operation !== "unlock_slot"));
  for (let i = 0; i < 200; i++)
    assert.notEqual(generateOperation(g).operation, "unlock_slot");
});
test("timeout replaces half the tiles rounded up, credits the player and preserves pool size", () => {
  for (let size = 4; size <= 8; size++) {
    const g = playing();
    while (g.cards.length < size) g.cards.push(generateOperation(g));
    const ids = g.cards.map((c) => c.id),
      actor = g.active;
    assert.equal(tickGame(g, 7000), "timeout");
    assert.equal(g.active, 1 - actor);
    const count = Math.ceil(size / 2);
    assert.equal(
      g.cards.filter((c) => ids.includes(c.id)).length,
      size - count,
    );
    assert.equal(g.players[actor].destroyedTiles, count);
    assert.equal(g.players[1 - actor].destroyedTiles, 0);
    assert.equal(
      (g.events.find((e) => e.type === "TIMEOUT")!.data.destroyed as string[])
        .length,
      count,
    );
    assert.equal(g.cards.length, size);
    assert.equal(new Set(g.cards.map((c) => c.id)).size, size);
  }
});
test("manual skips have the same effects as timeouts in every timed mode", () => {
  for (const mode of ["quick", "ranked", "casual", "custom", "ai"] as const) {
    for (let size = 4; size <= 8; size++) {
      const g = createGame("skip", 42, players, defaultBalance, 1000, mode);
      startGame(g, 1000);
      while (g.cards.length < size) g.cards.push(generateOperation(g));
      const actor = g.active;
      g.players[actor].destroyedTiles = 7;
      const expected = structuredClone(g);
      expected.turnEndsAt = 2000;
      assert.equal(tickGame(expected, 2000), "timeout");
      expected.events.findLast((e) => e.type === "TIMEOUT")!.type = "SKIP_TURN";
      skipTurn(g, actor, g.seq, 2000);
      assert.deepEqual(g, expected);
      assert.equal(g.players[actor].destroyedTiles, 7 + Math.ceil(size / 2));
      assert.equal(publicGame(g).lastAction?.type, "SKIP_TURN");
    }
  }
});
test("skip rejects wrong players, stale sequences, deadlines and inactive games without mutation", () => {
  const g = playing();
  const before = structuredClone(g);
  for (const [actor, seq, now] of [
    [1 - g.active, g.seq, 2000],
    [-1, g.seq, 2000],
    [g.active, g.seq - 1, 2000],
    [g.active, g.seq + 1, 2000],
    [g.active, g.seq, g.turnEndsAt],
    [g.active, g.seq, g.endAt],
  ]) {
    assert.throws(() => skipTurn(g, actor, seq, now), /Out of turn or stale/);
    assert.deepEqual(g, before);
  }
  for (const status of ["pregame", "countdown", "finished"] as const) {
    const inactive = { ...structuredClone(g), status };
    const unchanged = structuredClone(inactive);
    assert.throws(() => skipTurn(inactive, g.active, g.seq, 2000));
    assert.deepEqual(inactive, unchanged);
  }
});
test("timeout can replace every position in the eight-tile pool", () => {
  const replaced = new Set<number>();
  for (let seed = 1; seed <= 50; seed++) {
    const g = make(seed);
    while (g.cards.length < 8) g.cards.push(generateOperation(g));
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
    assert.deepEqual(
      g.players.map((player) => ({
        ...player,
        destroyedTiles: 0,
        maxSquare: 0,
        maxCube: 0,
      })),
      before,
    );
    assert.equal(g.players[actor].destroyedTiles, 0);
    assert.equal(g.cards.length, 4);
    assert.ok(!g.cards.some((c) => c.id === "test-card"));
    assert.equal(new Set(g.cards.map((c) => c.id)).size, g.cards.length);
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
        assert.equal(g.players[1 - actor].destroyedTiles, 2);
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
test("clock targets are unique and time tiles cannot be played on an opponent turn", () => {
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
    g.config.weights.early = Object.fromEntries(
      operationIds.map((key) => [key, key === id ? 1 : 0]),
    ) as typeof g.config.weights.early;
    const c = generateOperation(g);
    assert.equal(c.operation, id);
    assert.equal(
      c.value,
      Math.abs(timeTiles[id as keyof typeof timeTiles].seconds),
    );
  }
  g.config.weights.early = Object.fromEntries(
    operationIds.map((id) => [id, 0]),
  ) as typeof g.config.weights.early;
  g.config.weights.early.add_match_time_5 = 3;
  g.config.weights.early.add_turn_time_5 = 0.3;
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
          defaultBalance.weights.early[matchId] /
            defaultBalance.weights.early[turnId] -
            10,
        ) < 1e-10,
      );
    }
});
test("older weights gain only new defaults, and non-arithmetic tiles cannot make a balance valid", () => {
  const weights: Record<string, number> = { ...defaultBalance.weights.early };
  delete weights.unlock_slot;
  for (const id of Object.keys(timeTiles)) delete weights[id];
  for (const id of Object.keys(protectTiles)) delete weights[id];
  weights.add_cell = 0;
  const parsed = balanceSchema.parse({ ...defaultBalance, weights });
  assert.equal(parsed.weights.early.add_cell, 0);
  assert.equal(parsed.weights.early.unlock_slot, 6);
  weights.unlock_slot = 0;
  assert.equal(
    balanceSchema.parse({ ...defaultBalance, weights }).weights.early
      .unlock_slot,
    0,
  );
  for (const [id, { weight }] of Object.entries(protectTiles))
    assert.equal(parsed.weights.early[id as keyof typeof protectTiles], weight);
  weights.protect_row_gold = 0;
  assert.equal(
    balanceSchema.parse({ ...defaultBalance, weights }).weights.early
      .protect_row_gold,
    0,
  );
  assert.equal(parsed.weights.early.add_turn_time_15, 0.1);
  weights.add_turn_time_15 = 0;
  assert.equal(
    balanceSchema.parse({ ...defaultBalance, weights }).weights.early
      .add_turn_time_15,
    0,
  );
  const noArithmetic = Object.fromEntries(
    operationIds.map((id) => [
      id,
      id in timeTiles || id === "unlock_slot" ? 1 : 0,
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
    { ...defaultBalance.weights.early, add_turn_time_5: -1 },
    { ...defaultBalance.weights.early, unknown: 1 },
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
  assert.ok(
    Object.values(registry).every(
      (d) => d.label.length > 0 && d.description.length > 0,
    ),
  );
});
test("weighted cards have a legal target and disabled operations never appear", () => {
  const g = make();
  for (let i = 0; i < 1000; i++) {
    const c = generateOperation(g);
    assert.ok([0, 1].some((a) => legalTargets(g, a, c).length));
  }
  g.config.weights.early.add_row = 0;
  for (let i = 0; i < 200; i++)
    assert.notEqual(generateOperation(g).operation, "add_row");
});
function grow(g: Game, axis: "row" | "column") {
  g.cards[0] = card(`add_${axis}`);
  useOperation(g, g.active, "test-card", { player: g.active }, g.seq, 1100);
}
test("growth uses each player's cumulative destroyed tiles without spending them", () => {
  for (const axis of ["row", "column"] as const) {
    const g = playing(),
      actor = g.active;
    const play = (operation: Card["operation"]) => {
      g.cards[0] = card(operation);
      const now = g.turnEndsAt - 100;
      const player = g.active;
      const target =
        operation === "add_cell" ? { player, row: 0, column: 0 } : { player };
      useOperation(g, player, "test-card", target, g.seq, now);
    };
    let total = 0;
    for (const size of [4, 6, 8]) {
      while (g.cards.length < size) g.cards.push(generateOperation(g));
      assert.equal(tickGame(g, g.turnEndsAt), "timeout");
      total += size / 2;
      assert.equal(g.players[actor].destroyedTiles, total);
      assert.equal(g.players[1 - actor].destroyedTiles, 0);
      play("add_cell");
    }
    const line = () =>
      axis === "row"
        ? g.players[actor].matrix.at(-1)!
        : g.players[actor].matrix.map((row) => row.at(-1)!);
    for (let i = 0; i < 2; i++) {
      const before = calculateScore(g.players[actor].matrix);
      const seq = g.seq;
      play(`add_${axis}`);
      assert.deepEqual(line(), [9, 9]);
      assert.equal(calculateScore(g.players[actor].matrix), before + 18);
      assert.equal(g.players[actor].destroyedTiles, 9);
      assert.equal(g.active, 1 - actor);
      assert.equal(g.seq, seq + 1);
      assert.equal(g.cards.length, 8);
      assert.ok(!g.cards.some((c) => c.id === "test-card"));
      play(`add_${axis}`);
      assert.equal(calculateScore(g.players[1 - actor].matrix), 16);
      assert.equal(g.players[1 - actor].destroyedTiles, 0);
    }
    const matrix = structuredClone(g.players[actor].matrix);
    tickGame(g, g.turnEndsAt);
    assert.equal(g.players[actor].destroyedTiles, 13);
    assert.deepEqual(g.players[actor].matrix, matrix);
    const view = JSON.parse(JSON.stringify(publicGame(g)));
    assert.equal(view.players[actor].destroyedTiles, 13);
    assert.equal(view.players[1 - actor].destroyedTiles, 0);
    assert.ok(!("minigame" in view));
    assert.ok(!g.events.some((e) => e.type.startsWith("SKILL_")));
    assert.deepEqual(
      make().players.map((p) => p.destroyedTiles),
      [0, 0],
    );
    tickGame(g, g.endAt);
    assert.deepEqual(
      g.result!.scores,
      g.players.map((p) => calculateScore(p.matrix)),
    );
  }
});
test("legacy skill settings are discarded while other balance validation remains strict", () => {
  const legacy = {
    ...defaultBalance,
    skillStartSize: 80,
    skillMinSize: 18,
    skillSizeDecay: 0.1,
    skillStartMs: 1100,
    skillMinMs: 250,
    skillTimeDecay: 0.08,
  };
  assert.deepEqual(balanceSchema.parse(legacy), defaultBalance);
  assert.throws(() => balanceSchema.parse({ ...legacy, unknown: 1 }));
  assert.throws(() => balanceSchema.parse({ ...legacy, turnEndMs: 9000 }));
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
        Object.keys(defaultBalance.weights.early).map((k) => [k, 0]),
      ),
    }),
  );
  assert.throws(() => balanceSchema.parse({ ...defaultBalance, maxRows: 100 }));
  assert.throws(() =>
    balanceSchema.parse({ ...defaultBalance, turnEndMs: 9000 }),
  );
});

function practice(seed = 42) {
  const g = createGame(
    "practice",
    seed,
    players,
    defaultBalance,
    1000,
    "practice",
  );
  startGame(g, 1000);
  return g;
}
test("practice waits indefinitely, excludes clock tiles and still rejects invalid moves", () => {
  const g = practice();
  const before = structuredClone(g);
  assert.equal(g.active, 0);
  assert.equal(publicGame(g).mode, "practice");
  assert.equal(g.endAt, 0);
  assert.equal(g.turnEndsAt, 0);
  assert.equal(tickGame(g, 86400000), null);
  assert.deepEqual(g, before);
  for (let i = 0; i < 200; i++)
    assert.ok(!(generateOperation(g).operation in timeTiles));
  for (const id of Object.keys(timeTiles)) {
    const c = card(id as Card["operation"]);
    assert.deepEqual(legalTargets(g, 0, c), []);
    assert.throws(() => applyOperation(g, 0, c, { player: 0 }, 86400000));
  }
  assert.throws(() => skipPracticeTurn(g, 0, g.seq, 86400000));
  assert.equal(playPracticeAI(g, 86400000), false);
  g.cards[0] = card("add_cell");
  const seq = g.seq;
  assert.throws(() =>
    useOperation(
      g,
      1,
      "test-card",
      { player: 1, row: 0, column: 0 },
      seq,
      86400000,
    ),
  );
  assert.throws(() =>
    useOperation(
      g,
      0,
      "test-card",
      { player: 0, row: -1, column: 0 },
      seq,
      86400000,
    ),
  );
  useOperation(
    g,
    0,
    "test-card",
    { player: 0, row: 0, column: 0 },
    seq,
    86400000,
  );
  assert.equal(g.active, 1);
  assert.equal(g.turnEndsAt, 0);
  assert.throws(() =>
    useOperation(
      g,
      0,
      "test-card",
      { player: 0, row: 0, column: 0 },
      seq,
      86400001,
    ),
  );
});
test("practice AI makes legal moves and passes immediately after growth", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = practice(seed);
    let now = 200000;
    for (let turn = 0; turn < 16; turn++) {
      const before = structuredClone(g);
      if (g.active === 1) assert.equal(playPracticeAI(g, now), true);
      else {
        const c = g.cards.find((c) => legalTargets(g, 0, c, now).length);
        if (c)
          useOperation(g, 0, c.id, legalTargets(g, 0, c, now)[0], g.seq, now);
        else skipPracticeTurn(g, 0, g.seq, now);
      }
      const action = g.events.findLast((e) => e.type === "OPERATION");
      if (action && action.at === now) {
        assert.equal(
          validateTarget(
            before,
            before.active,
            action.data.card as Card,
            action.data.target as Target,
            now,
          ),
          true,
        );
      }
      assert.ok(g.cards.length >= 4 && g.cards.length <= 8);
      assert.equal(
        g.cards.length,
        before.cards.length +
          (action?.at === now && action.data.effect === "unlock" ? 1 : 0),
      );
      assert.equal(new Set(g.cards.map((c) => c.id)).size, g.cards.length);
      assert.equal(g.active, 1 - before.active);
      now += 1000;
    }
    finishGame(g, now, "practice_finished");
    const finished = structuredClone(g);
    assert.equal(playPracticeAI(g, now + 1000), false);
    assert.equal(tickGame(g, now + 86400000), null);
    assert.deepEqual(g, finished);
  }
});
test("practice skips replace half the tiles rounded up and credit each player", () => {
  for (let size = 4; size <= 8; size++) {
    const g = practice();
    g.config.maxRows = 2;
    const blocked = () =>
      Array.from({ length: size }, (_, i) => ({
        id: `blocked-${i}`,
        operation: "add_row" as const,
        value: 1,
      }));
    g.cards = blocked();
    const before = structuredClone(g);
    assert.throws(() => skipPracticeTurn(g, 1, g.seq, 200000));
    assert.throws(() => skipPracticeTurn(g, 0, g.seq - 1, 200000));
    assert.deepEqual(g, before);
    skipPracticeTurn(g, 0, g.seq, 200000);
    assert.equal(g.active, 1);
    assert.equal(
      g.cards.filter((c) => c.id.startsWith("blocked-")).length,
      size - Math.ceil(size / 2),
    );
    g.cards = blocked();
    assert.equal(playPracticeAI(g, 200600), true);
    assert.equal(g.active, 0);
    assert.equal(
      g.cards.filter((c) => c.id.startsWith("blocked-")).length,
      size - Math.ceil(size / 2),
    );
    assert.ok(g.cards.some((c) => legalTargets(g, 0, c, 200600).length));
    assert.equal(g.cards.length, size);
    assert.deepEqual(
      g.players.map((p) => p.destroyedTiles),
      [Math.ceil(size / 2), Math.ceil(size / 2)],
    );
  }
  const quick = playing();
  assert.throws(() => skipPracticeTurn(quick, quick.active, quick.seq, 1500));
});
test("manual practice skips work with playable tiles and keep clocks and matrices unchanged", () => {
  const g = practice();
  g.cards = Array.from({ length: 5 }, (_, i) => ({
    id: `playable-${i}`,
    operation: "add_cell" as const,
    value: 2,
  }));
  assert.ok(g.cards.every((c) => legalTargets(g, 0, c, 86400000).length));
  const matrices = structuredClone(g.players.map((p) => p.matrix));
  skipTurn(g, 0, g.seq, 86400000);
  assert.equal(g.active, 1);
  assert.equal(g.cards.filter((c) => c.id.startsWith("playable-")).length, 2);
  assert.deepEqual(
    g.players.map((p) => p.destroyedTiles),
    [3, 0],
  );
  assert.deepEqual(
    g.players.map((p) => p.matrix),
    matrices,
  );
  assert.equal(g.endAt, 0);
  assert.equal(g.turnEndsAt, 0);
  assert.equal(publicGame(g).lastAction?.type, "SKIP_TURN");
});
test("practice growth starts at zero, passes immediately and manual finish retains scores", () => {
  const g = practice();
  g.cards[0] = card("add_row");
  useOperation(g, 0, "test-card", { player: 0 }, g.seq, 200000);
  assert.deepEqual(g.players[0].matrix[2], [0, 0]);
  assert.equal(g.active, 1);
  assert.equal(calculateScore(g.players[0].matrix), 10);
  finishGame(g, 200001, "practice_finished");
  assert.equal(g.status, "finished");
  assert.equal(g.result!.reason, "practice_finished");
  assert.deepEqual(
    g.result!.scores,
    g.players.map((p) => calculateScore(p.matrix)),
  );
});

test("game stages divide every speed into thirds and exclude pregame time", () => {
  for (const speed of speeds) {
    const g = createGame(
      "stages",
      42,
      players,
      defaultBalance,
      1000,
      "custom",
      speed,
    );
    assert.equal(getGameStage(g, 999999), "early");
    g.status = "countdown";
    g.startedAt = 200000;
    assert.equal(getGameStage(g, 199999), "early");
    startGame(g, 200000);
    const third = 40000 * speed;
    assert.deepEqual(g.stageEndsAt, [200000 + third, 200000 + 2 * third]);
    assert.equal(g.endAt, 200000 + 3 * third);
    for (const [i, stage] of gameStages.entries()) {
      const now = 200000 + i * third;
      assert.equal(getGameStage(g, now), stage);
      assert.equal(getGameStage(publicGame(g), now + third - 1), stage);
    }
    assert.equal(getGameStage(g, g.endAt), "late");
  }
});

test("match time changes only the current stage, preserving completed stages", () => {
  for (const [i, stage] of gameStages.entries()) {
    for (const [id, tile] of Object.entries(timeTiles).filter(
      ([, t]) => t.clock === "match",
    )) {
      const g = playing();
      const now = 2000 + i * 40000;
      const delta = tile.seconds * 1000;
      applyOperation(
        g,
        g.active,
        card(id as Card["operation"]),
        { player: g.active },
        now,
      );
      assert.deepEqual(g.stageEndsAt, [
        41000 + (i === 0 ? delta : 0),
        81000 + (i < 2 ? delta : 0),
      ]);
      assert.equal(g.endAt, 121000 + delta);
      assert.equal(getGameStage(g, now), stage);
      assert.equal(g.config.matchMs, 120000);
    }
  }
  const g = playing();
  applyOperation(
    g,
    g.active,
    card("add_match_time_10"),
    { player: g.active },
    41000,
  );
  assert.deepEqual(g.stageEndsAt, [41000, 91000]);
  assert.equal(getGameStage(g, 41000), "mid");
  assert.equal(g.endAt, 131000);
  applyOperation(
    g,
    g.active,
    card("add_turn_time_15"),
    { player: g.active },
    41000,
  );
  assert.deepEqual(g.stageEndsAt, [41000, 91000]);
  assert.equal(g.endAt, 131000);
});

test("match deductions carry across stages, never reopen stages, and can end the match", () => {
  for (const [duration, now, operation, deadlines, expected] of [
    [120000, 36000, "sub_match_time_15", [36000, 66000, 106000], "mid"],
    [12000, 4000, "sub_match_time_5", [4000, 4000, 8000], "late"],
    [12000, 4000, "sub_match_time_15", [4000, 4000, 4000], "late"],
  ] as const) {
    const g = createGame(
      "deduct",
      42,
      players,
      { ...defaultBalance, matchMs: duration },
      1000,
    );
    startGame(g, 1000);
    g.turnEndsAt = now + 6000;
    g.cards[0] = card(operation);
    useOperation(g, g.active, "test-card", { player: g.active }, g.seq, now);
    assert.deepEqual([...g.stageEndsAt, g.endAt], deadlines);
    assert.equal(getGameStage(g, now), expected);
    if (g.endAt === now) {
      assert.equal(g.status, "finished");
      assert.equal(g.result!.reason, "clock");
    } else {
      applyOperation(
        g,
        g.active,
        card("add_match_time_15"),
        { player: g.active },
        now,
      );
      assert.equal(getGameStage(g, now), expected);
      assert.equal(g.stageEndsAt[0], now);
    }
  }
});

const stageOperations = {
  early: "add_cell",
  mid: "sub_cell",
  late: "multiply_cell",
} as const;
function stagedBalance() {
  const config = structuredClone(defaultBalance);
  for (const stage of gameStages)
    config.weights[stage] = Object.fromEntries(
      operationIds.map((id) => [id, id === stageOperations[stage] ? 1 : 0]),
    ) as typeof config.weights.early;
  return config;
}

test("all tile draws use stage weights without refreshing existing tiles", () => {
  for (const [i, stage] of gameStages.entries()) {
    const config = stagedBalance();
    // A heavily weighted growth tile must still be excluded at the matrix limit.
    config.maxRows = 2;
    config.weights[stage].add_row = 100;
    const g = createGame("draws", 42, players, config, 1000);
    assert.ok(g.cards.every((c) => c.operation === "add_cell"));
    startGame(g, 1000);
    const now = 1000 + 40000 * i;
    const original = structuredClone(g.cards);
    const replay = structuredClone(g);
    assert.deepEqual(generateOperation(g, now), generateOperation(replay, now));
    assert.deepEqual(g.cards, original);
    for (let j = 0; j < 50; j++)
      assert.equal(generateOperation(g, now).operation, stageOperations[stage]);
    g.turnEndsAt = now + 6000;
    useOperation(
      g,
      g.active,
      g.cards[0].id,
      { player: g.active, row: 0, column: 0 },
      g.seq,
      now,
    );
    assert.equal(g.cards[0].operation, stageOperations[stage]);
    assert.deepEqual(g.cards.slice(1), original.slice(1));
    const ids = g.cards.map((c) => c.id);
    assert.equal(tickGame(g, g.turnEndsAt), "timeout");
    assert.ok(
      g.cards
        .filter((c) => !ids.includes(c.id))
        .every((c) => c.operation === stageOperations[stage]),
    );
    g.cards = Array.from({ length: 7 }, (_, j) => ({
      ...card("unlock_slot", 1),
      id: `unlock-${j}`,
    }));
    useOperation(
      g,
      g.active,
      g.cards[0].id,
      { player: g.active },
      g.seq,
      g.turnEndsAt - 1,
    );
    assert.equal(g.cards.length, 8);
    assert.ok(g.cards.every((c) => c.operation === stageOperations[stage]));
  }
});

test("legacy weights become independent stage maps and every stage must remain playable", () => {
  const legacy = {
    ...defaultBalance.weights.early,
    add_cell: 0,
    add_turn_time_5: 0.25,
  };
  const migrated = balanceSchema.parse({ ...defaultBalance, weights: legacy });
  for (const stage of gameStages)
    assert.deepEqual(migrated.weights[stage], legacy);
  migrated.weights.early.add_cell = 10;
  assert.equal(migrated.weights.mid.add_cell, 0);
  assert.equal(migrated.weights.late.add_cell, 0);
  for (const stage of gameStages) {
    for (const invalid of [-1, 101, Infinity, NaN]) {
      const config = stagedBalance();
      config.weights[stage].add_cell = invalid;
      assert.equal(balanceSchema.safeParse(config).success, false);
    }
    const config = stagedBalance();
    config.weights[stage][stageOperations[stage]] = 0;
    config.weights[stage].unlock_slot = 100;
    assert.equal(balanceSchema.safeParse(config).success, false);
    assert.equal(
      balanceSchema.safeParse({
        ...defaultBalance,
        weights: { ...defaultBalance.weights, [stage]: undefined },
      }).success,
      false,
    );
  }
  assert.equal(
    balanceSchema.safeParse({
      ...defaultBalance,
      weights: { ...defaultBalance.weights, unknown: legacy },
    }).success,
    false,
  );
});

test("practice advances stages manually without consuming a turn or changing the board", () => {
  const config = stagedBalance();
  for (const stage of gameStages) config.weights[stage].add_match_time_15 = 100;
  const g = createGame("practice", 42, players, config, 1000, "practice");
  assert.throws(() => advancePracticeStage(g, 1000));
  startGame(g, 1000);
  const cards = structuredClone(g.cards),
    board = structuredClone(g.players);
  for (const [i, stage] of gameStages.entries()) {
    const now = 1000000 * (i + 1);
    assert.equal(tickGame(g, now), null);
    assert.equal(getGameStage(g, now), stage);
    assert.equal(publicGame(g).practiceStage, stage);
    assert.equal(generateOperation(g, now).operation, stageOperations[stage]);
    assert.deepEqual(g.cards, cards);
    assert.deepEqual(g.players, board);
    assert.equal(g.endAt, 0);
    assert.equal(g.turnEndsAt, 0);
    if (stage !== "late") {
      g.active = i;
      const seq = g.seq;
      advancePracticeStage(g, now);
      assert.equal(g.active, i);
      assert.equal(g.seq, seq + 1);
    }
  }
  const before = structuredClone(g);
  assert.throws(() => advancePracticeStage(g, 4000000));
  assert.deepEqual(g, before);
  const finished = practice();
  finishGame(finished, 2000, "practice_finished");
  assert.throws(() => advancePracticeStage(finished, 2000));
  const timed = playing();
  assert.throws(() => advancePracticeStage(timed, 2000));
  assert.equal(getGameStage(practice(), 4000000), "early");
});

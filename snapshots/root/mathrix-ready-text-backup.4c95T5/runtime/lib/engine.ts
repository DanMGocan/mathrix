import {
  defaultBalance,
  timeTiles,
  protectTiles,
  type Balance,
  type operationIds,
  type MatchMode,
  type GameStage,
  type Speed,
} from "./config";
export const INITIAL_CARD_SLOTS = 4;
export const MAX_CARD_SLOTS = 8;
export type Matrix = number[][];
export type Ownership = "SELF_ONLY" | "OPPONENT_ONLY" | "EITHER";
export type TargetType =
  | "CELL"
  | "ROW"
  | "COLUMN"
  | "MATRIX"
  | "STRUCTURE"
  | "CARD_POOL"
  | "MATCH_CLOCK"
  | "TURN_CLOCK";
export type OperationId = (typeof operationIds)[number];
export type Card = { id: string; operation: OperationId; value: number };
export type Target = {
  player: number;
  row?: number;
  column?: number;
};
// true blocks one removal; a number is the timed protection's expiry timestamp.
export type Shield = boolean | number;
export const isShieldActive = (shield: Shield, now: number) =>
  shield === true || (typeof shield === "number" && shield > now);
const isTimedShieldActive = (shield: Shield, now: number) =>
  typeof shield === "number" && isShieldActive(shield, now);
export type Player = import("./profile").PlayerAppearance & {
  id: string;
  name: string;
  registered: boolean;
  matrix: Matrix;
  destroyedTiles: number;
  rank?: number | null;
  played?: number;
  rowShields: Shield[];
  columnShields: Shield[];
};
export const isCellProtected = (
  p: Player,
  row: number,
  column: number,
  now: number,
) =>
  isTimedShieldActive(p.rowShields[row], now) ||
  isTimedShieldActive(p.columnShields[column], now);
export type GameEvent = {
  at: number;
  type: string;
  data: Record<string, unknown>;
};
export type Game = {
  id: string;
  mode: MatchMode | "quick" | "practice";
  speed: Speed;
  seed: number;
  iValue: number;
  rng: number;
  cardSeq: number;
  config: Balance;
  players: Player[];
  initialMatrices: Matrix[];
  cards: Card[];
  active: number;
  seq: number;
  status: "pregame" | "countdown" | "playing" | "finished";
  reservedAt: number;
  startedAt: number;
  endAt: number;
  stageEndsAt: [number, number];
  practiceStage: GameStage;
  turnEndsAt: number;
  ready: boolean[];
  events: GameEvent[];
  result: null | { scores: number[]; winner: number | null; reason: string };
};
type OperationDefinition = {
  label: string;
  description: string;
  target: TargetType;
  ownership: Ownership;
  kind:
    | "add"
    | "multiply"
    | "square"
    | "cube"
    | "sqrt"
    | "absolute"
    | "factorial"
    | "fibonacci"
    | "next_prime"
    | "previous_prime"
    | "reverse"
    | "determinant"
    | "grow"
    | "remove"
    | "shield"
    | "time"
    | "unlock";
  seconds?: number;
  tier?: "bronze" | "silver" | "gold";
};
export const registry: Record<OperationId, OperationDefinition> = {
  square_cell: {
    label: "x² cell",
    description: "Square one cell in either matrix.",
    target: "CELL",
    ownership: "EITHER",
    kind: "square",
  },
  square_row: {
    label: "x² row",
    description: "Square every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "square",
  },
  square_column: {
    label: "x² column",
    description: "Square every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "square",
  },
  cube_cell: {
    label: "x³ cell",
    description: "Cube one cell in either matrix, preserving its sign.",
    target: "CELL",
    ownership: "EITHER",
    kind: "cube",
  },
  cube_row: {
    label: "x³ row",
    description:
      "Cube every cell in a selected row of either matrix, preserving each sign.",
    target: "ROW",
    ownership: "EITHER",
    kind: "cube",
  },
  cube_column: {
    label: "x³ column",
    description:
      "Cube every cell in a selected column of either matrix, preserving each sign.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "cube",
  },
  sqrt_cell: {
    label: "√ cell",
    description:
      "Take the square root of one cell in either matrix. For negative values, substitute this match's i value: with i = 7, √(−10) becomes 22. Round the complete result down, then apply the cell-value limit. Pass the turn.",
    target: "CELL",
    ownership: "EITHER",
    kind: "sqrt",
  },
  sqrt_row: {
    label: "√ row",
    description:
      "Take the square root of every cell in a selected row of either matrix. For each negative value, multiply the root of its magnitude by this match's i value, then round down. Pass the turn.",
    target: "ROW",
    ownership: "EITHER",
    kind: "sqrt",
  },
  sqrt_column: {
    label: "√ column",
    description:
      "Take the square root of every cell in a selected column of either matrix. For each negative value, multiply the root of its magnitude by this match's i value, then round down. Pass the turn.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "sqrt",
  },
  absolute_cell: {
    label: "|x| cell",
    description:
      "Take the absolute value of one cell in either matrix: −12 becomes 12.",
    target: "CELL",
    ownership: "EITHER",
    kind: "absolute",
  },
  absolute_row: {
    label: "|x| row",
    description:
      "Take the absolute value of every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "absolute",
  },
  absolute_column: {
    label: "|x| column",
    description:
      "Take the absolute value of every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "absolute",
  },
  absolute_matrix: {
    label: "|x| matrix",
    description: "Take the absolute value of every cell in either matrix.",
    target: "MATRIX",
    ownership: "EITHER",
    kind: "absolute",
  },
  factorial_cell: {
    label: "x! cell",
    description:
      "Replace one cell in either matrix with its factorial. Only values 0–5 are legal: 0! = 1 and 5! = 120.",
    target: "CELL",
    ownership: "EITHER",
    kind: "factorial",
  },
  fibonacci_cell: {
    label: "FIB cell",
    description:
      "Replace one cell in either matrix with its Fibonacci number. Only values 0–15 are legal: F(0) = 0, F(1) = 1 and F(15) = 610.",
    target: "CELL",
    ownership: "EITHER",
    kind: "fibonacci",
  },
  next_prime_cell: {
    label: "NEXT PRIME",
    description:
      "Replace one cell in either matrix with the next strictly greater positive prime. Values below 2 become 2. Unavailable if the result exceeds the cell-value limit.",
    target: "CELL",
    ownership: "EITHER",
    kind: "next_prime",
  },
  previous_prime_cell: {
    label: "PREV PRIME",
    description:
      "Replace one cell in either matrix with the previous strictly smaller positive prime. Values 2 or below cannot be targeted.",
    target: "CELL",
    ownership: "EITHER",
    kind: "previous_prime",
  },
  reverse_digits_cell: {
    label: "REVERSE DIGITS",
    description:
      "Reverse the digits of one cell in either matrix, preserving its sign and dropping leading zeroes: −120 becomes −21.",
    target: "CELL",
    ownership: "EITHER",
    kind: "reverse",
  },
  determinant_cell: {
    label: "DET cell",
    description:
      "Replace one cell in either matrix with that entire matrix's determinant, calculated before the change. Only square matrices are legal, including 1×1. Apply the cell-value limit after calculation.",
    target: "CELL",
    ownership: "EITHER",
    kind: "determinant",
  },
  unlock_slot: {
    label: "UNLOCK SLOT",
    description:
      "Add one filled slot to the shared tile pool for both players, up to 8 slots, then pass the turn. At 8 slots, remaining Unlock slot tiles are replaced.",
    target: "CARD_POOL",
    ownership: "EITHER",
    kind: "unlock",
  },
  add_cell: {
    label: "+N cell",
    description: "Add N to one cell in either matrix.",
    target: "CELL",
    ownership: "EITHER",
    kind: "add",
  },
  sub_cell: {
    label: "−N cell",
    description: "Deduct N from one cell in either matrix.",
    target: "CELL",
    ownership: "EITHER",
    kind: "add",
  },
  add_row_value: {
    label: "+N row",
    description: "Add N to every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "add",
  },
  sub_row_value: {
    label: "−N row",
    description: "Deduct N from every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "add",
  },
  add_column_value: {
    label: "+N column",
    description: "Add N to every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "add",
  },
  sub_column_value: {
    label: "−N column",
    description:
      "Deduct N from every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "add",
  },
  add_matrix: {
    label: "+N matrix",
    description: "Add N to every cell in either matrix.",
    target: "MATRIX",
    ownership: "EITHER",
    kind: "add",
  },
  sub_matrix: {
    label: "−N matrix",
    description: "Deduct N from every cell in either matrix.",
    target: "MATRIX",
    ownership: "EITHER",
    kind: "add",
  },
  multiply_cell: {
    label: "×2 cell",
    description: "Double one cell in either matrix.",
    target: "CELL",
    ownership: "EITHER",
    kind: "multiply",
  },
  multiply_row: {
    label: "×2 row",
    description: "Double every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "multiply",
  },
  multiply_column: {
    label: "×2 column",
    description: "Double every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "multiply",
  },
  negate_cell: {
    label: "×−1 cell",
    description: "Reverse the sign of one cell in either matrix.",
    target: "CELL",
    ownership: "EITHER",
    kind: "multiply",
  },
  negate_row: {
    label: "×−1 row",
    description:
      "Reverse the sign of every cell in a selected row of either matrix.",
    target: "ROW",
    ownership: "EITHER",
    kind: "multiply",
  },
  negate_column: {
    label: "×−1 column",
    description:
      "Reverse the sign of every cell in a selected column of either matrix.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "multiply",
  },
  add_row: {
    label: "ADD ROW",
    description:
      "Add a row to your matrix, then pass the turn. Each new cell equals your total shared tiles destroyed by missed or skipped turns this game (starting at 0), capped at the cell-value limit. The total is not spent.",
    target: "STRUCTURE",
    ownership: "SELF_ONLY",
    kind: "grow",
  },
  add_column: {
    label: "ADD COLUMN",
    description:
      "Add a column to your matrix, then pass the turn. Each new cell equals your total shared tiles destroyed by missed or skipped turns this game (starting at 0), capped at the cell-value limit. The total is not spent.",
    target: "STRUCTURE",
    ownership: "SELF_ONLY",
    kind: "grow",
  },
  remove_row: {
    label: "REMOVE ROW",
    description:
      "Remove an opponent row. Single-use row shields are consumed; timed protection on that row or any crossing column blocks removal until it expires. The last row cannot be removed.",
    target: "ROW",
    ownership: "OPPONENT_ONLY",
    kind: "remove",
  },
  remove_column: {
    label: "REMOVE COLUMN",
    description:
      "Remove an opponent column. Single-use column shields are consumed; timed protection on that column or any crossing row blocks removal until it expires. The last column cannot be removed.",
    target: "COLUMN",
    ownership: "OPPONENT_ONLY",
    kind: "remove",
  },
  row_shield: {
    label: "ROW SHIELD",
    description: "Protect one of your rows against a single removal attempt.",
    target: "ROW",
    ownership: "SELF_ONLY",
    kind: "shield",
  },
  column_shield: {
    label: "COLUMN SHIELD",
    description:
      "Protect one of your columns against a single removal attempt.",
    target: "COLUMN",
    ownership: "SELF_ONLY",
    kind: "shield",
  },
  ...(Object.fromEntries(
    Object.entries(protectTiles).map(([id, { target, tier, seconds }]) => [
      id,
      {
        label: `${tier.toUpperCase()} PROTECT ${target}`,
        description: `Protect one of your ${target === "ROW" ? "rows" : "columns"} and every cell in it from all opponent changes for ${seconds} seconds. Opponent arithmetic skips protected cells; removals that touch them are blocked. Your own moves still apply.`,
        target,
        ownership: "SELF_ONLY",
        kind: "shield",
        seconds,
        tier,
      },
    ]),
  ) as Record<keyof typeof protectTiles, OperationDefinition>),
  ...(Object.fromEntries(
    Object.entries(timeTiles).map(([id, { seconds, clock }]) => {
      const amount = Math.abs(seconds);
      return [
        id,
        {
          label: `${seconds > 0 ? "+" : "−"}${amount}s ${clock === "match" ? "match clock" : seconds > 0 ? "your turn" : "opponent turn"}`,
          description:
            clock === "match"
              ? `${seconds > 0 ? "Add" : "Deduct"} ${amount} seconds ${seconds > 0 ? "to" : "from"} the shared match clock, then pass the turn.${seconds < 0 ? " Exhausting the clock ends the match immediately." : ""}`
              : seconds > 0
                ? `Add ${amount} seconds to your current turn and keep playing.`
                : `Pass the turn and deduct ${amount} seconds from the opponent's next turn. Exhausting it triggers the normal timeout.`,
          target: clock === "match" ? "MATCH_CLOCK" : "TURN_CLOCK",
          ownership:
            clock === "match"
              ? "EITHER"
              : seconds > 0
                ? "SELF_ONLY"
                : "OPPONENT_ONLY",
          kind: "time",
          seconds,
        },
      ];
    }),
  ) as Record<keyof typeof timeTiles, OperationDefinition>),
};
export function random(g: { rng: number }) {
  let x = g.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.rng = x >>> 0;
  return g.rng / 4294967296;
}
export function createStartingMatrix(rng: { rng: number }): Matrix {
  const a = [1, 1, 1, 1];
  for (let i = 0; i < 6; i++) a[Math.floor(random(rng) * 4)]++;
  return [a.slice(0, 2), a.slice(2)];
}
export const calculateScore = (m: Matrix) =>
  m.flat().reduce((a, b) => a + b, 0);
export const determineWinner = (a: number, b: number): number | null =>
  a === b ? null : a > b ? 0 : 1;
export const calculateTurnDuration = (
  elapsed: number,
  c: Balance = defaultBalance,
) =>
  Math.round(
    c.turnStartMs +
      (c.turnEndMs - c.turnStartMs) *
        Math.max(0, Math.min(1, elapsed / c.matchMs)),
  );
export function elo(a: number, b: number, result: 0 | 0.5 | 1, k = 32) {
  const d = Math.round(k * (result - 1 / (1 + 10 ** ((b - a) / 400))));
  return [a + d, b - d];
}
export function event(
  g: Game,
  type: string,
  data: Record<string, unknown>,
  now: number,
) {
  g.events.push({ at: now, type, data: structuredClone(data) });
}
const validIndex = (n: number | undefined, length: number) =>
  Number.isInteger(n) && n! >= 0 && n! < length;
const factorials = [1, 1, 2, 6, 24, 120];
const fibonacci = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
function adjacentPrime(
  value: number,
  step: 1 | -1,
  limit: number,
): number | null {
  for (
    let n = step === 1 ? Math.max(2, value + 1) : value - 1;
    n >= 2 && n <= limit;
    n += step
  ) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= n; divisor++)
      if (n % divisor === 0) {
        prime = false;
        break;
      }
    if (prime) return n;
  }
  return null;
}
function determinant(matrix: bigint[][]): bigint {
  if (matrix.length === 1) return matrix[0][0];
  return matrix[0].reduce(
    (sum, value, column) =>
      sum +
      (column % 2 ? -1n : 1n) *
        value *
        determinant(
          matrix
            .slice(1)
            .map((row) => row.filter((_, index) => index !== column)),
        ),
    0n,
  );
}
export function validateTarget(
  g: Pick<Game, "players" | "cards"> & {
    mode?: Game["mode"];
    config: Pick<Balance, "maxRows" | "maxColumns" | "maxCellValue">;
  },
  actor: number,
  card: Card,
  t: Target,
  now = Date.now(),
): boolean {
  const def = registry[card.operation];
  const p = g.players[t.player];
  if (
    !def ||
    !p ||
    !Number.isInteger(actor) ||
    actor < 0 ||
    actor > 1 ||
    Object.keys(t).some((key) => !["player", "row", "column"].includes(key))
  )
    return false;
  if (
    (def.ownership === "SELF_ONLY" && actor !== t.player) ||
    (def.ownership === "OPPONENT_ONLY" && actor === t.player)
  )
    return false;
  if (def.kind === "time")
    return (
      g.mode !== "practice" &&
      t.row === undefined &&
      t.column === undefined &&
      (def.target !== "MATCH_CLOCK" || t.player === actor)
    );
  if (def.kind === "unlock")
    return (
      g.cards.length < MAX_CARD_SLOTS &&
      t.player === actor &&
      t.row === undefined &&
      t.column === undefined
    );
  const rows = p.matrix.length,
    cols = p.matrix[0].length;
  if (
    def.target === "CELL" &&
    (!validIndex(t.row, rows) || !validIndex(t.column, cols))
  )
    return false;
  if (
    (def.target === "ROW" && !validIndex(t.row, rows)) ||
    (def.target === "COLUMN" && !validIndex(t.column, cols))
  )
    return false;
  if (def.kind === "shield")
    return !isShieldActive(
      def.target === "ROW" ? p.rowShields[t.row!] : p.columnShields[t.column!],
      now,
    );
  switch (card.operation) {
    case "factorial_cell":
    case "fibonacci_cell": {
      const value = p.matrix[t.row!][t.column!];
      return (
        Number.isInteger(value) &&
        value >= 0 &&
        value <= (card.operation === "factorial_cell" ? 5 : 15)
      );
    }
    case "next_prime_cell":
    case "previous_prime_cell":
      return (
        adjacentPrime(
          p.matrix[t.row!][t.column!],
          card.operation === "next_prime_cell" ? 1 : -1,
          g.config.maxCellValue,
        ) !== null
      );
    case "determinant_cell":
      return rows === cols;
    case "add_row":
      return rows < g.config.maxRows;
    case "add_column":
      return cols < g.config.maxColumns;
    case "remove_row":
      return rows > 1;
    case "remove_column":
      return cols > 1;
    default:
      return true;
  }
}
export function legalTargets(
  g: Pick<Game, "players" | "cards"> & {
    mode?: Game["mode"];
    config: Pick<Balance, "maxRows" | "maxColumns" | "maxCellValue">;
  },
  actor: number,
  card: Card,
  now = Date.now(),
): Target[] {
  const targets: Target[] = [];
  const d = registry[card.operation];
  if (!d) return targets;
  g.players.forEach((p, player) => {
    if (
      d.target === "MATRIX" ||
      d.target === "STRUCTURE" ||
      d.target === "CARD_POOL" ||
      d.kind === "time"
    ) {
      const t = { player };
      if (validateTarget(g, actor, card, t, now)) targets.push(t);
      return;
    }
    if (d.target === "CELL") {
      p.matrix.forEach((r, row) =>
        r.forEach((_, column) => {
          const t = { player, row, column };
          if (validateTarget(g, actor, card, t, now)) targets.push(t);
        }),
      );
      return;
    }
    const axis = d.target === "ROW" ? "row" : "column";
    const length = axis === "row" ? p.matrix.length : p.matrix[0].length;
    for (let i = 0; i < length; i++) {
      const t = { player, [axis]: i };
      if (validateTarget(g, actor, card, t, now)) targets.push(t);
    }
  });
  return targets;
}
export function getGameStage(
  g: Pick<Game, "mode" | "status" | "stageEndsAt" | "practiceStage">,
  now: number,
): GameStage {
  if (g.mode === "practice") return g.practiceStage;
  if (g.status === "pregame" || g.status === "countdown") return "early";
  return now < g.stageEndsAt[0]
    ? "early"
    : now < g.stageEndsAt[1]
      ? "mid"
      : "late";
}
export function advancePracticeStage(g: Game, now: number) {
  if (
    g.mode !== "practice" ||
    g.status !== "playing" ||
    g.practiceStage === "late"
  )
    throw Error("Only advance an active practice game before its late stage");
  g.practiceStage = g.practiceStage === "early" ? "mid" : "late";
  g.seq++;
  event(g, "PRACTICE_STAGE", { stage: g.practiceStage }, now);
}
export function generateOperation(g: Game, now = g.reservedAt): Card {
  const weights = g.config.weights[getGameStage(g, now)];
  const candidates = Object.keys(registry).filter(
    (id) =>
      weights[id as OperationId] > 0 &&
      [0, 1].some(
        (a) =>
          legalTargets(
            g,
            a,
            { id: "probe", operation: id as OperationId, value: 1 },
            now,
          ).length,
      ),
  ) as OperationId[];
  let n = random(g) * candidates.reduce((s, id) => s + weights[id], 0);
  const operation =
    candidates.find((id) => (n -= weights[id]) < 0) ??
    candidates[candidates.length - 1];
  if (!operation) throw Error("No legal operation");
  const value =
    registry[operation].seconds !== undefined
      ? Math.abs(registry[operation].seconds!)
      : !["add", "multiply", "grow", "remove", "shield"].includes(
            registry[operation].kind,
          )
        ? 1
        : operation.startsWith("negate")
          ? -1
          : operation.startsWith("multiply")
            ? 2
            : g.config.numericMin +
              Math.floor(
                random(g) * (g.config.numericMax - g.config.numericMin + 1),
              );
  const card = { id: `c${++g.cardSeq}`, operation, value };
  event(g, "CARD_GENERATED", { card }, now);
  return card;
}
export function createGame(
  id: string,
  seed: number,
  players: (import("./profile").PlayerAppearance & {
    id: string;
    name: string;
    registered: boolean;
  })[],
  config: Balance = defaultBalance,
  now = Date.now(),
  mode: Game["mode"] = "ranked",
  speed: Speed = 1,
): Game {
  const rng = { rng: seed >>> 0 || 1 };
  const p = players.map((x) => ({
    ...x,
    matrix: createStartingMatrix(rng),
    destroyedTiles: 0,
    rowShields: [false, false],
    columnShields: [false, false],
  }));
  const g: Game = {
    id,
    mode,
    speed,
    seed,
    rng: rng.rng,
    cardSeq: 0,
    config: {
      ...structuredClone(config),
      matchMs: Math.round(config.matchMs * speed),
      turnStartMs: Math.round(config.turnStartMs * speed),
    },
    players: p,
    initialMatrices: p.map((x) => structuredClone(x.matrix)),
    cards: [],
    active: mode === "practice" ? 0 : Math.floor(random(rng) * 2),
    iValue: 1 + Math.floor(random(rng) * 50),
    seq: 0,
    status: "pregame",
    reservedAt: now,
    startedAt: 0,
    endAt: 0,
    stageEndsAt: [0, 0],
    practiceStage: "early",
    turnEndsAt: 0,
    ready: [false, false],
    events: [],
    result: null,
  };
  g.rng = rng.rng;
  for (let i = 0; i < INITIAL_CARD_SLOTS; i++)
    g.cards.push(generateOperation(g));
  event(
    g,
    "RESERVED",
    {
      players: players.map((p) => p.id),
      initialMatrices: g.initialMatrices,
      cards: g.cards,
      first: g.active,
      iValue: g.iValue,
    },
    now,
  );
  return g;
}
export function startGame(g: Game, now: number) {
  g.status = "playing";
  g.startedAt = now;
  g.endAt = g.mode === "practice" ? 0 : now + g.config.matchMs;
  g.stageEndsAt =
    g.mode === "practice"
      ? [0, 0]
      : [now + g.config.matchMs / 3, now + (g.config.matchMs * 2) / 3];
  g.turnEndsAt = g.mode === "practice" ? 0 : now + g.config.turnStartMs;
  g.seq++;
  event(g, "START", {}, now);
}
function passTurn(g: Game, now: number) {
  g.active = 1 - g.active;
  g.seq++;
  g.turnEndsAt =
    g.mode === "practice"
      ? 0
      : now + calculateTurnDuration(now - g.startedAt, g.config);
}
export function addRow(p: Player, c: Balance) {
  if (p.matrix.length >= c.maxRows) throw Error("Maximum rows");
  p.matrix.push(
    p.matrix[0].map(() => Math.min(p.destroyedTiles, c.maxCellValue)),
  );
  p.rowShields.push(false);
}
export function addColumn(p: Player, c: Balance) {
  if (p.matrix[0].length >= c.maxColumns) throw Error("Maximum columns");
  p.matrix.forEach((r) => r.push(Math.min(p.destroyedTiles, c.maxCellValue)));
  p.columnShields.push(false);
}
export function removeRow(p: Player, row: number, now = Date.now()) {
  if (p.matrix.length <= 1) throw Error("Final row");
  if (p.columnShields.some((shield) => isTimedShieldActive(shield, now)))
    return false;
  if (isShieldActive(p.rowShields[row], now)) {
    if (p.rowShields[row] === true) p.rowShields[row] = false;
    return false;
  }
  p.matrix.splice(row, 1);
  p.rowShields.splice(row, 1);
  return true;
}
export function removeColumn(p: Player, column: number, now = Date.now()) {
  if (p.matrix[0].length <= 1) throw Error("Final column");
  if (p.rowShields.some((shield) => isTimedShieldActive(shield, now)))
    return false;
  if (isShieldActive(p.columnShields[column], now)) {
    if (p.columnShields[column] === true) p.columnShields[column] = false;
    return false;
  }
  p.matrix.forEach((r) => r.splice(column, 1));
  p.columnShields.splice(column, 1);
  return true;
}
export function applyShield(
  p: Player,
  axis: "row" | "column",
  index: number,
  expiresAt?: number,
) {
  (axis === "row" ? p.rowShields : p.columnShields)[index] = expiresAt ?? true;
}
export function applyOperation(
  g: Game,
  actor: number,
  card: Card,
  t: Target,
  now = Date.now(),
) {
  if (!validateTarget(g, actor, card, t, now)) throw Error("Illegal target");
  const p = g.players[t.player],
    d = registry[card.operation];
  const axis = d.target === "ROW" ? "row" : "column";
  if (d.kind === "unlock") {
    g.cards.push(generateOperation(g, now));
    return "unlock";
  }
  if (d.kind === "time") {
    const delta = d.seconds! * 1000;
    if (d.target === "MATCH_CLOCK") {
      g.stageEndsAt = g.stageEndsAt.map((deadline) =>
        deadline > now ? Math.max(now, deadline + delta) : deadline,
      ) as [number, number];
      g.endAt = Math.max(now, g.endAt + delta);
    } else {
      if (delta < 0) passTurn(g, now);
      g.turnEndsAt = Math.max(now, g.turnEndsAt + delta);
    }
    return "time";
  }
  if (d.kind === "grow") {
    card.operation === "add_row" ? addRow(p, g.config) : addColumn(p, g.config);
    return "growth";
  }
  if (d.kind === "remove")
    return (
      axis === "row"
        ? removeRow(p, t.row!, now)
        : removeColumn(p, t.column!, now)
    )
      ? "removed"
      : "blocked";
  if (d.kind === "shield") {
    applyShield(
      p,
      axis,
      axis === "row" ? t.row! : t.column!,
      d.seconds === undefined ? undefined : now + d.seconds * 1000,
    );
    return "shield";
  }
  let applied = false;
  let determinantValue = 0;
  if (d.kind === "determinant") {
    const value = determinant(p.matrix.map((row) => row.map((v) => BigInt(v))));
    const limit = BigInt(g.config.maxCellValue);
    determinantValue = Number(
      value < -limit ? -limit : value > limit ? limit : value,
    );
  }
  p.matrix = p.matrix.map((r, row) =>
    r.map((v, column) => {
      if (
        (d.target === "CELL" && (row !== t.row || column !== t.column)) ||
        (d.target === "ROW" && row !== t.row) ||
        (d.target === "COLUMN" && column !== t.column) ||
        (actor !== t.player && isCellProtected(p, row, column, now))
      )
        return v;
      applied = true;
      let n = v;
      switch (d.kind) {
        case "square":
          n = v ** 2;
          break;
        case "cube":
          n = v ** 3;
          break;
        case "sqrt":
          n = Math.floor(Math.sqrt(Math.abs(v)) * (v < 0 ? g.iValue : 1));
          break;
        case "absolute":
          n = Math.abs(v);
          break;
        case "factorial":
          n = factorials[v];
          break;
        case "fibonacci":
          n = fibonacci[v];
          break;
        case "next_prime":
          n = adjacentPrime(v, 1, g.config.maxCellValue)!;
          break;
        case "previous_prime":
          n = adjacentPrime(v, -1, g.config.maxCellValue)!;
          break;
        case "reverse":
          n =
            (v < 0 ? -1 : 1) *
            Number(String(Math.abs(v)).split("").reverse().join(""));
          break;
        case "determinant":
          n = determinantValue;
          break;
        case "multiply":
          n = v * card.value;
          break;
        case "add":
          n = v + (card.operation.startsWith("sub") ? -card.value : card.value);
          break;
      }
      return Math.max(
        -g.config.maxCellValue,
        Math.min(g.config.maxCellValue, n),
      );
    }),
  );
  return applied ? "arithmetic" : "blocked";
}
export function useOperation(
  g: Game,
  actor: number,
  cardId: string,
  t: Target,
  seq: number,
  now: number,
) {
  if (
    g.status !== "playing" ||
    actor !== g.active ||
    seq !== g.seq ||
    (g.mode !== "practice" && (now >= g.endAt || now >= g.turnEndsAt))
  )
    throw Error("Out of turn or stale action");
  const index = g.cards.findIndex((c) => c.id === cardId);
  if (index < 0) throw Error("Card consumed");
  const card = g.cards[index];
  const effect = applyOperation(g, actor, card, t, now);
  event(g, "OPERATION", { actor, card, target: t, effect, seq }, now);
  g.cards[index] = generateOperation(g, now);
  if (effect === "unlock" && g.cards.length === MAX_CARD_SLOTS)
    g.cards = g.cards.map((c) =>
      c.operation === "unlock_slot" ? generateOperation(g, now) : c,
    );
  if (effect === "time") {
    const d = registry[card.operation];
    if (d.target === "MATCH_CLOCK" && g.endAt > now) passTurn(g, now);
    else if (d.target === "TURN_CLOCK" && d.seconds! > 0) g.seq++;
    tickGame(g, now);
  } else passTurn(g, now);
  return effect;
}
export function finishGame(
  g: Game,
  now: number,
  reason = "clock",
  forfeit?: number,
) {
  if (g.status === "finished") return;
  const scores = g.players.map((p) => calculateScore(p.matrix));
  g.result = {
    scores,
    winner:
      forfeit === undefined
        ? determineWinner(scores[0], scores[1])
        : 1 - forfeit,
    reason,
  };
  g.status = "finished";
  g.seq++;
  event(
    g,
    "FINISH",
    { ...g.result, matrices: g.players.map((p) => p.matrix) },
    now,
  );
}
function refreshAndPass(
  g: Game,
  now: number,
  type: "TIMEOUT" | "PRACTICE_PASS" | "SKIP_TURN",
) {
  const indices = g.cards.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const removed = indices.slice(0, Math.ceil(g.cards.length / 2));
  const destroyed = removed.map((i) => g.cards[i].id);
  g.players[g.active].destroyedTiles += destroyed.length;
  event(g, type, { player: g.active, destroyed }, now);
  removed.forEach((i) => (g.cards[i] = generateOperation(g, now)));
  passTurn(g, now);
}
export function skipTurn(g: Game, actor: number, seq: number, now: number) {
  if (
    g.status !== "playing" ||
    actor !== g.active ||
    seq !== g.seq ||
    (g.mode !== "practice" && (now >= g.endAt || now >= g.turnEndsAt))
  )
    throw Error("Out of turn or stale action");
  refreshAndPass(g, now, "SKIP_TURN");
}
export function skipPracticeTurn(
  g: Game,
  actor: number,
  seq: number,
  now: number,
) {
  if (
    g.mode !== "practice" ||
    g.status !== "playing" ||
    actor !== g.active ||
    seq !== g.seq ||
    g.cards.some((c) => legalTargets(g, actor, c, now).length)
  )
    throw Error("Only skip a practice turn with no playable tiles");
  refreshAndPass(g, now, "PRACTICE_PASS");
}
export function playPracticeAI(g: Game, now: number): boolean {
  if (g.mode !== "practice" || g.status !== "playing" || g.active !== 1)
    return false;
  // ponytail: random legal moves; add strategy only if practice needs a stronger opponent.
  const playable = g.cards
    .map((card) => ({ card, targets: legalTargets(g, 1, card, now) }))
    .filter(({ targets }) => targets.length);
  if (!playable.length) skipPracticeTurn(g, 1, g.seq, now);
  else {
    const { card, targets } = playable[Math.floor(random(g) * playable.length)];
    useOperation(
      g,
      1,
      card.id,
      targets[Math.floor(random(g) * targets.length)],
      g.seq,
      now,
    );
  }
  return true;
}
export function tickGame(g: Game, now: number): string | null {
  if (g.status === "countdown" && now >= g.startedAt) {
    startGame(g, g.startedAt);
    return "start";
  }
  if (g.status !== "playing") return null;
  if (g.mode !== "practice" && now >= g.endAt) {
    finishGame(g, g.endAt);
    return "finish";
  }
  if (g.mode !== "practice" && now >= g.turnEndsAt) {
    refreshAndPass(g, now, "TIMEOUT");
    return "timeout";
  }
  return null;
}
export function publicGame(
  g: Game,
  disconnectedAt: (number | null)[] = [null, null],
) {
  return {
    id: g.id,
    mode: g.mode ?? "quick",
    speed: g.speed ?? 1,
    iValue: g.iValue,
    players: g.players,
    cards: g.cards,
    active: g.active,
    seq: g.seq,
    status: g.status,
    startedAt: g.startedAt,
    endAt: g.endAt,
    stageEndsAt: g.stageEndsAt,
    practiceStage: g.practiceStage,
    turnEndsAt: g.turnEndsAt,
    ready: g.ready,
    disconnectedAt: [...disconnectedAt],
    result: g.result,
    lastAction:
      g.events.findLast((e) =>
        [
          "OPERATION",
          "TIMEOUT",
          "PRACTICE_PASS",
          "SKIP_TURN",
          "FINISH",
        ].includes(e.type),
      ) ?? null,
    serverNow: Date.now(),
    config: {
      maxRows: g.config.maxRows,
      maxColumns: g.config.maxColumns,
      maxCellValue: g.config.maxCellValue,
    },
  };
}
export type PublicGame = ReturnType<typeof publicGame>;

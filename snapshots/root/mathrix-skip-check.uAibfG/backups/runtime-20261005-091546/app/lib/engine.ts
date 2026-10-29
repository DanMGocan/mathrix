import {
  defaultBalance,
  timeTiles,
  type Balance,
  type operationIds,
} from "./config";
export type Matrix = number[][];
export type Ownership = "SELF_ONLY" | "OPPONENT_ONLY" | "EITHER";
export type TargetType =
  | "CELL"
  | "ROW"
  | "COLUMN"
  | "MATRIX"
  | "STRUCTURE"
  | "MATCH_CLOCK"
  | "TURN_CLOCK";
export type OperationId = (typeof operationIds)[number];
export type Card = { id: string; operation: OperationId; value: number };
export type Target = {
  player: number;
  row?: number;
  column?: number;
  second?: number;
};
export type Player = {
  id: string;
  name: string;
  registered: boolean;
  matrix: Matrix;
  rowShields: boolean[];
  columnShields: boolean[];
};
export type GameEvent = {
  at: number;
  type: string;
  data: Record<string, unknown>;
};
export type SkillStage = {
  id: number;
  number: number;
  x: number;
  y: number;
  size: number;
  issuedAt: number;
  expiresAt: number;
};
export type Game = {
  id: string;
  seed: number;
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
  turnEndsAt: number;
  ready: boolean[];
  minigame: null | {
    player: number;
    axis: "row" | "column";
    index: number;
    hits: number;
    stage: SkillStage;
  };
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
    | "grow"
    | "remove"
    | "shield"
    | "swap"
    | "time"
    | "transpose";
  seconds?: number;
};
export const registry: Record<OperationId, OperationDefinition> = {
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
      "Add a row of 1s to your matrix, then start the reflex stage to increase its cells.",
    target: "STRUCTURE",
    ownership: "SELF_ONLY",
    kind: "grow",
  },
  add_column: {
    label: "ADD COLUMN",
    description:
      "Add a column of 1s to your matrix, then start the reflex stage to increase its cells.",
    target: "STRUCTURE",
    ownership: "SELF_ONLY",
    kind: "grow",
  },
  remove_row: {
    label: "REMOVE ROW",
    description:
      "Remove an opponent row. A shield blocks removal and is consumed; the last row cannot be removed.",
    target: "ROW",
    ownership: "OPPONENT_ONLY",
    kind: "remove",
  },
  remove_column: {
    label: "REMOVE COLUMN",
    description:
      "Remove an opponent column. A shield blocks removal and is consumed; the last column cannot be removed.",
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
  swap_rows: {
    label: "SWAP ROWS",
    description:
      "Exchange two rows in either matrix, moving their shields with them.",
    target: "ROW",
    ownership: "EITHER",
    kind: "swap",
  },
  swap_columns: {
    label: "SWAP COLUMNS",
    description:
      "Exchange two columns in either matrix, moving their shields with them.",
    target: "COLUMN",
    ownership: "EITHER",
    kind: "swap",
  },
  transpose: {
    label: "TRANSPOSE",
    description:
      "Exchange rows and columns in either matrix. Shields follow their lines and the score stays the same. Resulting dimensions must fit the matrix limits.",
    target: "MATRIX",
    ownership: "EITHER",
    kind: "transpose",
  },
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
  g.events.push({ at: now, type, data });
}
const validIndex = (n: number | undefined, length: number) =>
  Number.isInteger(n) && n! >= 0 && n! < length;
export function validateTarget(
  g: Pick<Game, "players"> & {
    config: Pick<Balance, "maxRows" | "maxColumns">;
  },
  actor: number,
  card: Card,
  t: Target,
): boolean {
  const def = registry[card.operation];
  const p = g.players[t.player];
  if (!def || !p || !Number.isInteger(actor) || actor < 0 || actor > 1)
    return false;
  if (
    (def.ownership === "SELF_ONLY" && actor !== t.player) ||
    (def.ownership === "OPPONENT_ONLY" && actor === t.player)
  )
    return false;
  if (def.kind === "time")
    return (
      t.row === undefined &&
      t.column === undefined &&
      t.second === undefined &&
      (def.target !== "MATCH_CLOCK" || t.player === actor)
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
  switch (card.operation) {
    case "transpose":
      return cols <= g.config.maxRows && rows <= g.config.maxColumns;
    case "add_row":
      return rows < g.config.maxRows;
    case "add_column":
      return cols < g.config.maxColumns;
    case "remove_row":
      return rows > 1;
    case "remove_column":
      return cols > 1;
    case "row_shield":
      return !p.rowShields[t.row!];
    case "column_shield":
      return !p.columnShields[t.column!];
    case "swap_rows":
      return validIndex(t.second, rows) && t.second !== t.row;
    case "swap_columns":
      return validIndex(t.second, cols) && t.second !== t.column;
    default:
      return true;
  }
}
export function legalTargets(
  g: Pick<Game, "players"> & {
    config: Pick<Balance, "maxRows" | "maxColumns">;
  },
  actor: number,
  card: Card,
): Target[] {
  const targets: Target[] = [];
  g.players.forEach((p, player) => {
    const d = registry[card.operation];
    if (
      d.target === "MATRIX" ||
      d.target === "STRUCTURE" ||
      d.kind === "time"
    ) {
      const t = { player };
      if (validateTarget(g, actor, card, t)) targets.push(t);
      return;
    }
    if (d.target === "CELL") {
      p.matrix.forEach((r, row) =>
        r.forEach((_, column) => {
          const t = { player, row, column };
          if (validateTarget(g, actor, card, t)) targets.push(t);
        }),
      );
      return;
    }
    const axis = d.target === "ROW" ? "row" : "column";
    const length = axis === "row" ? p.matrix.length : p.matrix[0].length;
    for (let i = 0; i < length; i++) {
      if (d.kind === "swap") {
        for (let second = 0; second < length; second++) {
          const t = { player, [axis]: i, second };
          if (validateTarget(g, actor, card, t)) targets.push(t);
        }
      } else {
        const t = { player, [axis]: i };
        if (validateTarget(g, actor, card, t)) targets.push(t);
      }
    }
  });
  return targets;
}
export function generateOperation(g: Game, now = g.reservedAt): Card {
  const candidates = Object.keys(registry).filter(
    (id) =>
      g.config.weights[id as OperationId] > 0 &&
      [0, 1].some(
        (a) =>
          legalTargets(g, a, {
            id: "probe",
            operation: id as OperationId,
            value: 1,
          }).length,
      ),
  ) as OperationId[];
  let n = random(g) * candidates.reduce((s, id) => s + g.config.weights[id], 0);
  const operation =
    candidates.find((id) => (n -= g.config.weights[id]) < 0) ??
    candidates[candidates.length - 1];
  if (!operation) throw Error("No legal operation");
  const value =
    registry[operation].kind === "time"
      ? Math.abs(registry[operation].seconds!)
      : operation === "transpose"
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
  players: { id: string; name: string; registered: boolean }[],
  config: Balance = defaultBalance,
  now = Date.now(),
): Game {
  const rng = { rng: seed >>> 0 || 1 };
  const p = players.map((x) => ({
    ...x,
    matrix: createStartingMatrix(rng),
    rowShields: [false, false],
    columnShields: [false, false],
  }));
  const g: Game = {
    id,
    seed,
    rng: rng.rng,
    cardSeq: 0,
    config: structuredClone(config),
    players: p,
    initialMatrices: p.map((x) => structuredClone(x.matrix)),
    cards: [],
    active: Math.floor(random(rng) * 2),
    seq: 0,
    status: "pregame",
    reservedAt: now,
    startedAt: 0,
    endAt: 0,
    turnEndsAt: 0,
    ready: [false, false],
    minigame: null,
    events: [],
    result: null,
  };
  g.rng = rng.rng;
  for (let i = 0; i < 8; i++) g.cards.push(generateOperation(g));
  event(
    g,
    "RESERVED",
    {
      players: players.map((p) => p.id),
      initialMatrices: g.initialMatrices,
      cards: g.cards,
      first: g.active,
    },
    now,
  );
  return g;
}
export function startGame(g: Game, now: number) {
  g.status = "playing";
  g.startedAt = now;
  g.endAt = now + g.config.matchMs;
  g.turnEndsAt = now + g.config.turnStartMs;
  g.seq++;
  event(g, "START", {}, now);
}
function passTurn(g: Game, now: number) {
  g.active = 1 - g.active;
  g.seq++;
  g.turnEndsAt = now + calculateTurnDuration(now - g.startedAt, g.config);
  g.minigame = null;
}
export function addRow(p: Player, c: Balance) {
  if (p.matrix.length >= c.maxRows) throw Error("Maximum rows");
  p.matrix.push(p.matrix[0].map(() => 1));
  p.rowShields.push(false);
}
export function addColumn(p: Player, c: Balance) {
  if (p.matrix[0].length >= c.maxColumns) throw Error("Maximum columns");
  p.matrix.forEach((r) => r.push(1));
  p.columnShields.push(false);
}
export function removeRow(p: Player, row: number) {
  if (p.matrix.length <= 1) throw Error("Final row");
  if (p.rowShields[row]) {
    p.rowShields[row] = false;
    return false;
  }
  p.matrix.splice(row, 1);
  p.rowShields.splice(row, 1);
  return true;
}
export function removeColumn(p: Player, column: number) {
  if (p.matrix[0].length <= 1) throw Error("Final column");
  if (p.columnShields[column]) {
    p.columnShields[column] = false;
    return false;
  }
  p.matrix.forEach((r) => r.splice(column, 1));
  p.columnShields.splice(column, 1);
  return true;
}
export function applyShield(p: Player, axis: "row" | "column", index: number) {
  (axis === "row" ? p.rowShields : p.columnShields)[index] = true;
}
export function applyOperation(
  g: Game,
  actor: number,
  card: Card,
  t: Target,
  now = Date.now(),
) {
  if (!validateTarget(g, actor, card, t)) throw Error("Illegal target");
  const p = g.players[t.player],
    d = registry[card.operation];
  const axis = d.target === "ROW" ? "row" : "column";
  if (d.kind === "time") {
    const delta = d.seconds! * 1000;
    if (d.target === "MATCH_CLOCK") g.endAt = Math.max(now, g.endAt + delta);
    else {
      if (delta < 0) passTurn(g, now);
      g.turnEndsAt = Math.max(now, g.turnEndsAt + delta);
    }
    return "time";
  }
  if (d.kind === "transpose") {
    p.matrix = p.matrix[0].map((_, column) =>
      p.matrix.map((row) => row[column]),
    );
    [p.rowShields, p.columnShields] = [p.columnShields, p.rowShields];
    return "transpose";
  }
  if (d.kind === "grow") {
    card.operation === "add_row" ? addRow(p, g.config) : addColumn(p, g.config);
    return "growth";
  }
  if (d.kind === "remove")
    return (axis === "row" ? removeRow(p, t.row!) : removeColumn(p, t.column!))
      ? "removed"
      : "blocked";
  if (d.kind === "shield") {
    applyShield(p, axis, axis === "row" ? t.row! : t.column!);
    return "shield";
  }
  if (d.kind === "swap") {
    if (axis === "row") {
      [p.matrix[t.row!], p.matrix[t.second!]] = [
        p.matrix[t.second!],
        p.matrix[t.row!],
      ];
      [p.rowShields[t.row!], p.rowShields[t.second!]] = [
        p.rowShields[t.second!],
        p.rowShields[t.row!],
      ];
    } else {
      p.matrix.forEach((r) => {
        [r[t.column!], r[t.second!]] = [r[t.second!], r[t.column!]];
      });
      [p.columnShields[t.column!], p.columnShields[t.second!]] = [
        p.columnShields[t.second!],
        p.columnShields[t.column!],
      ];
    }
    return "swap";
  }
  p.matrix = p.matrix.map((r, row) =>
    r.map((v, column) => {
      if (
        (d.target === "CELL" && (row !== t.row || column !== t.column)) ||
        (d.target === "ROW" && row !== t.row) ||
        (d.target === "COLUMN" && column !== t.column)
      )
        return v;
      const n =
        d.kind === "multiply"
          ? v * card.value
          : v + (card.operation.startsWith("sub") ? -card.value : card.value);
      return Math.max(
        -g.config.maxCellValue,
        Math.min(g.config.maxCellValue, n),
      );
    }),
  );
  return "arithmetic";
}
function stage(g: Game, now: number): SkillStage {
  const m = g.minigame!,
    c = g.config;
  const size =
    c.skillMinSize +
    (c.skillStartSize - c.skillMinSize) * Math.exp(-c.skillSizeDecay * m.hits);
  const lifetime =
    c.skillMinMs +
    (c.skillStartMs - c.skillMinMs) * Math.exp(-c.skillTimeDecay * m.hits);
  const initial =
    m.axis === "row"
      ? g.players[m.player].matrix[0].length
      : g.players[m.player].matrix.length;
  return {
    id: m.hits + 1,
    number: initial + m.hits + 1,
    x: 0.12 + random(g) * 0.76,
    y: 0.18 + random(g) * 0.64,
    size,
    issuedAt: now,
    expiresAt: Math.min(g.endAt, now + Math.round(lifetime)),
  };
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
    g.minigame ||
    actor !== g.active ||
    seq !== g.seq ||
    now >= g.endAt ||
    now >= g.turnEndsAt
  )
    throw Error("Out of turn or stale action");
  const index = g.cards.findIndex((c) => c.id === cardId);
  if (index < 0) throw Error("Card consumed");
  const card = g.cards[index];
  const effect = applyOperation(g, actor, card, t, now);
  event(g, "OPERATION", { actor, card, target: t, effect, seq }, now);
  g.cards[index] = generateOperation(g, now);
  if (effect === "time") {
    const d = registry[card.operation];
    if (d.target === "MATCH_CLOCK" && g.endAt > now) passTurn(g, now);
    else if (d.target === "TURN_CLOCK" && d.seconds! > 0) g.seq++;
    tickGame(g, now);
  } else if (effect === "growth") {
    const axis = card.operation === "add_row" ? "row" : "column",
      p = g.players[actor];
    g.minigame = {
      player: actor,
      axis,
      index: axis === "row" ? p.matrix.length - 1 : p.matrix[0].length - 1,
      hits: 0,
      stage: {} as SkillStage,
    };
    g.minigame.stage = stage(g, now);
    g.seq++;
    event(g, "SKILL_STAGE", { stage: g.minigame.stage }, now);
  } else passTurn(g, now);
  return effect;
}
export function skillHit(
  g: Game,
  actor: number,
  id: number,
  x: number,
  y: number,
  now: number,
) {
  const m = g.minigame;
  if (
    g.status !== "playing" ||
    !m ||
    actor !== m.player ||
    id !== m.stage.id ||
    now >= m.stage.expiresAt ||
    now >= g.endAt ||
    now - m.stage.issuedAt < 65 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw Error("Invalid skill attempt");
  const s = m.stage;
  if (((x - s.x) * 480) ** 2 + ((y - s.y) * 280) ** 2 > (s.size / 2) ** 2)
    throw Error("Outside skill target");
  const p = g.players[actor];
  const cell = Math.floor(
    random(g) * (m.axis === "row" ? p.matrix[0].length : p.matrix.length),
  );
  if (m.axis === "row") p.matrix[m.index][cell]++;
  else p.matrix[cell][m.index]++;
  m.hits++;
  g.seq++;
  event(g, "SKILL_HIT", { actor, stage: id, cell, hits: m.hits }, now);
  m.stage = stage(g, now);
  event(g, "SKILL_STAGE", { stage: m.stage }, now);
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
  g.minigame = null;
  g.seq++;
  event(
    g,
    "FINISH",
    { ...g.result, matrices: g.players.map((p) => p.matrix) },
    now,
  );
}
export function tickGame(g: Game, now: number): string | null {
  if (g.status === "countdown" && now >= g.startedAt) {
    startGame(g, g.startedAt);
    return "start";
  }
  if (g.status !== "playing") return null;
  if (now >= g.endAt) {
    finishGame(g, g.endAt);
    return "finish";
  }
  if (g.minigame && now >= g.minigame.stage.expiresAt) {
    event(g, "SKILL_END", { player: g.active, hits: g.minigame.hits }, now);
    passTurn(g, now);
    return "skill_end";
  }
  if (!g.minigame && now >= g.turnEndsAt) {
    const indices = g.cards.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random(g) * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const destroyed = indices.slice(0, 3).map((i) => g.cards[i].id);
    event(g, "TIMEOUT", { player: g.active, destroyed }, now);
    indices
      .slice(0, 3)
      .forEach((i) => (g.cards[i] = generateOperation(g, now)));
    passTurn(g, now);
    return "timeout";
  }
  return null;
}
export function publicGame(g: Game) {
  return {
    id: g.id,
    players: g.players,
    cards: g.cards,
    active: g.active,
    seq: g.seq,
    status: g.status,
    startedAt: g.startedAt,
    endAt: g.endAt,
    turnEndsAt: g.turnEndsAt,
    ready: g.ready,
    minigame: g.minigame,
    result: g.result,
    lastAction:
      g.events.findLast((e) =>
        ["OPERATION", "TIMEOUT", "SKILL_END", "FINISH"].includes(e.type),
      ) ?? null,
    serverNow: Date.now(),
    config: { maxRows: g.config.maxRows, maxColumns: g.config.maxColumns },
  };
}
export type PublicGame = ReturnType<typeof publicGame>;

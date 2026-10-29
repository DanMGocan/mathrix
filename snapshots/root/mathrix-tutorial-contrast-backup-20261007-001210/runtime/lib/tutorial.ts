import {
  advancePracticeStage,
  calculateScore,
  createGame,
  finishGame,
  legalTargets,
  playPracticeAI,
  registry,
  skipTurn,
  startGame,
  useOperation,
  type Card,
  type Game,
  type OperationId,
  type Target,
} from "./engine";

export const tutorialLessons: {
  title: string;
  instruction: string;
  detail: string;
  operation: OperationId | null;
  value: number;
}[] = [
  {
    title: "Make your sum count",
    instruction:
      "Choose +3 cell, then choose any highlighted cell in your matrix.",
    detail:
      "Both matrices start with a sum of 10. Raise yours to finish with the higher signed sum. Used tiles are replaced in the pool shared by both players.",
    operation: "add_cell",
    value: 3,
  },
  {
    title: "Play on either matrix",
    instruction: "Choose −3 cell, then choose a highlighted opponent cell.",
    detail:
      "Either-matrix tiles can help you or reduce your opponent’s score. Here, choose one of their cells worth at least 3.",
    operation: "sub_cell",
    value: 3,
  },
  {
    title: "Negative numbers count",
    instruction: "Use |x| cell on the negative cell the AI changed.",
    detail:
      "Negative values subtract from your score. Absolute value turns a negative into a positive; this move repairs the AI’s attack.",
    operation: "absolute_cell",
    value: 1,
  },
  {
    title: "Read the tile’s scope",
    instruction:
      "Choose +2 row, then choose either highlighted row in your matrix.",
    detail:
      "A row tile affects every cell in one horizontal line. Column tiles affect a vertical line; matrix tiles affect the whole board. Use the row’s R button to target it.",
    operation: "add_row_value",
    value: 2,
  },
  {
    title: "Skip to build your reserves",
    instruction: "Choose Skip turn to replace two of the four shared tiles.",
    detail:
      "Skipping destroys half the shared tiles, rounded up, and passes your turn. The destroyed total strengthens growth and power limits. We’re now in Mid stage. Normal match clocks advance Early, Mid and Late stages, changing the chances of newly drawn tiles. Missed timed turns have the same effect as Skip.",
    operation: null,
    value: 0,
  },
  {
    title: "Grow your matrix",
    instruction: "Choose Add Row, then choose your highlighted matrix.",
    detail:
      "New cells use your destroyed-tile total, which is not spent. Add Column works the same way. Growth can target either matrix, up to 5×5.",
    operation: "add_row",
    value: 1,
  },
  {
    title: "Raise a power limit",
    instruction: "Choose +2 Maximum Square to apply the boost immediately.",
    detail:
      "Maximum Square starts at 2 and Maximum Cube at 1. Destroyed tiles increase both; boost tiles increase the named limit. Limits are never spent and reset each game.",
    operation: "add_max_square",
    value: 2,
  },
  {
    title: "Choose a legal power",
    instruction:
      "Choose x² cell, then choose a highlighted positive cell in your matrix.",
    detail:
      "Square and Cube check a cell’s absolute value against your own maximum, even on the opponent’s matrix. Cube preserves the sign. Every result is capped at −10,000 to 10,000.",
    operation: "square_cell",
    value: 1,
  },
  {
    title: "Use this game’s i value",
    instruction: "Use √ cell on the negative cell in your new row.",
    detail:
      "This tutorial uses i = 7. A negative square root becomes the root of its magnitude multiplied by i; round the complete result down. Regular matches draw i from 1 to 50.",
    operation: "sqrt_cell",
    value: 1,
  },
  {
    title: "Protect a line",
    instruction:
      "Choose Row Shield, then choose any highlighted row in your matrix.",
    detail:
      "A shield blocks one removal attempt, then disappears. Bronze, Silver and Gold Protect tiles instead block all opponent changes for 10, 20 or 30 seconds. Their timers still run while you read help; your own moves work.",
    operation: "row_shield",
    value: 1,
  },
  {
    title: "Expand the shared pool",
    instruction: "Choose Unlock Slot to add a filled fifth tile slot.",
    detail:
      "Both players can use the new slot. Unlock can expand the shared pool to eight; using it passes your turn.",
    operation: "unlock_slot",
    value: 1,
  },
  {
    title: "Remove an opponent line",
    instruction:
      "Choose Remove Row, then choose either highlighted opponent row.",
    detail:
      "Removal tiles only target your opponent. Their final row or column cannot be removed. Afterwards, play three rounds of your own choices before we compare the scores.",
    operation: "remove_row",
    value: 1,
  },
];

export type TutorialState = {
  phase: "instruction" | "feedback" | "ai" | "free" | "finished";
  lesson: number;
  freeTurns: number;
  feedback: string;
  botFeedback: string;
  negative?: Target;
  freshRow?: number;
  rootNegative?: Target;
  shieldRow?: number;
};
type TutorialView = Pick<
  Game,
  "players" | "cards" | "mode" | "status" | "active"
> & {
  config: Pick<Game["config"], "maxRows" | "maxColumns" | "maxCellValue">;
};
type Draw = Pick<Card, "operation" | "value">;
const botAdd: Draw = { operation: "add_cell", value: 1 };
const sameTarget = (a: Target, b: Target) =>
  a.player === b.player && a.row === b.row && a.column === b.column;
const matchesCard = (card: Card, draw: Draw) =>
  card.operation === draw.operation && card.value === draw.value;

// ponytail: a fixed teaching sequence; add a lesson editor only if more tutorials are needed.
function curateDraws(g: Game, before: Set<string>, draws: Draw[]) {
  const untouched = g.cards.filter((card) => before.has(card.id));
  const needed = draws.filter(
    (draw) => !untouched.some((card) => matchesCard(card, draw)),
  );
  for (const card of g.cards.filter((c) => !before.has(c.id))) {
    Object.assign(card, needed.shift() ?? botAdd);
    const generated = g.events.findLast(
      (e) =>
        e.type === "CARD_GENERATED" && (e.data.card as Card).id === card.id,
    );
    if (generated) generated.data.card = structuredClone(card);
  }
  if (needed.length) throw Error("The tutorial needs a replacement tile");
}

export function createTutorial(id: string, seed: number, now: number) {
  const game = createGame(
    id,
    seed,
    [
      { id: "tutorial-player", name: "You", registered: false },
      { id: "tutorial-ai", name: "Easy AI", registered: false },
    ],
    undefined,
    now,
    "practice",
  );
  game.players.forEach(
    (player) =>
      (player.matrix = [
        [1, 2],
        [3, 4],
      ]),
  );
  game.initialMatrices = game.players.map((p) => structuredClone(p.matrix));
  game.iValue = 7;
  game.ready = [true, true];
  curateDraws(game, new Set(), [
    { operation: "add_cell", value: 3 },
    { operation: "sub_cell", value: 3 },
    { operation: "absolute_cell", value: 1 },
    botAdd,
  ]);
  const reserved = game.events.find((e) => e.type === "RESERVED")!;
  reserved.data.initialMatrices = structuredClone(game.initialMatrices);
  reserved.data.cards = structuredClone(game.cards);
  reserved.data.iValue = 7;
  startGame(game, now);
  const state: TutorialState = {
    phase: "instruction",
    lesson: 0,
    freeTurns: 0,
    feedback: "",
    botFeedback: "",
  };
  return { game, state };
}

export function tutorialTargets(
  g: TutorialView,
  state: TutorialState,
  card: Card,
  now: number,
): Target[] {
  if (
    g.status !== "playing" ||
    g.active !== 0 ||
    !["instruction", "free"].includes(state.phase) ||
    !g.cards.some((c) => c.id === card.id && matchesCard(c, card))
  )
    return [];
  const targets = legalTargets(g, 0, card, now);
  if (state.phase === "free") return targets;
  const lesson = tutorialLessons[state.lesson];
  if (
    !lesson ||
    card.operation !== lesson.operation ||
    card.value !== lesson.value
  )
    return [];
  return targets.filter((target) => {
    const value =
      g.players[target.player].matrix[target.row ?? 0][target.column ?? 0];
    switch (state.lesson) {
      case 1:
        return target.player === 1 && value >= 3;
      case 2:
        return (
          !!state.negative && sameTarget(target, state.negative) && value < 0
        );
      case 7:
        return target.player === 0 && value >= 2;
      case 8:
        return (
          !!state.rootNegative &&
          sameTarget(target, state.rootNegative) &&
          value < 0
        );
      case 11:
        return (
          target.player === 1 &&
          calculateScore([g.players[1].matrix[target.row!]]) > 0
        );
      default:
        return target.player === 0;
    }
  });
}

function scoreFeedback(g: Game, before: number[]) {
  return `Your score: ${before[0]} → ${calculateScore(g.players[0].matrix)}. Easy AI’s score: ${before[1]} → ${calculateScore(g.players[1].matrix)}.`;
}

function botDraw(lesson: number): Draw {
  return lesson === 1 || lesson === 7
    ? { operation: "negate_cell", value: -1 }
    : lesson === 9
      ? { operation: "remove_row", value: 1 }
      : botAdd;
}

export function tutorialAction(
  g: Game,
  state: TutorialState,
  cardId: string,
  target: Target,
  now: number,
) {
  const card = g.cards.find((c) => c.id === cardId);
  if (
    !card ||
    !tutorialTargets(g, state, card, now).some((t) => sameTarget(t, target))
  )
    throw Error("Choose the lesson tile and a highlighted target");
  const before = g.players.map((p) => calculateScore(p.matrix));
  const beforeIds = new Set(g.cards.map((c) => c.id));
  const beforeCell =
    g.players[target.player].matrix[target.row ?? 0][target.column ?? 0];
  const beforeMaximum = g.players[0].maxSquare;
  const effect = useOperation(g, 0, card.id, target, g.seq, now);
  let detail = `${registry[card.operation].label.replace(/\bN\b/g, String(card.value))} applied.`;
  if (registry[card.operation].target === "CELL")
    detail = `${beforeCell} → ${g.players[target.player].matrix[target.row!][target.column!]}.`;
  if (state.phase === "instruction") {
    switch (state.lesson) {
      case 5:
        state.freshRow = g.players[0].matrix.length - 1;
        detail = `Your new row is filled with ${g.players[0].destroyedTiles}. Your destroyed total is not spent.`;
        break;
      case 6:
        detail = `Maximum Square: ${beforeMaximum} → ${g.players[0].maxSquare}. It is never spent.`;
        break;
      case 7:
        detail += ` Maximum Square stays ${g.players[0].maxSquare}; results obey the cell-value limit.`;
        break;
      case 8:
        detail = `√(${beforeCell}) = floor(√${Math.abs(beforeCell)} × ${g.iValue}) = ${g.players[0].matrix[target.row!][target.column!]}.`;
        break;
      case 9:
        state.shieldRow = target.row;
        detail = `Row ${target.row! + 1} now blocks one removal. Your score stays the same.`;
        break;
      case 10:
        detail = `The pool now has ${g.cards.length} shared slots. Both players can use them.`;
        break;
      case 11:
        detail =
          "The opponent’s selected row was removed. Their final row cannot be removed.";
        break;
    }
    curateDraws(g, beforeIds, [botDraw(state.lesson)]);
  } else {
    state.freeTurns++;
    if (effect === "blocked")
      detail = "The protected target blocked this change.";
  }
  state.feedback = `${detail} ${scoreFeedback(g, before)}`;
  state.phase = "feedback";
}

export function tutorialSkip(g: Game, state: TutorialState, now: number) {
  if (
    g.status !== "playing" ||
    g.active !== 0 ||
    !(
      state.phase === "free" ||
      (state.phase === "instruction" && state.lesson === 4)
    )
  )
    throw Error("Follow the current lesson before skipping");
  const beforeIds = new Set(g.cards.map((c) => c.id));
  const beforeTotal = g.players[0].destroyedTiles;
  skipTurn(g, 0, g.seq, now);
  if (state.phase === "instruction") curateDraws(g, beforeIds, [botAdd]);
  else state.freeTurns++;
  const player = g.players[0];
  state.feedback = `You destroyed ${player.destroyedTiles - beforeTotal} shared tiles. Your growth total is ${player.destroyedTiles}; Maximum Square is ${player.maxSquare} and Maximum Cube is ${player.maxCube}. Your matrix and score stay the same.`;
  state.phase = "feedback";
}

export function continueTutorial(g: Game, state: TutorialState, _now: number) {
  if (state.phase !== "feedback" || g.status !== "playing" || g.active !== 1)
    throw Error("Play your guided move before continuing");
  state.phase = "ai";
}

export function playTutorialAI(
  g: Game,
  state: TutorialState,
  now: number,
): boolean {
  if (state.phase !== "ai" || g.status !== "playing" || g.active !== 1)
    return false;
  const before = g.players.map((p) => calculateScore(p.matrix));
  if (state.lesson === tutorialLessons.length) {
    if (!playPracticeAI(g, now)) return false;
    state.botFeedback = `Easy AI played its reply. ${scoreFeedback(g, before)}`;
    if (state.freeTurns === 3) {
      finishGame(g, now, "tutorial_complete");
      state.phase = "finished";
    } else state.phase = "free";
    return true;
  }
  const beforeIds = new Set(g.cards.map((c) => c.id));
  const draw = botDraw(state.lesson);
  const card = g.cards.find((c) => matchesCard(c, draw));
  if (!card) throw Error("The AI’s tutorial tile is missing");
  let target: Target = { player: 1, row: 0, column: 0 };
  if (state.lesson === 1) {
    target = { player: 0, row: 0, column: 0 };
    g.players[0].matrix.forEach((row, r) =>
      row.forEach((value, column) => {
        if (value > g.players[0].matrix[target.row!][target.column!])
          target = { player: 0, row: r, column };
      }),
    );
    state.negative = target;
  } else if (state.lesson === 7) {
    target = { player: 0, row: state.freshRow!, column: 0 };
    state.rootNegative = target;
  } else if (state.lesson === 9) {
    target = { player: 0, row: state.shieldRow! };
  }
  const effect = useOperation(g, 1, card.id, target, g.seq, now);
  state.botFeedback =
    state.lesson === 9
      ? "Easy AI tried to remove your shielded row. The shield blocked removal and was consumed."
      : state.lesson === 1 || state.lesson === 7
        ? `Easy AI reversed one of your cells’ signs. ${scoreFeedback(g, before)}`
        : `Easy AI added 1 to its own matrix. ${scoreFeedback(g, before)}`;
  if (state.lesson === 9 && effect !== "blocked")
    throw Error("The tutorial shield did not block removal");
  state.lesson++;
  if (state.lesson === 4 || state.lesson === 9) advancePracticeStage(g, now);
  if (state.lesson < tutorialLessons.length) {
    const lesson = tutorialLessons[state.lesson];
    curateDraws(
      g,
      beforeIds,
      lesson.operation
        ? [{ operation: lesson.operation, value: lesson.value }]
        : [],
    );
    state.phase = "instruction";
  } else state.phase = "free";
  return true;
}

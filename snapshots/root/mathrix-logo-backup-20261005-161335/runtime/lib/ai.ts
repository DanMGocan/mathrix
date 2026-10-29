import {
  applyOperation,
  calculateScore,
  isShieldActive,
  legalTargets,
  registry,
  type Game,
  type Player,
  type Target,
} from "./engine";

export const aiTuning = {
  reactionMinMs: 400,
  reactionMaxMs: 900,
  cellValue: 0.5,
};

function protectedScore(p: Player, now: number) {
  return (
    p.rowShields.reduce<number>(
      (sum, shield, row) =>
        sum +
        (isShieldActive(shield, now)
          ? Math.max(0, calculateScore([p.matrix[row]]))
          : 0),
      0,
    ) +
    p.columnShields.reduce<number>(
      (sum, shield, column) =>
        sum +
        (isShieldActive(shield, now)
          ? Math.max(
              0,
              p.matrix.reduce((value, row) => value + row[column], 0),
            )
          : 0),
      0,
    )
  );
}

export function chooseAIMove(g: Game, now: number, random = Math.random) {
  if (
    g.mode !== "ai" ||
    g.status !== "playing" ||
    g.active !== 1 ||
    now >= g.endAt ||
    now >= g.turnEndsAt
  )
    return null;
  const moves: { cardId: string; target: Target; rank: number[] }[] = [];
  // ponytail: one-move evaluation; add lookahead only when a stronger difficulty is wanted.
  for (const card of g.cards) {
    for (const target of legalTargets(g, 1, card, now)) {
      const probe: Game = {
        ...g,
        players: structuredClone(g.players),
        cards: [...g.cards],
        events: [],
        seed: 1,
        rng: 1,
      };
      applyOperation(probe, 1, card, target, now);
      const [human, bot] = probe.players;
      const difference =
        calculateScore(bot.matrix) - calculateScore(human.matrix);
      const definition = registry[card.operation];
      const retainsTurn =
        definition.target === "TURN_CLOCK" &&
        (definition.seconds! > 0 || probe.turnEndsAt <= now);
      moves.push({
        cardId: card.id,
        target,
        // Prefer a winning finish, board value, another turn, protection, then clock position.
        rank: [
          probe.endAt <= now ? Math.sign(difference) : 0,
          difference +
            aiTuning.cellValue *
              (bot.matrix.length * bot.matrix[0].length -
                human.matrix.length * human.matrix[0].length),
          Number(retainsTurn),
          protectedScore(bot, now) - protectedScore(human, now),
          definition.target === "MATCH_CLOCK"
            ? -Math.sign(difference) * definition.seconds!
            : 0,
          random(),
        ],
      });
    }
  }
  // Generated cards are deliberately absent from the evaluation; the bot cannot see future draws.
  moves.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) {
      const difference = b.rank[i] - a.rank[i];
      if (difference) return difference;
    }
    return 0;
  });
  const best = moves[0];
  return best ? { cardId: best.cardId, target: best.target } : null;
}

import {
  applyOperation,
  calculateScore,
  isShieldActive,
  legalTargets,
  registry,
  useOperation,
  type Card,
  type Game,
  type Player,
  type Target,
} from "./engine";

type Move = { card: Card; target: Target };
type RankedMove = Move & { rank: number[] };

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

function cloneGame(g: Game): Game {
  return {
    ...g,
    players: structuredClone(g.players),
    cards: [...g.cards],
    events: [],
    seed: 1,
    rng: 1,
  };
}

function legalMoves(
  g: Game,
  actor: number,
  now: number,
  cards = g.cards,
): Move[] {
  return cards.flatMap((card) =>
    legalTargets(g, actor, card, now).map((target) => ({ card, target })),
  );
}

function boardRank(g: Game, now: number) {
  const [human, bot] = g.players;
  const difference = calculateScore(bot.matrix) - calculateScore(human.matrix);
  return [
    g.endAt <= now ? Math.sign(difference) : 0,
    difference +
      aiTuning.cellValue *
        (bot.matrix.length * bot.matrix[0].length -
          human.matrix.length * human.matrix[0].length),
    protectedScore(bot, now) - protectedScore(human, now),
  ];
}

function compareRank(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    const difference = a[i] - b[i];
    if (difference) return difference;
  }
  return 0;
}

function chooseImpossibleMove(g: Game, moves: RankedMove[], now: number) {
  const fallback = moves[0];
  if (fallback.rank[0] === 1) return fallback;
  const cards = new Set<string>();
  const roots = moves
    .filter(({ card }) => {
      if (cards.has(card.id)) return false;
      cards.add(card.id);
      return true;
    })
    .slice(0, 4);
  for (const move of moves) {
    if (roots.length === 4) break;
    if (!roots.includes(move)) roots.push(move);
  }
  const visibleIds = new Set(g.cards.map((card) => card.id));
  const deadline = performance.now() + 20;
  let best = fallback;
  let bestRank: number[] | null = null;
  // ponytail: one next action, 4 roots × 64 sampled replies and 20 ms extra; widen only if stronger play warrants the CPU.
  for (const root of roots) {
    if (performance.now() >= deadline) return fallback;
    const probe = cloneGame(g);
    useOperation(probe, 1, root.card.id, root.target, probe.seq, now);
    let rank = boardRank(probe, now);
    // A timeout refreshes random slots, so even the surviving visible cards are uncertain.
    if (
      probe.status !== "finished" &&
      !probe.events.some((event) => event.type === "TIMEOUT")
    ) {
      const replies = legalMoves(
        probe,
        probe.active,
        now,
        probe.cards.filter(
          (card) => visibleIds.has(card.id) && card.id !== root.card.id,
        ),
      );
      const sampled =
        replies.length <= 64
          ? replies
          : Array.from(
              { length: 64 },
              (_, i) => replies[Math.floor((i * (replies.length - 1)) / 63)],
            );
      let replyRank: number[] | null = null;
      for (const reply of sampled) {
        if (performance.now() >= deadline) return fallback;
        const leaf = cloneGame(probe);
        applyOperation(leaf, probe.active, reply.card, reply.target, now);
        const value = boardRank(leaf, now);
        if (
          !replyRank ||
          compareRank(value, replyRank) * (probe.active === 1 ? 1 : -1) > 0
        )
          replyRank = value;
      }
      if (replyRank) rank = replyRank;
    }
    if (performance.now() >= deadline) return fallback;
    const comparison = bestRank ? compareRank(rank, bestRank) : 1;
    if (
      comparison > 0 ||
      (comparison === 0 && compareRank(root.rank, best.rank) > 0)
    ) {
      best = root;
      bestRank = rank;
    }
  }
  return best;
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
  const legal = legalMoves(g, 1, now);
  if (!legal.length) return null;
  const difficulty = g.aiDifficulty ?? "average";
  if (difficulty === "easy" || (difficulty === "average" && random() >= 0.6)) {
    const move = legal[Math.floor(random() * legal.length)];
    return { cardId: move.card.id, target: move.target };
  }
  const moves: RankedMove[] = [];
  for (const { card, target } of legal) {
    const probe = cloneGame(g);
    applyOperation(probe, 1, card, target, now);
    const [human, bot] = probe.players;
    const difference =
      calculateScore(bot.matrix) - calculateScore(human.matrix);
    const definition = registry[card.operation];
    const retainsTurn =
      definition.target === "TURN_CLOCK" &&
      (definition.seconds! > 0 || probe.turnEndsAt <= now);
    moves.push({
      card,
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
  // Generated cards are deliberately absent from the evaluation; the bot cannot see future draws.
  moves.sort((a, b) => compareRank(b.rank, a.rank));
  const best =
    difficulty === "impossible"
      ? chooseImpossibleMove(g, moves, now)
      : moves[0];
  return { cardId: best.card.id, target: best.target };
}

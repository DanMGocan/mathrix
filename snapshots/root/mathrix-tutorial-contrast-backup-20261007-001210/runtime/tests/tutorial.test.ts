import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateScore,
  legalTargets,
  tickGame,
  type Card,
  type Game,
} from "../lib/engine";
import {
  continueTutorial,
  createTutorial,
  playTutorialAI,
  tutorialAction,
  tutorialLessons,
  tutorialSkip,
  tutorialTargets,
  type TutorialState,
} from "../lib/tutorial";

const start = () => createTutorial("tutorial", 1, 1000);
function choices(game: Game, state: TutorialState, now: number) {
  return game.cards.flatMap((card) =>
    tutorialTargets(game, state, card, now).map((target) => ({ card, target })),
  );
}
function unchangedCards(game: Game, before: Card[]) {
  for (const card of game.cards) {
    const previous = before.find((c) => c.id === card.id);
    if (previous) assert.deepEqual(card, previous);
  }
}
function checkDrawEvents(game: Game) {
  for (const event of game.events.filter((e) => e.type === "OPERATION")) {
    const card = event.data.card as Card;
    const generated = game.events.find(
      (e) =>
        e.type === "CARD_GENERATED" && (e.data.card as Card).id === card.id,
    );
    assert.deepEqual(generated?.data.card, card);
  }
}

test("every guided target choice reaches all twelve lessons with untouched shared cards preserved", () => {
  const minimumChoices = Array<number>(tutorialLessons.length).fill(Infinity);
  let paths = 0;
  let minimumScore = Infinity;
  let maximumScore = -Infinity;
  function explore(game: Game, state: TutorialState) {
    const now = 1000 + state.lesson * 1200;
    if (state.phase === "free") {
      paths++;
      const humanScore = calculateScore(game.players[0].matrix);
      minimumScore = Math.min(minimumScore, humanScore);
      maximumScore = Math.max(maximumScore, humanScore);
      assert(humanScore > calculateScore(game.players[1].matrix));
      assert.equal(game.practiceStage, "late");
      assert.equal(game.cards.length, 5);
      assert.equal(game.players[0].destroyedTiles, 2);
      assert.equal(game.players[0].maxSquare, 6);
      assert.equal(game.players[0].maxCube, 3);
      assert.equal(game.players[1].matrix.length, 1);
      assert.deepEqual(game.players[0].rowShields, [false, false, false]);
      checkDrawEvents(game);
      return;
    }
    const options = state.lesson === 4 ? [null] : choices(game, state, now);
    assert(options.length > 0, `No choice for lesson ${state.lesson + 1}`);
    minimumChoices[state.lesson] = Math.min(
      minimumChoices[state.lesson],
      options.length,
    );
    for (const choice of options) {
      const next = structuredClone(game);
      const progress = structuredClone(state);
      const before = structuredClone(next.cards);
      if (choice)
        tutorialAction(next, progress, choice.card.id, choice.target, now);
      else tutorialSkip(next, progress, now);
      assert.equal(progress.phase, "feedback");
      assert.equal(next.active, 1);
      assert(progress.feedback.length > 0);
      unchangedCards(next, before);
      assert.equal(playTutorialAI(next, progress, now), false);
      assert.throws(() => tutorialSkip(next, progress, now));
      continueTutorial(next, progress, now);
      const beforeAI = structuredClone(next.cards);
      assert.equal(playTutorialAI(next, progress, now + 600), true);
      unchangedCards(next, beforeAI);
      assert.equal(next.active, 0);
      assert(progress.botFeedback.length > 0);
      if (state.lesson === 8)
        assert([9, 14].includes(next.players[0].matrix[state.freshRow!][0]));
      if (state.lesson === 9)
        assert.match(progress.botFeedback, /blocked removal/);
      explore(next, progress);
    }
  }
  const { game, state } = start();
  explore(game, state);
  assert.equal(paths, 492);
  assert.deepEqual(minimumChoices, [4, 2, 1, 2, 1, 1, 1, 4, 1, 3, 1, 2]);
  assert.deepEqual([minimumScore, maximumScore], [30, 58]);
});

test("tutorial rejects wrong tiles and targets, has no clock pressure, and finishes after the third free AI reply", () => {
  const { game, state } = start();
  const opening = choices(game, state, 1000)[0];
  const untouched = structuredClone({ game, state });
  assert.throws(() =>
    tutorialAction(game, state, "missing", opening.target, 1000),
  );
  assert.throws(() =>
    tutorialAction(
      game,
      state,
      opening.card.id,
      { player: 1, row: 0, column: 0 },
      1000,
    ),
  );
  assert.throws(() =>
    tutorialAction(
      game,
      state,
      game.cards[1].id,
      { player: 1, row: 1, column: 1 },
      1000,
    ),
  );
  assert.throws(() => tutorialSkip(game, state, 1000));
  assert.throws(() => continueTutorial(game, state, 1000));
  assert.deepEqual({ game, state }, untouched);
  assert.deepEqual(tutorialTargets(game, state, game.cards[1], 1000), []);
  assert.equal(game.endAt, 0);
  assert.equal(game.turnEndsAt, 0);

  let now = 1000;
  while (state.phase !== "free") {
    now += 3600000;
    assert.equal(tickGame(game, now), null);
    assert.equal(game.status, "playing");
    if (state.lesson === 4) tutorialSkip(game, state, now);
    else {
      const choice = choices(game, state, now)[0];
      assert(choice);
      tutorialAction(game, state, choice.card.id, choice.target, now);
    }
    assert.equal(state.phase, "feedback");
    continueTutorial(game, state, now);
    playTutorialAI(game, state, now + 600);
  }
  assert.equal(state.lesson, 12);
  assert.equal(state.freeTurns, 0);
  for (let round = 1; round <= 3; round++) {
    if (round === 2) tutorialSkip(game, state, now);
    else {
      const choice = choices(game, state, now)[0];
      assert(choice);
      assert.deepEqual(
        tutorialTargets(game, state, choice.card, now),
        legalTargets(game, 0, choice.card, now),
      );
      tutorialAction(game, state, choice.card.id, choice.target, now);
    }
    assert.equal(state.freeTurns, round);
    assert.equal(game.status, "playing");
    assert.equal(state.phase, "feedback");
    continueTutorial(game, state, now);
    assert.equal(game.status, "playing");
    assert.equal(playTutorialAI(game, state, (now += 600)), true);
    assert.equal(state.phase, round === 3 ? "finished" : "free");
  }
  assert.equal(game.status, "finished");
  assert.equal(game.result?.reason, "tutorial_complete");
  assert.deepEqual(
    game.result?.scores,
    game.players.map((p) => calculateScore(p.matrix)),
  );
  const completed = structuredClone({ game, state });
  assert.equal(playTutorialAI(game, state, now), false);
  assert.throws(() => tutorialSkip(game, state, now));
  assert.deepEqual({ game, state }, completed);
});

test("each launch creates a fresh local teaching match with consistent starting events", () => {
  const first = start();
  const choice = choices(first.game, first.state, 1000)[0];
  tutorialAction(first.game, first.state, choice.card.id, choice.target, 1000);
  const { game, state } = createTutorial("new-tutorial", 99, 2000);
  assert.equal(game.id, "new-tutorial");
  assert.equal(game.mode, "practice");
  assert.equal(game.active, 0);
  assert.equal(game.iValue, 7);
  assert.equal(game.cards.length, 4);
  assert.deepEqual(
    game.players.map((p) => p.matrix),
    [
      [
        [1, 2],
        [3, 4],
      ],
      [
        [1, 2],
        [3, 4],
      ],
    ],
  );
  assert.deepEqual(
    game.players.map((p) => p.id),
    ["tutorial-player", "tutorial-ai"],
  );
  assert.equal(game.players[1].name, "Easy AI");
  assert.equal(state.phase, "instruction");
  assert.equal(state.lesson, 0);
  assert.equal(state.freeTurns, 0);
  assert.equal(game.players[0].destroyedTiles, 0);
  assert.equal(game.players[0].maxSquare, 2);
  assert.equal(game.players[0].maxCube, 1);
  const reserved = game.events.find((event) => event.type === "RESERVED")!;
  assert.deepEqual(reserved.data.cards, game.cards);
  assert.deepEqual(reserved.data.initialMatrices, game.initialMatrices);
  assert.equal(reserved.data.iValue, game.iValue);
  assert.notEqual(game.players[0].matrix, first.game.players[0].matrix);
  for (const card of game.cards) {
    const generated = game.events.find(
      (e) =>
        e.type === "CARD_GENERATED" && (e.data.card as Card).id === card.id,
    );
    assert.deepEqual(generated?.data.card, card);
  }
});

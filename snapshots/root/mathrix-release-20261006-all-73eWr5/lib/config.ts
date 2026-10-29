import { z } from "zod";
export const speeds = [1, 1.5, 2, 3] as const;
export type Speed = (typeof speeds)[number];
export const aiDifficulties = [
  "easy",
  "average",
  "hard",
  "impossible",
] as const;
export type AIDifficulty = (typeof aiDifficulties)[number];
export type QueueCounts = { ranked: number; casual: Record<Speed, number> };
export type PlayOptions = Pick<
  Balance,
  "matchMs" | "turnStartMs" | "turnEndMs"
> & {
  currentRank: number | null;
};
export type MatchMode = "ranked" | "casual" | "custom" | "ai";
export const gameStages = ["early", "mid", "late"] as const;
export type GameStage = (typeof gameStages)[number];
export const speedSchema = z.union(speeds.map((n) => z.literal(n)));
export const matchmakingSchema = z
  .object({ consent: z.boolean().default(false) })
  .strict();
export const queueSchema = matchmakingSchema
  .extend({
    mode: z.enum(["ranked", "casual"]).default("ranked"),
    speed: speedSchema.default(1),
  })
  .refine(({ mode, speed }) => mode !== "ranked" || speed === 1, {
    message: "Ranked uses x1; Casual uses x1, x1.5, x2 or x3",
  });
export const roomCreateSchema = matchmakingSchema.extend({
  speed: speedSchema.default(1),
});
export const aiStartSchema = roomCreateSchema.extend({
  difficulty: z.enum(aiDifficulties).default("average"),
});
export function matchLabel(
  mode: string,
  speed = 1,
  aiDifficulty?: AIDifficulty,
) {
  return mode === "ranked"
    ? "Ranked"
    : mode === "casual"
      ? `Casual · x${speed}`
      : mode === "custom"
        ? `Custom room · x${speed}`
        : mode === "ai"
          ? `Vs AI · x${speed}${aiDifficulty ? ` · ${aiDifficulty[0].toUpperCase()}${aiDifficulty.slice(1)}` : ""}`
          : "Previous match";
}
export const timeTiles = {
  add_match_time_5: { seconds: 5, clock: "match", weight: 3 },
  sub_match_time_5: { seconds: -5, clock: "match", weight: 3 },
  add_match_time_10: { seconds: 10, clock: "match", weight: 2 },
  sub_match_time_10: { seconds: -10, clock: "match", weight: 2 },
  add_match_time_15: { seconds: 15, clock: "match", weight: 1 },
  sub_match_time_15: { seconds: -15, clock: "match", weight: 1 },
  add_turn_time_5: { seconds: 5, clock: "turn", weight: 0.3 },
  sub_turn_time_5: { seconds: -5, clock: "turn", weight: 0.3 },
  add_turn_time_10: { seconds: 10, clock: "turn", weight: 0.2 },
  sub_turn_time_10: { seconds: -10, clock: "turn", weight: 0.2 },
  add_turn_time_15: { seconds: 15, clock: "turn", weight: 0.1 },
  sub_turn_time_15: { seconds: -15, clock: "turn", weight: 0.1 },
} as const;
export const protectTiles = {
  protect_row_bronze: { target: "ROW", tier: "bronze", seconds: 10, weight: 4 },
  protect_column_bronze: {
    target: "COLUMN",
    tier: "bronze",
    seconds: 10,
    weight: 4,
  },
  protect_row_silver: { target: "ROW", tier: "silver", seconds: 20, weight: 2 },
  protect_column_silver: {
    target: "COLUMN",
    tier: "silver",
    seconds: 20,
    weight: 2,
  },
  protect_row_gold: { target: "ROW", tier: "gold", seconds: 30, weight: 1 },
  protect_column_gold: {
    target: "COLUMN",
    tier: "gold",
    seconds: 30,
    weight: 1,
  },
} as const;
const addedTileWeights: Record<string, number> = {
  square_cell: 6,
  cube_cell: 6,
  add_max_square: 6,
  add_max_cube: 6,
  sqrt_cell: 6,
  sqrt_row: 6,
  sqrt_column: 6,
  absolute_cell: 6,
  absolute_row: 6,
  absolute_column: 6,
  absolute_matrix: 6,
  factorial_cell: 6,
  fibonacci_cell: 6,
  next_prime_cell: 6,
  previous_prime_cell: 6,
  reverse_digits_cell: 6,
  determinant_cell: 6,
  unlock_slot: 6,
  ...Object.fromEntries(
    Object.entries(protectTiles).map(([id, t]) => [id, t.weight]),
  ),
  ...Object.fromEntries(
    Object.entries(timeTiles).map(([id, t]) => [id, t.weight]),
  ),
};
export const operationIds = [
  "add_cell",
  "sub_cell",
  "add_row_value",
  "sub_row_value",
  "add_column_value",
  "sub_column_value",
  "add_matrix",
  "sub_matrix",
  "multiply_cell",
  "multiply_row",
  "multiply_column",
  "negate_cell",
  "negate_row",
  "negate_column",
  "square_cell",
  "cube_cell",
  "add_max_square",
  "add_max_cube",
  "sqrt_cell",
  "sqrt_row",
  "sqrt_column",
  "absolute_cell",
  "absolute_row",
  "absolute_column",
  "absolute_matrix",
  "factorial_cell",
  "fibonacci_cell",
  "next_prime_cell",
  "previous_prime_cell",
  "reverse_digits_cell",
  "determinant_cell",
  "add_row",
  "add_column",
  "remove_row",
  "remove_column",
  "row_shield",
  "column_shield",
  "unlock_slot",
  ...(Object.keys(protectTiles) as (keyof typeof protectTiles)[]),
  ...(Object.keys(timeTiles) as (keyof typeof timeTiles)[]),
] as const;
const tileWeightsSchema = z.preprocess(
  (weights) =>
    weights && typeof weights === "object" && !Array.isArray(weights)
      ? {
          ...addedTileWeights,
          ...Object.fromEntries(
            Object.entries(weights).filter(
              ([id]) =>
                ![
                  "swap_rows",
                  "swap_columns",
                  "transpose",
                  "square_row",
                  "square_column",
                  "cube_row",
                  "cube_column",
                ].includes(id),
            ),
          ),
        }
      : weights,
  z.record(z.enum(operationIds), z.number().min(0).max(100)),
);
export const balanceSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            ([key]) =>
              ![
                "skillStartSize",
                "skillMinSize",
                "skillSizeDecay",
                "skillStartMs",
                "skillMinMs",
                "skillTimeDecay",
              ].includes(key),
          ),
        )
      : value,
  z
    .object({
      matchMs: z.number().int().min(10000).max(600000),
      turnStartMs: z.number().int().min(1000).max(15000),
      turnEndMs: z.number().int().min(500).max(15000),
      maxRows: z.number().int().min(2).max(5),
      maxColumns: z.number().int().min(2).max(5),
      maxCellValue: z.number().int().min(100).max(10000),
      numericMin: z.number().int().min(1).max(5),
      numericMax: z.number().int().min(1).max(5),
      eloK: z.number().min(1).max(100),
      startingRating: z.number().int().min(0).max(3000),
      rateGuests: z.boolean(),
      reconnectMs: z.number().int().min(3000).max(60000),
      weights: z.preprocess(
        (weights) =>
          weights &&
          typeof weights === "object" &&
          !Array.isArray(weights) &&
          !gameStages.some((stage) => stage in weights)
            ? Object.fromEntries(gameStages.map((stage) => [stage, weights]))
            : weights,
        z.record(z.enum(gameStages), tileWeightsSchema),
      ),
    })
    .strict()
    .superRefine((c, ctx) => {
      if (c.turnEndMs > c.turnStartMs || c.numericMin > c.numericMax)
        ctx.addIssue({
          code: "custom",
          message: "Curve/range minimums must not exceed maximums",
        });
      for (const stage of gameStages)
        if (
          !operationIds
            .filter(
              (id) =>
                !(id in timeTiles) &&
                !(id in protectTiles) &&
                ![
                  "add_row",
                  "add_column",
                  "remove_row",
                  "remove_column",
                  "row_shield",
                  "column_shield",
                  "unlock_slot",
                  "square_cell",
                  "cube_cell",
                  "add_max_square",
                  "add_max_cube",
                  "factorial_cell",
                  "fibonacci_cell",
                  "next_prime_cell",
                  "previous_prime_cell",
                  "determinant_cell",
                ].includes(id),
            )
            .some((id) => c.weights[stage][id] > 0)
        )
          ctx.addIssue({
            code: "custom",
            path: ["weights", stage],
            message: `Enable at least one unrestricted arithmetic operation in ${stage} game so every position remains playable`,
          });
    }),
);
export type Balance = z.infer<typeof balanceSchema>;
export const defaultBalance: Balance = {
  matchMs: 120000,
  turnStartMs: 6000,
  turnEndMs: 3000,
  maxRows: 5,
  maxColumns: 5,
  maxCellValue: 10000,
  numericMin: 1,
  numericMax: 3,
  eloK: 32,
  startingRating: 1000,
  rateGuests: false,
  reconnectMs: 15000,
  weights: Object.fromEntries(
    gameStages.map((stage) => [
      stage,
      Object.fromEntries(
        operationIds.map((id) => [
          id,
          addedTileWeights[id] ??
            (["add_row", "add_column"].includes(id)
              ? 8
              : id.includes("shield")
                ? 4
                : 6),
        ]),
      ),
    ]),
  ) as Balance["weights"],
};
export const adSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["OFF", "HOUSE_ADS", "EXTERNAL_PROVIDER", "HYBRID"]),
    pregame: z.boolean(),
    guests: z.boolean(),
    registered: z.boolean(),
    admins: z.boolean(),
    everyN: z.number().int().min(1).max(100),
    cooldownMinutes: z.number().min(0).max(1440),
    pregameWaitMs: z.number().int().min(1000).max(30000).default(15000),
    maxWaitMs: z.number().int().min(1000).max(60000),
    houseDurationMs: z.number().int().min(1000).max(30000),
    testMode: z.boolean(),
  })
  .strict();
export type AdConfig = z.infer<typeof adSchema>;
export const defaultAds: AdConfig = {
  enabled: true,
  mode: "HOUSE_ADS",
  pregame: true,
  guests: true,
  registered: true,
  admins: true,
  everyN: 1,
  cooldownMinutes: 0,
  pregameWaitMs: 15000,
  maxWaitMs: 15000,
  houseDurationMs: 4000,
  testMode: true,
};

import { z } from "zod";
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
const addedTileWeights: Record<string, number> = {
  transpose: 6,
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
  "add_row",
  "add_column",
  "remove_row",
  "remove_column",
  "row_shield",
  "column_shield",
  "swap_rows",
  "swap_columns",
  "transpose",
  ...(Object.keys(timeTiles) as (keyof typeof timeTiles)[]),
] as const;
export const balanceSchema = z
  .object({
    matchMs: z.number().int().min(10000).max(600000),
    turnStartMs: z.number().int().min(1000).max(15000),
    turnEndMs: z.number().int().min(500).max(15000),
    maxRows: z.number().int().min(2).max(8),
    maxColumns: z.number().int().min(2).max(8),
    maxCellValue: z.number().int().min(100).max(1000000),
    numericMin: z.number().int().min(1).max(5),
    numericMax: z.number().int().min(1).max(5),
    eloK: z.number().min(1).max(100),
    startingRating: z.number().int().min(0).max(3000),
    rateGuests: z.boolean(),
    reconnectMs: z.number().int().min(3000).max(60000),
    skillStartSize: z.number().min(40).max(100),
    skillMinSize: z.number().min(18).max(40),
    skillSizeDecay: z.number().min(0.01).max(0.5),
    skillStartMs: z.number().int().min(700).max(2000),
    skillMinMs: z.number().int().min(250).max(600),
    skillTimeDecay: z.number().min(0.01).max(0.5),
    weights: z.preprocess(
      (weights) =>
        weights && typeof weights === "object" && !Array.isArray(weights)
          ? { ...addedTileWeights, ...weights }
          : weights,
      z.record(z.enum(operationIds), z.number().min(0).max(100)),
    ),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      c.turnEndMs > c.turnStartMs ||
      c.numericMin > c.numericMax ||
      c.skillMinSize > c.skillStartSize ||
      c.skillMinMs > c.skillStartMs
    )
      ctx.addIssue({
        code: "custom",
        message: "Curve/range minimums must not exceed maximums",
      });
    if (
      !operationIds
        .filter(
          (id) =>
            !(id in timeTiles) &&
            ![
              "add_row",
              "add_column",
              "remove_row",
              "remove_column",
              "row_shield",
              "column_shield",
              "swap_rows",
              "swap_columns",
              "transpose",
            ].includes(id),
        )
        .some((id) => c.weights[id] > 0)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Enable at least one arithmetic operation so every position remains playable",
      });
  });
export type Balance = z.infer<typeof balanceSchema>;
export const defaultBalance: Balance = {
  matchMs: 120000,
  turnStartMs: 6000,
  turnEndMs: 3000,
  maxRows: 8,
  maxColumns: 8,
  maxCellValue: 1000000,
  numericMin: 1,
  numericMax: 3,
  eloK: 32,
  startingRating: 1000,
  rateGuests: false,
  reconnectMs: 15000,
  skillStartSize: 80,
  skillMinSize: 18,
  skillSizeDecay: 0.1,
  skillStartMs: 1100,
  skillMinMs: 250,
  skillTimeDecay: 0.08,
  weights: Object.fromEntries(
    operationIds.map((id) => [
      id,
      addedTileWeights[id] ??
        (["add_row", "add_column"].includes(id)
          ? 8
          : id.includes("shield")
            ? 4
            : 6),
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

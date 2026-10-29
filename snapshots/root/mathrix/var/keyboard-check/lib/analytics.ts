export const analyticsRanges = {
  "1h": { label: "Live · last hour", seconds: 3600, bucket: 60 },
  "24h": { label: "24 hours", seconds: 86400, bucket: 300 },
  "7d": { label: "7 days", seconds: 604800, bucket: 3600 },
  "30d": { label: "30 days", seconds: 2592000, bucket: 14400 },
} as const;
export type AnalyticsRange = keyof typeof analyticsRanges;

// ponytail: fixed buckets give approximate percentiles; use a histogram library if finer precision is needed.
export const latencyBounds = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
export type Aggregate = { count: number; sum: number; max: number; buckets?: number[] };
export type Aggregates = Record<string, Aggregate>;
export type Measurement = { count: number; mean: number | null; max: number | null; p95: number | null };

export function mergeAggregate(a: Aggregate | undefined, b: Aggregate): Aggregate {
  return {
    count: (a?.count ?? 0) + b.count,
    sum: (a?.sum ?? 0) + b.sum,
    max: Math.max(a?.max ?? 0, b.max),
    ...(b.buckets || a?.buckets ? { buckets: Array.from({ length: latencyBounds.length + 1 }, (_, i) => (a?.buckets?.[i] ?? 0) + (b.buckets?.[i] ?? 0)) } : {}),
  };
}
export function measurement(a?: Aggregate): Measurement {
  if (!a?.count) return { count: 0, mean: null, max: null, p95: null };
  let p95: number | null = null;
  if (a.buckets) {
    let n = 0;
    const i = a.buckets.findIndex((count) => (n += count) >= Math.ceil(a.count * 0.95));
    if (i >= 0) p95 = Math.min(latencyBounds[i] ?? a.max, a.max);
  }
  return { count: a.count, mean: a.sum / a.count, max: a.max, p95 };
}
export const measurements = (data: Aggregates) => Object.fromEntries(Object.entries(data).map(([key, a]) => [key, measurement(a)]));
export type Probe = { status: "pending" | "ok" | "error" | "timeout"; at: number | null; ms: number | null };
export type Gameplay = {
  matches: number; players: number; anonymousSeats: number; averageMs: number | null;
  normal: number; draws: number; disconnected: number; interrupted: number; other: number;
  breakdown: { mode: string; speed: number; matches: number }[];
  series: { at: number; matches: number; normal: number; disconnected: number; interrupted: number }[];
};
export type AnalyticsHistory = {
  from: number; to: number; generatedAt: number; bucketMs: number; firstSampleAt: number | null;
  summary: Record<string, Measurement>;
  series: { at: number; metrics: Record<string, Measurement> }[];
  gameplay: Gameplay;
};
export type AnalyticsResponse = AnalyticsHistory & {
  range: AnalyticsRange;
  live: {
    startedAt: number; sampledAt: number | null; values: Record<string, number>;
    currentMinute: Record<string, Measurement>; probes: Record<"database" | "redis", Probe>;
    lastPersistedAt: number | null; droppedIntervals: number;
  };
};

import { db } from "./db";
import { metrics } from "./metrics";
import {
  analyticsRanges,
  measurements,
  mergeAggregate,
  type Aggregate,
  type Aggregates,
  type AnalyticsRange,
  type AnalyticsHistory,
  type AnalyticsResponse,
  type Gameplay,
} from "../lib/analytics";

const historyCache = new Map<
  AnalyticsRange,
  { expires: number; value: Promise<AnalyticsHistory> }
>();

export async function readHistory(
  range: AnalyticsRange,
  now = Date.now(),
): Promise<AnalyticsHistory> {
  const { seconds, bucket } = analyticsRanges[range];
  const from = now - seconds * 1000;
  const bounds = [new Date(from), new Date(now), bucket];
  const [performanceRows, gameRows, playerRows, breakdownRows, seriesRows] =
    await Promise.all([
      db.query(
        `WITH entries AS (
      SELECT floor(extract(epoch FROM bucket_start)/$3)*$3*1000 AS at, e.key, e.value
      FROM performance_minutes, LATERAL jsonb_each(metrics) e
      WHERE bucket_start >= $1 AND bucket_start < $2
    ), totals AS (
      SELECT at,key,sum((value->>'count')::float8) AS count,sum((value->>'sum')::float8) AS sum,max((value->>'max')::float8) AS max
      FROM entries GROUP BY at,key
    ), bins AS (
      SELECT at,key,b.ordinality,sum(b.value::text::bigint) AS n
      FROM entries CROSS JOIN LATERAL jsonb_array_elements(value->'buckets') WITH ORDINALITY b
      GROUP BY at,key,b.ordinality
    ), histograms AS (
      SELECT at,key,jsonb_agg(n ORDER BY ordinality) AS buckets FROM bins GROUP BY at,key
    ) SELECT t.*,h.buckets FROM totals t LEFT JOIN histograms h USING(at,key) ORDER BY at,key`,
        bounds,
      ),
      db.query(
        `SELECT count(*)::int AS matches,avg(duration_ms)::float8 AS "averageMs",
      count(*) FILTER(WHERE reason='clock')::int AS normal,
      count(*) FILTER(WHERE reason='clock' AND winner IS NULL)::int AS draws,
      count(*) FILTER(WHERE reason='disconnect')::int AS disconnected,
      count(*) FILTER(WHERE reason IN ('server_shutdown','server_restart'))::int AS interrupted,
      count(*) FILTER(WHERE reason NOT IN ('clock','disconnect','server_shutdown','server_restart'))::int AS other
      FROM matches WHERE ended_at >= $1 AND ended_at < $2 AND mode <> 'practice' AND events @> '[{"type":"START"}]'`,
        bounds.slice(0, 2),
      ),
      db.query(
        `SELECT count(DISTINCT p.user_id)::int AS players,count(*) FILTER(WHERE p.user_id IS NULL)::int AS "anonymousSeats"
      FROM match_participants p JOIN matches m ON m.id=p.match_id
      WHERE m.ended_at >= $1 AND m.ended_at < $2 AND m.mode <> 'practice' AND m.events @> '[{"type":"START"}]'`,
        bounds.slice(0, 2),
      ),
      db.query(
        `SELECT mode,speed,count(*)::int AS matches FROM matches
      WHERE ended_at >= $1 AND ended_at < $2 AND mode <> 'practice' AND events @> '[{"type":"START"}]'
      GROUP BY mode,speed ORDER BY mode,speed`,
        bounds.slice(0, 2),
      ),
      db.query(
        `SELECT floor(extract(epoch FROM ended_at)/$3)*$3*1000 AS at,count(*)::int AS matches,
      count(*) FILTER(WHERE reason='clock')::int AS normal,
      count(*) FILTER(WHERE reason='disconnect')::int AS disconnected,
      count(*) FILTER(WHERE reason IN ('server_shutdown','server_restart'))::int AS interrupted
      FROM matches WHERE ended_at >= $1 AND ended_at < $2 AND mode <> 'practice' AND events @> '[{"type":"START"}]'
      GROUP BY at ORDER BY at`,
        bounds,
      ),
    ]);
  const total: Aggregates = {},
    points = new Map<number, Aggregates>();
  for (const row of performanceRows.rows) {
    const at = Number(row.at);
    const data = points.get(at) ?? {};
    const a: Aggregate = {
      count: Number(row.count),
      sum: Number(row.sum),
      max: Number(row.max),
      ...(row.buckets ? { buckets: row.buckets.map(Number) } : {}),
    };
    data[row.key] = a;
    points.set(at, data);
    total[row.key] = mergeAggregate(total[row.key], a);
  }
  const gameplay: Gameplay = {
    ...gameRows.rows[0],
    ...playerRows.rows[0],
    breakdown: breakdownRows.rows,
    series: seriesRows.rows.map((row) => ({ ...row, at: Number(row.at) })),
  };
  return {
    from,
    to: now,
    generatedAt: now,
    bucketMs: bucket * 1000,
    firstSampleAt: points.size ? Math.min(...points.keys()) : null,
    summary: measurements(total),
    series: [...points].map(([at, data]) => ({
      at,
      metrics: measurements(data),
    })),
    gameplay,
  };
}

export async function analytics(
  range: AnalyticsRange,
): Promise<AnalyticsResponse> {
  let entry = historyCache.get(range);
  if (!entry || entry.expires <= Date.now()) {
    const value = readHistory(range);
    entry = { expires: Infinity, value };
    historyCache.set(range, entry);
    const pending = entry;
    void value.then(
      () => {
        pending.expires = Date.now() + 60000;
      },
      () => {},
    );
    void value.catch(() => {
      if (historyCache.get(range)?.value === value) historyCache.delete(range);
    });
  }
  return { ...(await entry.value), range, live: metrics.live() };
}

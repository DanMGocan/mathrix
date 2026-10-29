"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  analyticsRanges,
  type AnalyticsRange,
  type AnalyticsResponse,
  type Measurement,
} from "@/lib/analytics";

const number = (value: number | null | undefined, unit = "") =>
  value == null
    ? "-"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
const time = (at: number) => new Date(at).toLocaleString();
const counter = (m: Record<string, Measurement>, key: string) =>
  m[key]?.count ?? 0;
const labels: Record<string, string> = {
  http_ms: "HTTP requests",
  database_ms: "Database probe",
  redis_ms: "Redis probe",
  queue_wait_ms: "Successful queue wait",
  http_2xx: "HTTP 2xx",
  http_3xx: "HTTP 3xx",
  http_4xx: "HTTP 4xx",
  http_5xx: "HTTP 5xx",
  http_aborted: "Aborted HTTP requests",
  http_exceptions: "HTTP handler exceptions",
  command_rejections: "Rejected commands",
  queue_entered: "Players entering queue",
  queue_matched: "Players paired",
  queue_cancelled: "Queue cancellations",
  queue_disconnected: "Queue disconnects",
  match_disconnects: "Match disconnects",
  match_reconnects: "Match reconnects",
  save_failures: "Failed result-save attempts",
};
function label(key: string) {
  return (
    labels[key] ??
    key
      .replace(/^command_/, "Command · ")
      .replace(/_ms$/, "")
      .replace(/_ok$/, " · accepted")
      .replace(/_rejected$/, " · rejected")
      .replaceAll("_", " ")
  );
}

function Chart({
  title,
  unit,
  points,
  from,
  to,
  bucketMs,
}: {
  title: string;
  unit: string;
  points: { at: number; value: number | null }[];
  from: number;
  to: number;
  bucketMs: number;
}) {
  const id = useId();
  const valid = points.filter((p) => p.value !== null);
  const max = Math.max(1, ...valid.map((p) => p.value!));
  const x = (at: number) => 40 + ((at - from) / Math.max(1, to - from)) * 510;
  const y = (v: number) => 145 - (v / max) * 125;
  const segments: string[][] = [];
  let previous = -Infinity;
  for (const p of valid) {
    if (p.at - previous > bucketMs * 1.1) segments.push([]);
    segments.at(-1)!.push(`${x(p.at)},${y(p.value!)}`);
    previous = p.at;
  }
  return (
    <article className="panel analytics-chart">
      <h3>{title}</h3>
      {valid.length ? (
        <>
          <svg viewBox="0 0 570 185" role="img" aria-labelledby={id}>
            <title id={id}>
              {title}. {valid.length} recorded points; maximum{" "}
              {number(Math.max(...valid.map((p) => p.value!)), unit)}. Exact
              values are in the data table below.
            </title>
            <line x1="40" y1="145" x2="550" y2="145" className="chart-axis" />
            <line x1="40" y1="20" x2="550" y2="20" className="chart-axis" />
            <text x="2" y="24">
              {number(max)}
            </text>
            <text x="14" y="148">
              0
            </text>
            {segments.map((segment, i) => (
              <polyline
                key={i}
                points={segment.join(" ")}
                className="chart-line"
              />
            ))}
            {valid.map((p) => (
              <circle
                key={p.at}
                cx={x(p.at)}
                cy={y(p.value!)}
                r="2"
                className="chart-dot"
              >
                <title>
                  {time(p.at)}: {number(p.value, unit)}
                </title>
              </circle>
            ))}
            <text x="40" y="175">
              {new Date(from).toLocaleDateString()}{" "}
              {new Date(from).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
            <text x="550" y="175" textAnchor="end">
              {new Date(to).toLocaleDateString()}{" "}
              {new Date(to).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          </svg>
          <details>
            <summary>View {title.toLowerCase()} data</summary>
            <div className="analytics-table">
              <table>
                <caption>
                  {title} ({unit || "count"})
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {valid.map((p) => (
                    <tr key={p.at}>
                      <td>{time(p.at)}</td>
                      <td>{number(p.value, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p>No measurements in this period yet.</p>
      )}
    </article>
  );
}

function Timings({
  values,
  title,
}: {
  values: Record<string, Measurement>;
  title: string;
}) {
  const rows = Object.entries(values).filter(
    ([key]) =>
      key.endsWith("_ms") && key !== "observed_ms" && !key.startsWith("loop_"),
  );
  return (
    <div className="analytics-table">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Measurement</th>
            <th scope="col">Samples</th>
            <th scope="col">Average</th>
            <th scope="col">Approx. p95</th>
            <th scope="col">Maximum</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map(([key, m]) => (
              <tr key={key}>
                <th scope="row">{label(key)}</th>
                <td>{number(m.count)}</td>
                <td>{number(m.mean, " ms")}</td>
                <td>{number(m.p95, " ms")}</td>
                <td>{number(m.max, " ms")}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>No timing samples yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<AnalyticsRange>("1h");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true,
      pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true;
      setLoading(true);
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 15000);
      try {
        const response = await fetch(`/api/admin/analytics?range=${range}`, {
          credentials: "include",
          cache: "no-store",
          signal: request.signal,
        });
        const value = await response.json();
        if (!response.ok)
          throw Error(value.error || "Could not load analytics");
        if (alive) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : "Analytics request timed out. Retrying automatically.",
          );
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abort);
        pending = false;
        if (alive) setLoading(false);
      }
    };
    refresh.current = () => {
      void load();
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [range]);
  const live = data?.live;
  const values = live?.values ?? {};
  const summary = data?.summary ?? {};
  const game = data?.gameplay;
  const chart = (
    title: string,
    key: string,
    unit: string,
    field: "mean" | "max" | "p95" = "mean",
  ) =>
    data && (
      <Chart
        key={key}
        title={title}
        unit={unit}
        from={Math.floor(data.from / data.bucketMs) * data.bucketMs}
        to={data.to}
        bucketMs={data.bucketMs}
        points={data.series.map((p) => ({
          at: p.at,
          value: p.metrics[key]?.[field] ?? null,
        }))}
      />
    );
  return (
    <div className="analytics">
      <div className="analytics-controls">
        <label>
          Analytics period
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as AnalyticsRange);
              setData(null);
              setError("");
            }}
          >
            {Object.entries(analyticsRanges).map(([key, r]) => (
              <option key={key} value={key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => refresh.current()} disabled={loading}>
          Refresh analytics
        </button>
        <span role="status">
          {loading
            ? "Loading analytics…"
            : live?.sampledAt
              ? `Live values sampled ${time(live.sampledAt)}`
              : "Waiting for the first sample…"}
        </span>
      </div>
      {error && (
        <p role="alert">
          {error}
          {data &&
            " Showing the last successful response; values may be stale."}
        </p>
      )}
      {data && (
        <>
          <h2>Server performance</h2>
          <p>
            Game-server process only. CPU: 100% is one core. Live values refresh
            every 10 seconds; history and gameplay totals refresh every minute.
            Times use your browser’s time zone.
          </p>
          <div className="stat-grid">
            {[
              ["CPU", number(values.cpu_percent, "%")],
              ["Process memory", number(values.rss_mb, " MiB")],
              ["JavaScript heap", number(values.heap_mb, " MiB")],
              ["Event-loop delay · mean", number(values.loop_mean_ms, " ms")],
              ["Connected players", number(values.connections)],
              ["Active matches", number(values.active_matches)],
              ["Queued players", number(values.queued_players)],
              ["Pending result saves", number(values.pending_saves)],
            ].map(([name, value]) => (
              <article key={name}>
                <small>{name}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p>
            Process started {time(live!.startedAt)} · Uptime{" "}
            {number(
              ((live!.sampledAt ?? data.generatedAt) - live!.startedAt) / 60000,
              " minutes",
            )}{" "}
            · Database pool: {number(values.pool_total)} total /{" "}
            {number(values.pool_idle)} idle / {number(values.pool_waiting)}{" "}
            waiting.
          </p>
          <div className="service-health">
            {Object.entries(live!.probes).map(([name, probe]) => (
              <span key={name}>
                {name} probe: <b>{probe.status}</b> {number(probe.ms, " ms")}
              </span>
            ))}
          </div>
          <p>
            Probes measure SELECT 1 (including pool wait) and Redis PING.
            Event-loop delay uses a 20 ms sampling timer.
          </p>
          <details>
            <summary>Current minute’s response timings</summary>
            <Timings
              values={live!.currentMinute}
              title="Current minute · server processing and queue wait"
            />
          </details>
          <h3>Performance history</h3>
          <p>
            History calculated {time(data.generatedAt)}.{" "}
            {data.firstSampleAt
              ? `First recorded bucket in this range: ${time(data.firstSampleAt)}.`
              : "Performance history starts with collection; the first completed minute will appear shortly."}{" "}
            Missing intervals remain gaps.
          </p>
          <p>
            Last telemetry save:{" "}
            {live!.lastPersistedAt
              ? time(live!.lastPersistedAt)
              : "none this process"}{" "}
            · Dropped intervals this process: {live!.droppedIntervals}.
          </p>
          <div className="analytics-charts">
            {chart("CPU usage", "cpu_percent", "%")}
            {chart("Process memory", "rss_mb", " MiB")}
            {chart("Event-loop delay · maximum", "loop_max_ms", " ms", "max")}
            {chart(
              "Accepted move latency · approximate p95",
              "command_use_ok_ms",
              " ms",
              "p95",
            )}
            {chart("Active matches", "active_matches", "")}
            {chart("Queued players", "queued_players", "")}
          </div>
          <Timings
            values={summary}
            title="Selected period · latency and matchmaking"
          />
          <p>
            Processing times include server session/rate-limit checks and
            command handling, excluding player network and rendering time.
            Approximate p95 is the upper bucket bound covering 95% of samples.
            Queue wait ends when paired, before ads/countdown; private rooms are
            excluded.
          </p>
          <h3>Reliability and matchmaking · selected period</h3>
          <div className="analytics-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(labels)
                  .filter((key) => !key.endsWith("_ms"))
                  .map((key) => (
                    <tr key={key}>
                      <th scope="row">{labels[key]}</th>
                      <td>
                        {data.firstSampleAt === null
                          ? "-"
                          : number(counter(summary, key))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p>
            Rejected commands and HTTP 4xx responses can be invalid input,
            expired sessions, or rate limits; they are shown separately from
            server failures. Counts cover recorded intervals only. Health checks
            and Analytics polling are excluded.
          </p>
          <h2>Gameplay trends</h2>
          <p>
            Saved matches that started playing, filtered by the selected
            period’s end-time window. Practice is excluded. Unique players
            include saved guest profiles; {number(game!.anonymousSeats)}
            participant records without saved identities cannot be deduplicated.
          </p>
          <div className="stat-grid">
            {[
              ["Completed played matches", number(game!.matches)],
              ["Unique identified players", number(game!.players)],
              [
                "Average match duration",
                number(
                  game!.averageMs === null ? null : game!.averageMs / 1000,
                  " s",
                ),
              ],
              [
                "Draw rate · normal endings",
                game!.normal
                  ? number((game!.draws / game!.normal) * 100, "%")
                  : "-",
              ],
              ["Normal endings", number(game!.normal)],
              ["Disconnect endings", number(game!.disconnected)],
              ["Server interruptions", number(game!.interrupted)],
              ["Other endings", number(game!.other)],
            ].map(([name, value]) => (
              <article key={name}>
                <small>{name}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          {!game!.matches && <p>No played matches ended in this period.</p>}
          <Chart
            title="Completed played matches"
            unit=""
            from={Math.floor(data.from / data.bucketMs) * data.bucketMs}
            to={data.to}
            bucketMs={data.bucketMs}
            points={Array.from(
              {
                length: Math.ceil(
                  (data.to -
                    Math.floor(data.from / data.bucketMs) * data.bucketMs) /
                    data.bucketMs,
                ),
              },
              (_, i) => {
                const at =
                  Math.floor(data.from / data.bucketMs) * data.bucketMs +
                  i * data.bucketMs;
                return {
                  at,
                  value: game!.series.find((p) => p.at === at)?.matches ?? 0,
                };
              },
            )}
          />
          <div className="analytics-table">
            <table>
              <caption>Played matches by mode and speed</caption>
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Speed</th>
                  <th scope="col">Matches</th>
                </tr>
              </thead>
              <tbody>
                {game!.breakdown.map((row) => (
                  <tr key={`${row.mode}-${row.speed}`}>
                    <td>{row.mode}</td>
                    <td>×{row.speed}</td>
                    <td>{number(row.matches)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

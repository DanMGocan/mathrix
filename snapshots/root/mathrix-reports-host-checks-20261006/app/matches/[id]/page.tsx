"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { matchLabel } from "@/lib/config";
type Match = {
  id: string;
  seed: number;
  initial_matrices: number[][][];
  final_matrices: number[][][];
  rated: boolean;
  mode: string;
  speed: number;
  reason: string;
  duration_ms: number;
  ended_at: string;
  participants: {
    display_name: string;
    score: number;
    result: string;
    rating_before: number | null;
    rating_after: number | null;
  }[];
  events: { at: number; type: string; data: Record<string, unknown> }[];
};
export default function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    [m, setM] = useState<Match | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Match>(`/api/matches/${id}`)
      .then(setM)
      .catch((e) => setError(e.message));
  }, [id]);
  if (!m)
    return (
      <section className="page">
        <h1>Match details</h1>
        <p>{error || "Loading…"}</p>
      </section>
    );
  return (
    <section className="page">
      <h1>Inside the match</h1>
      <p>
        {matchLabel(m.mode, m.speed)} / {m.rated ? "RATED" : "UNRATED"} /{" "}
        {m.reason}
      </p>
      <p>
        {new Date(m.ended_at).toLocaleString()} ·{" "}
        {(m.duration_ms / 1000).toFixed(1)}s · seed {m.seed}
      </p>
      <div className="result-scores">
        {m.participants.map((p, i) => (
          <article key={i}>
            <h2>{p.display_name}</h2>
            <strong>{p.score}</strong>
            <p>
              {p.result}
              {m.rated && p.rating_before !== null && p.rating_after !== null
                ? ` · rating ${p.rating_before} → ${p.rating_after}`
                : ""}
            </p>
            <small>INITIAL MATRIX</small>
            <pre>
              {m.initial_matrices[i].map((r) => r.join("  ")).join("\n")}
            </pre>
            <small>FINAL MATRIX</small>
            <div
              className="final-grid"
              style={{
                gridTemplateColumns: `repeat(${m.final_matrices[i][0].length},1fr)`,
              }}
            >
              {m.final_matrices[i].flat().map((n, j) => (
                <span key={j}>{n}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
      <h2>Event history</h2>
      <div className="event-log">
        {m.events.map((e, i) => (
          <details key={i}>
            <summary>
              {new Date(e.at).toLocaleTimeString()} · {e.type}
            </summary>
            <pre>{JSON.stringify(e.data, null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
type Profile = {
  name: string;
  image: string;
  rating: number;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  highest_score: number;
  total_score: number;
  history: {
    id: string;
    opponent: string;
    result: string;
    score: number;
    opponent_score: number;
    ended_at: string;
    rated: boolean;
    rating_before: number;
    rating_after: number;
  }[];
};
export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Profile>("/api/profile")
      .then(setP)
      .catch(() => setError("Sign in to keep a profile and match history."));
  }, []);
  if (!p)
    return (
      <section className="narrow">
        <h1>Your profile</h1>
        <p>{error || "Loading…"}</p>
        <Link className="button" href="/auth">
          Sign in
        </Link>
      </section>
    );
  return (
    <section className="page">
      <div className="eyebrow">PLAYER PROFILE</div>
      <h1>
        {p.image && <img className="avatar" alt="" src={p.image} />} {p.name}
      </h1>
      <div className="stat-grid">
        {[
          ["Rating", p.rating],
          ["Rank", `#${p.rank}`],
          ["Matches", p.played],
          ["Wins", p.wins],
          ["Losses", p.losses],
          ["Draws", p.draws],
          [
            "Win rate",
            `${p.played ? Math.round((p.wins / p.played) * 100) : 0}%`,
          ],
          ["Win streak", p.streak],
          ["Highest score", p.highest_score],
          [
            "Average score",
            p.played ? (Number(p.total_score) / p.played).toFixed(1) : 0,
          ],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <h2>Recent matches</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Opponent</th>
              <th>Result</th>
              <th>Score</th>
              <th>Rating</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {p.history.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/matches/${m.id}`}>{m.opponent}</Link>
                </td>
                <td>{m.result}</td>
                <td>
                  {m.score} : {m.opponent_score}
                </td>
                <td>
                  {m.rated
                    ? `${m.rating_after - m.rating_before >= 0 ? "+" : ""}${m.rating_after - m.rating_before}`
                    : "Unrated"}
                </td>
                <td>{new Date(m.ended_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={async () => {
          await api("/api/auth/sign-out", {});
          router.push("/");
        }}
      >
        Sign out
      </button>
    </section>
  );
}

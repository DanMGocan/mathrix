"use client";
import { useEffect, useState } from "react";
type Row = {
  user_id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  played: number;
  rank: number;
};
export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setRows);
  }, []);
  return (
    <section className="page">
      <div className="eyebrow">THE COMPETITION</div>
      <h1>Leaderboard</h1>
      <p>Registered players. Rated matches. Earn your place.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Rating</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td>#{r.rank}</td>
                <td>{r.name}</td>
                <td className="accent">{r.rating}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.played ? Math.round((100 * r.wins) / r.played) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p>No rankings yet. Your first match starts the story.</p>
      )}
    </section>
  );
}

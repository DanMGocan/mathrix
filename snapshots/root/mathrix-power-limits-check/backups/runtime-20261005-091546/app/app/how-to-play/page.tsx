"use client";
import { useState } from "react";
import Link from "next/link";
export default function HowToPlay() {
  const [cells, setCells] = useState([1, 2, 3, 4]);
  return (
    <section className="page howto">
      <div className="eyebrow">LEARN IN 30 SECONDS</div>
      <h1>Make your sum count.</h1>
      <div className="howto-grid">
        <article>
          <h2>01. Start equal</h2>
          <p>
            Both players get a positive 2×2 matrix that sums to 10. The
            arrangements can differ.
          </p>
          <div className="demo-matrix">
            {cells.map((n, i) => (
              <button
                key={i}
                onClick={() =>
                  setCells((c) => c.map((v, j) => (j === i ? v + 2 : v)))
                }
                aria-label={`Add 2 to demo cell ${i + 1}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p>
            Try it: tap a cell to add 2.{" "}
            <strong>Σ {cells.reduce((a, b) => a + b, 0)}</strong>
          </p>
          <button onClick={() => setCells([1, 2, 3, 4])}>Reset demo</button>
        </article>
        <article>
          <h2>02. Play your card</h2>
          <p>
            Take turns choosing from the same eight cards. Drag one onto a
            target, or click the card and then its target.
          </p>
          <p>
            <b>DEFENSIVE</b> cards affect you. <b>OFFENSIVE</b> cards affect
            your opponent. <b>EITHER</b> cards give you the choice.
          </p>
          <p>
            Use R/C buttons for rows/columns. Swap cards need two selections.
            Shields ◈ block one row/column removal. Transpose exchanges rows and
            columns in either matrix, moving shields with them.
          </p>
        </article>
        <article>
          <h2>03. Build with reflexes</h2>
          <p>
            Add Row / Add Column starts a new line of 1s. Click each numbered
            target before it disappears to add one point.
          </p>
          <p>
            Targets shrink and speed up. You keep every point when you miss,
            then the turn passes. You cannot cash out early.
          </p>
        </article>
        <article>
          <h2>04. Beat the clock</h2>
          <p>
            Matches start with 120 seconds. Turns shrink from 6 to 3 seconds.
            Miss a turn and three random cards are replaced.
          </p>
          <p>
            Time tiles add or deduct 5, 10 or 15 seconds. Match-clock tiles
            change the shared clock and pass the turn. Turn bonuses extend your
            current turn and let you keep playing; turn penalties shorten the
            opponent’s next turn. Exhausting a clock immediately ends that turn
            or match. Larger time changes are rarer, and turn-clock tiles are
            much rarer.
          </p>
          <p>
            The highest signed sum wins. Negative cells subtract from your
            score. Equal sums draw. Ads happen before the clock starts.
          </p>
          <Link className="button primary" href="/play">
            I’m ready ↗
          </Link>
        </article>
      </div>
    </section>
  );
}

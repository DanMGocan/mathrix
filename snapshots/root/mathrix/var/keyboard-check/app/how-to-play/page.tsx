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
            Start with four shared cards. Drag one onto a target, or click the
            card and then its target.
          </p>
          <p>
            Press 1–8 to select a tile. For row/column tiles, press a shown
            digit to target your matrix. Tap Shift to switch matrices; Escape
            cancels. Digits start at 0 for rows, then continue for columns.
          </p>
          <p>
            Unlock slot tiles appear randomly. Select one and click “Unlock
            slot” to add a filled slot for both players, up to eight, then pass
            the turn. At eight slots, remaining unlock tiles are replaced with
            other cards.
          </p>
          <p>
            <b>DEFENSIVE</b> cards affect you. <b>OFFENSIVE</b> cards affect
            your opponent. <b>EITHER</b> cards give you the choice.
          </p>
          <p>
            Use R/C buttons for rows/columns. Swap cards need two selections.
            Shields ◈ block one row/column removal. Bronze, Silver and Gold
            Protect tiles block every removal of your selected row or column for
            10, 20 or 30 seconds. The countdown appears beside its R/C button.
            Transpose exchanges rows and columns in either matrix, moving
            protection with them.
          </p>
        </article>
        <article>
          <h2>03. Build from missed turns</h2>
          <p>
            Matrices grow up to 5×5. Add Row / Add Column fills every new cell
            with the total number of shared tiles you have destroyed by missing
            turns this game, then passes the turn. Your total starts at 0 and is
            not spent.
          </p>
          <p>
            Destroy 2, then 3, then 4 tiles: your total is 9, so every cell in
            your next added row or column is 9.
          </p>
        </article>
        <article>
          <h2>04. Beat the clock</h2>
          <p>
            Games progress through Early, Mid and Late stages, each initially
            one third of the match: 40 seconds at x1, 60 at x1.5, 80 at x2 and
            120 at x3. Each stage can have different chances for newly drawn
            tiles. In Practice, use Next stage to advance at your own pace.
          </p>
          <p>
            Matches start with 120 seconds. Turns shrink from 6 to 3 seconds.
            Miss a turn and half the shared tiles are randomly destroyed and
            replaced, rounded up. These count toward your own growth total,
            including when a time penalty expires your next turn.
          </p>
          <p>
            Time tiles add or deduct 5, 10 or 15 seconds. Match-clock tiles
            change the current stage and pass the turn. Added time extends that
            stage; deductions carry into later stages if needed. Turn bonuses
            extend your current turn and let you keep playing; turn penalties
            shorten the opponent’s next turn. Exhausting a clock immediately
            ends that turn or match. Larger time changes are rarer, and
            turn-clock tiles are much rarer.
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

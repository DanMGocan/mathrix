"use client";
import { useState } from "react";
import Link from "next/link";
import { defaultBalance } from "@/lib/config";
import { MatrixIcon, ShieldIcon } from "../icons";
export default function HowToPlay() {
  const [cells, setCells] = useState([1, 2, 3, 4]);
  return (
    <section className="page howto">
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
                  setCells((c) =>
                    c.map((v, j) =>
                      j === i
                        ? Math.min(v + 2, defaultBalance.maxCellValue)
                        : v,
                    ),
                  )
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
          <h2>02. How to read cards</h2>
          <p>Symbols show where a card acts. Colour shows who it affects.</p>
          <figure className="card-guide">
            <svg
              className="card-guide-diagram"
              viewBox="0 0 420 270"
              role="img"
              aria-labelledby="card-guide-title card-guide-description"
            >
              <title id="card-guide-title">How to read a card’s symbols</title>
              <desc id="card-guide-description">
                An example card with all three scope markers. The horizontal
                arrow above the card means a row. The vertical arrow to its left
                means a column. The four-cell matrix symbol means the whole
                matrix. Callout arrows point to each marker and the card’s red
                and green background.
              </desc>
              <defs>
                <marker
                  id="card-guide-pointer"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M1 1 7 4 1 7" />
                </marker>
              </defs>
              <g className="card-guide-labels">
                <text x="270" y="20" textAnchor="middle">
                  Row
                </text>
                <text x="8" y="30">
                  Matrix
                </text>
                <text x="8" y="134">
                  Column
                </text>
                <text x="8" y="235">
                  Colour
                </text>
              </g>
              <g className="card-guide-details">
                <text x="270" y="40" textAnchor="middle">
                  One horizontal line
                </text>
                <text x="8" y="50">
                  Every cell
                </text>
                <text x="8" y="154">
                  One vertical line
                </text>
                <text x="8" y="255">
                  Who it affects
                </text>
              </g>
              <g className="card-guide-markers" aria-hidden="true">
                <svg
                  x="175"
                  y="60"
                  width="220"
                  height="12"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 5H98M7 1L2 5L7 9M93 1L98 5L93 9"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <svg
                  x="148"
                  y="88"
                  width="12"
                  height="125"
                  viewBox="0 0 10 100"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M5 2V98M1 7L5 2L9 7M1 93L5 98L9 93"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <g transform="translate(146 58)">
                  <MatrixIcon />
                </g>
              </g>
              <foreignObject
                x="174"
                y="84"
                width="224"
                height="132"
                aria-hidden="true"
              >
                <div className="card">
                  <span className="tile-ownership">EITHER MATRIX</span>
                  <strong className="tile-title">+3</strong>
                  <span className="tile-description">Add 3.</span>
                </div>
              </foreignObject>
              <g
                className="card-guide-pointers"
                markerEnd="url(#card-guide-pointer)"
              >
                <path d="M270 45V60" />
                <path d="M110 32H120Q130 32 130 42V70H145" />
                <path d="M115 128H145" />
                <path d="M110 230H132L190 205" />
              </g>
            </svg>
            <figcaption>
              <span className="card-guide-mobile-key">
                <span>
                  <strong>Row:</strong> one horizontal line.
                </span>
                <span>
                  <strong>Column:</strong> one vertical line.
                </span>
                <span>
                  <strong>Matrix:</strong> every cell.
                </span>
              </span>
              All three symbols are shown here as a guide. A card shows the
              symbol for its target; other targets are named in its text.
            </figcaption>
          </figure>
          <dl className="card-colour-key">
            <div>
              <dt>
                <span className="card defense" aria-hidden="true" />
                Green
              </dt>
              <dd>Affects you.</dd>
            </div>
            <div>
              <dt>
                <span className="card offense" aria-hidden="true" />
                Red
              </dt>
              <dd>Affects your opponent.</dd>
            </div>
            <div>
              <dt>
                <span className="card" aria-hidden="true" />
                Both colours
              </dt>
              <dd>
                Choose either matrix, or affect the shared target named on the
                card.
              </dd>
            </div>
          </dl>
        </article>
        <article>
          <h2>03. Play your card</h2>
          <p>
            Start with four shared cards. Click or tap a card, then click or tap
            its target if needed. Unlock slot, maximum boosts and time tiles
            apply immediately when selected, including with a keyboard shortcut.
          </p>
          <p>
            Press 1–8 to select a tile. For row/column tiles, press a shown
            digit to target your matrix. Tap Shift to switch matrices; Escape
            cancels. Digits start at 0 for rows, then continue for columns. For
            whole-matrix and Add Row/Column tiles, press 1 to apply to your
            matrix or 2 to apply to the opponent’s.
          </p>
          <p>
            Press Q to skip your turn. Mobile keyboard hints are hidden by
            default; enable “Show keyboard hints on mobile” in{" "}
            <Link href="/settings">Preferences</Link> to see card keys, target
            keys and shortcut guidance. Shortcuts still work when hints are
            hidden.
          </p>
          <p>
            Unlock slot tiles appear randomly. Select one to immediately add a
            filled slot for both players, up to eight, then pass the turn. At
            eight slots, remaining unlock tiles are replaced with other cards.
          </p>
          <p>
            <b>DEFENSIVE</b> cards affect you. <b>OFFENSIVE</b> cards affect
            your opponent. <b>EITHER</b> cards give you the choice.
          </p>
          <p>
            Each cell is capped at −10,000 to 10,000. Results beyond the limit
            stay at the nearest boundary; doubling 6,000 becomes 10,000.
          </p>
          <p>
            Each match has one shared i value from 1 to 50, shown during play.
            The √ cell, row and column tiles take each cell’s square root. For
            an imaginary result, substitute the match’s value for i, then round
            the final number down: with i = 7, √(−9) = 3i becomes 21 and √(−10)
            becomes 22. All square-root results round down to an integer. The
            usual cell-value limit applies, and your turn ends.
          </p>
          <p>
            Square and Cube work on single cells only. The cell’s absolute value
            must be at most your Maximum Square or Maximum Cube, even when
            targeting the opponent. Maximum Square starts at 2 and Maximum Cube
            at 1. Both rise with your destroyed-tile total and can earn separate
            +1 to +5 bonuses from shared boost tiles. Select a boost to
            immediately raise its named maximum and pass the turn. Maximums have
            no cap, are never spent, and reset each game. Maximum Square 8
            permits −8 through 8; −100 needs a maximum of at least 100. See both
            values beside your matrix and in Menu. Powered results still obey
            the cell-value limit. Absolute value works on those targets and
            whole matrices. Factorial accepts cells from 0–5; Fibonacci accepts
            0–15, with F(0) = 0 and F(1) = 1. Next/Previous Prime replaces a
            cell with the strictly next/previous positive prime, within the
            cell-value limit. Previous Prime cannot target 2 or below. Reverse
            Digits preserves the sign: −120 becomes −21. Determinant replaces a
            cell with its whole matrix’s determinant and works only on square
            matrices. All these tiles allow either matrix.
          </p>
          <p>
            Click (?) for full tile rules. Online clocks keep running while
            help, Menu or player details are open. In Practice, these dialogs
            pause the AI’s next move; protection timers continue.
          </p>
          <p>
            Both compact matrices stay side by side on phones. Tap a player’s
            avatar for their details, and swipe the tray to see more portrait
            cards. Short landscape screens place the tray beside the matrices.
            Desktop profiles sit separately beside the matrices. Menu contains
            player statistics and Practice controls. Recessed empty slots
            require an Unlock slot tile. The footer returns when the game ends.
          </p>
          <p>
            Use R/C buttons for rows/columns. Shields <ShieldIcon /> block one
            row/column removal. Bronze, Silver and Gold Protect tiles protect
            your selected row or column and every cell in it from all opponent
            changes for 10, 20 or 30 seconds. Opponent arithmetic skips those
            cells; removals that touch them are blocked. Your own moves still
            work. Protected cells are outlined, and the countdown appears beside
            the R/C button.
          </p>
        </article>
        <article>
          <h2>04. Build from missed turns</h2>
          <p>
            Matrices grow up to 5×5. Select Add Row / Add Column, then choose
            either matrix to grow it immediately and pass the turn. Each new
            cell uses your destroyed-tile total, capped at the cell-value limit,
            even when growing the opponent’s matrix. Your total starts at 0 and
            is not spent. Each matrix has its own size limit; a growth tile
            stays available if either matrix has room.
          </p>
          <p>
            Destroy 2, then 3, then 4 tiles: your total is 9, so every cell in
            your next added row or column is 9.
          </p>
        </article>
        <article>
          <h2>05. Beat the clock</h2>
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
            including when a time penalty expires your next turn. Click Skip
            turn or press Q on your turn for the same effect immediately, even
            when you have playable tiles. This also works in Practice.
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
          <p>
            Practice mode is also available on the Play page, where you can
            learn against a basic AI without match or turn clocks.
          </p>
          <Link className="button primary" href="/play">
            I’m ready ↗
          </Link>
        </article>
      </div>
    </section>
  );
}

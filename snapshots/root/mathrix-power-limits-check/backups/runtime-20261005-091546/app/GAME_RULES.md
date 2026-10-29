# Mathrix game rules and administration guide

## The objective

Two players manipulate their own and their opponent's matrices. When the match clock expires (initially 120 seconds),
the higher signed sum of all cells wins. Negative cells subtract from the score.
Equal sums draw. Example: [-5, 4; 2, 8] scores 9.

Each player independently starts with four strictly positive integer cells in a
2×2 matrix. Every starting matrix sums to exactly 10. A seeded server-side random
number generator determines both matrices, the first player, cards, timeout
replacements, target positions and skill increments. The seed is hidden during
play and retained with the completed match for investigation/reconstruction.

## Turns and the shared cards

There are always eight shared operation cards. Only the active player may act.
Drag a card onto a legal target, or click the card and then click its target.
Cell cards use the number cells. Row/column cards use R/C buttons. Matrix cards
use the whole-matrix action button. Swap cards require two distinct row/column
selections in the same matrix. Illegal targets reject the action without consuming
anything. Legal targets are outlined; ownership is also written on every card.

An accepted ordinary action consumes its card, generates a replacement immediately
and passes the turn. Turns decrease linearly from 6 seconds at the beginning to
3 seconds at the end. Timeout randomly destroys exactly three shared cards,
replaces them and passes the turn. The match clock never pauses during gameplay.

Card ownership:

- DEFENSIVE / SELF_ONLY: your matrix only.
- OFFENSIVE / OPPONENT_ONLY: your opponent's matrix only.
- EITHER: either matrix, selected by the active player.

## Operation registry

Arithmetic includes +N and −N on cells, rows, columns and whole matrices; doubling
and negation on cells, rows and columns. N defaults to 1–3. Arithmetic cell values
are clamped to ±1,000,000 to keep calculations bounded and safe in the prototype.
Add Row and Add Column are self-only. Remove Row and Remove Column are offensive.
Row Shield and Column Shield are self-only. Row/column swapping is usable on
either matrix. Swapping also moves the corresponding line shield.
Transpose exchanges rows and columns in either matrix without changing its score.
Row shields become column shields and column shields become row shields. A transpose
is legal only when the resulting dimensions fit the configured row/column limits.

Rows and columns cannot be reduced below one. Both dimensions are limited to
eight. Cards with no legal target for either player's turn are excluded from
new-card generation. A card can become temporarily unusable as matrices change;
its disabled UI state shows this. Card weights determine relative probability.
Zero weight disables a card type. At least one arithmetic type must stay enabled.

## Time tiles and rarity

Time tiles add or deduct exactly 5, 10 or 15 seconds. Select one and use its
clock action button, or drag it onto that button. Match-clock tiles change the
shared match deadline and pass the turn. Exhausting the match clock ends the
match immediately using the current scores.

Positive turn-clock tiles extend your current turn and let you keep playing.
Negative turn-clock tiles pass the turn and shorten the opponent's next turn.
Exhausting that turn immediately triggers the normal timeout, replacing three
tiles and passing back. At the default 3–6 second turn length, −10s and −15s
always exhaust the opponent's turn. Time tiles cannot be played during a reflex
stage or after either action deadline has expired. Bonuses can stack, but the
match clock continues to run. Turn acceleration keeps its original 120-second
curve even if the match clock changes.

Each signed time amount has its own editable rarity weight. Match-clock defaults
are 3, 2 and 1 for 5, 10 and 15 seconds, respectively; turn-clock defaults are
0.3, 0.2 and 0.1. Thus larger amounts are rarer and a turn-clock variant is ten
times rarer than its corresponding match-clock variant. Transpose defaults to 6.
Admin → Game balance lists every tile, its effect, target and rarity weight,
including disabled tiles. Lower weights mean rarer tiles, not percentages.
Missing new weights in older saved settings receive these defaults; existing
weights, including explicit zeroes, are retained.

## Single-use shields

A shield protects one selected row or column from removal. An opponent's removal
attempt consumes the shield and the removal card, leaves the line intact and
passes the turn. Shields do not prevent arithmetic changes. A protected line
cannot receive a second shield. A shield symbol ◈ identifies protected lines.

## Add Row / Add Column reflex stage

A new row has one cell per existing column, initially all 1. A new column has
one cell per existing row, initially all 1. If the new line has four cells, the
first target shows 5. Hitting it adds +1 to one server-selected cell in that new
line. The next target shows 6, and so on. Only the new line receives increments.

The stage has no cash-out button. It continues until the player misses a target
or the overall match ends. All accumulated value is retained on a miss. During
this stage the opponent waits and the ordinary turn deadline no longer applies.
The global clock continues. When it expires, the last accepted increment remains
and the match ends immediately.

Target size after h successful hits:
minimumSize + (startingSize − minimumSize) × exp(−sizeDecay × h)
Target lifetime:
minimumLifetime + (startingLifetime − minimumLifetime) × exp(−timeDecay × h)

Defaults: 80px approaching 18px; 1100ms approaching 250ms. Targets use normalized
positions inside a dedicated 480×280 virtual arena, away from its edges. The
arena scales on smaller devices. Every stage has an ID and server-issued deadline.
The server validates the player, stage, click position and timing; it rejects
replays, expired stages, wrong-player clicks and attempts under 65ms after issue.
The client never submits an achieved score. Scripted clients can still automate
legitimate inputs; this prototype is not a complete anti-bot system.

## Matchmaking, advertising and readiness

Quick Play pairs players in queue order. The same identity cannot queue twice.
A second tab takes over the identity's connection and disconnects the old tab.
Guests have temporary random names and may play anyone. Guest games are unrated
by default. Guests have no permanent profile or leaderboard placement.

A match is reserved first. Each player receives its configured pre-game ad.
The server enforces each ad's minimum duration. Both players must become READY,
then a synchronized 3–2–1 countdown starts. The game clock begins after countdown,
never while either player is waiting for advertising. A maximum readiness timeout
prevents a failed provider from blocking the match. No ad click is required.

House campaigns are labeled advertisements. Their safe external links open in a
new tab. Only actual displayed house impressions and user clicks are counted.
OFF disables ads; HOUSE_ADS uses campaigns; EXTERNAL_PROVIDER uses the adapter;
HYBRID tries the adapter with consent and falls back to a house campaign.
The external adapter currently supports an explicit mock in test mode and a
safe unavailable result otherwise. Real advertising and a production consent
platform require a reviewed provider integration before launch.

## Disconnects and rankings

The clock continues while disconnected. A player has 15 seconds to reconnect.
Reconnection sends current authoritative state. If the window expires, the first
expired player forfeits, even if their matrix sum is larger. Disconnects before
gameplay are recorded without updating statistics/rating. Graceful service
shutdowns finish active matches as unrated and persist their logs. Abrupt process
crashes lose in-memory active matches; completed matches use a durable retry spool.

Registered accounts start at Elo 1000. Default K is 32. Expected score is
1 / (1 + 10^((opponentRating − ownRating)/400)); actual score is 1, 0.5 or 0.
Rating changes are rounded and zero-sum for two registered players. Only
registered-vs-registered matches affect Elo by default. The future-facing guest
rating option rates a registered player against the configured starting rating;
it never creates a permanent guest rating.

## Admin dashboard and balance changes

/admin requires an ADMIN account on both page and API. Documentation is available
at /admin/docs. The dashboard contains overview metrics, users, live games,
match history, leaderboard maintenance, game balance and advertising controls.

Users: inspect stats/providers/history, suspend/restore, change roles, reset rating.
Administrators cannot suspend or demote themselves. A suspended account loses its
sessions and live connection. Reset ratings when the player is not in a match.
Global rating reset is rejected while any match is active. Historic changes remain
available; reset does not rewrite history or claim to recalculate old matches.

Balance: all timing values are milliseconds. Configure matrix limits, arithmetic
ranges, cell ceiling, reconnect interval, Elo and skill curves. Operation weights
are relative, not percentages. Server validation rejects malformed ranges, curves
or an all-disabled operation set. Existing matches keep their original rules.

Advertising: enable/disable globally, select mode, pre-game flag, audiences,
frequency (every N matches), cooldown, maximum wait, default house duration and
test mode. Set every N to 1 for every match. Campaigns support safe image/link URLs,
schedules, audiences, weights and individual durations. Campaign previews do not
count as impressions. Revenue is not displayed because no revenue API is connected.

## Adding a card

Add an ID to lib/config.ts, a definition to the registry in lib/engine.ts and its
controlled transition in applyOperation/validateTarget. Set a default weight and
add a unit test. Generic card/target rendering already consumes the registry.
Changing the registry requires a service rebuild; changing a weight is an admin
setting. Ensure accepted operations preserve integer cells and rectangular shape.

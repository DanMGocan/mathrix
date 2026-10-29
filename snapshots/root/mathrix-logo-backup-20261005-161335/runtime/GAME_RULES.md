# Mathrix game rules and administration guide

## The objective

Two players manipulate their own and their opponent's matrices. When the match clock expires (initially 120 seconds),
the higher signed sum of all cells wins. Negative cells subtract from the score.
Equal sums draw. Example: [-5, 4; 2, 8] scores 9.

Each player independently starts with four strictly positive integer cells in a
2×2 matrix. Every starting matrix sums to exactly 10. A seeded server-side random
number generator determines both matrices, the first player, cards, timeout
replacements. The seed is hidden during
play and retained with the completed match for investigation/reconstruction.

Each match also draws one shared integer **i value from 1 to 50 inclusive**,
using the seeded generator after the starting boards and first player are chosen.
It is shown before and during play and on the results screen, stays fixed through
turns and reconnects, and is recorded in the RESERVED event. All modes, including
Practice, use this rule. A new match draws again; the same value may recur.

## Early, Mid and Late game

Timed games progress through Early, Mid and Late stages. Each stage initially
lasts one third of the speed-adjusted match duration: 40 seconds at x1,
60 at x1.5, 80 at x2 and 120 at x3 with the default balance. Stages begin after
the pregame countdown. The current stage is shown beside the match clock.

Each tile has a separate relative rarity weight for each stage, editable in
Admin → Tiles. Stage changes affect new draws, including replacements,
unlocks and timeout draws; tiles already in the shared pool stay in place.
Zero disables a tile in that stage. At least one unrestricted arithmetic tile must remain
enabled in every stage. Initially all three stages copy the existing weights,
including decimals and zeroes; administrators can then tune them independently.

Added match time extends only the current stage and moves later stages forward
without changing their lengths. Deducted time shortens the current stage; any
excess consumes time from subsequent stages. Completed stages never reopen,
and exhausting all remaining time ends the match immediately. Turn-clock tiles
and the existing turn acceleration curve do not change stage boundaries.

## Practice mode

Practice mode is for learning against a very basic AI that picks random legal
moves without planning ahead. Open it from the landing page or Play screen;
no account or opponent is needed. You start first, and there is no match or turn
time limit. Click (?) on any tile to read its effect and how to play it, even
when the tile is unavailable. Opening help pauses the AI's next move.

Practice starts in Early and never advances stages automatically. Next stage
advances to Mid, then Late, without consuming a turn or replacing existing tiles.
It is available during either player's turn and disabled at Late. New tiles use
the selected stage's bundled default weights, with time tiles still excluded.
Practice again resets the stage to Early.

Time-changing tiles are excluded. Timed protection retains its normal durations.
If no tile is playable, Skip turn destroys and replaces half the shared tiles
(rounded up), adds that count to your growth total and passes the turn; the AI
does this automatically.
Finish practice compares the current signed scores whenever you are ready.
Practice again starts a fresh board. Sessions stay in your browser, with no
pregame ads, saved match history, rating changes or statistics. Refreshing or
leaving the page discards the practice session.

## Vs AI

Choose Vs AI from Play after signing in or choosing guest play. Select x1,
x1.5, x2 or x3 (x1 by default) and play against Mathrix AI at standard difficulty.
All normal rules apply, including clocks, time tiles, stage-specific rarity,
growth values, protection and timeouts. The first player is chosen normally.

The bot chooses legal moves using the visible board and shared cards, favoring
score advantage and growth. It considers protection and time tiles and reacts
after a short delay. It does not know future card draws. Normal ads and premium
exemptions apply to the human; the countdown begins once that player is ready.

Results and match details are saved as Vs AI. These games never change ratings,
games played, wins, losses, draws, streaks or score records. Play again retains
the chosen speed and starts a fresh game. Refreshing reconnects to the same game;
the clocks and bot continue, and the normal disconnect-forfeit rule applies.

## Game screen and tile designs

During play, the game fills the viewport and replaces the site navigation with
Menu. Both matrices and the shared tile tray stay visible. Desktop shows your
profile and matrix on the left and your opponent's on the right, above eight
positions in a four-by-two tile tray. Empty positions are placeholders, not
playable cards: use Unlock slot to fill the next one. Phones stack your green
matrix above the red opponent matrix, with a horizontally scrolling tray below.
Short landscape screens put the matrices side by side and scroll the tray.

Scores and destroyed-tile totals stay beside each matrix. The destroyed total
is the number used by Add Row/Column, not a separate discard mechanic. Desktop
profiles also show country, leaderboard rank and multiplayer games played;
Menu contains these details on compact screens. Rank and games are captured
when the match is reserved and do not change during it. Rank uses the
leaderboard's eligible players and shared positions for tied ratings. A human
without saved statistics shows no rank and zero games; AI/Practice show no rank
or games. Finishing a game restores the normal navigation.

Tiles look like printed game cards, with paper grain, an inset frame, rounded
edges and a subtle shadow. They have red backgrounds for opponent-only effects,
green for self-only, and a diagonal split for either. Shared-clock and shared-pool tiles also use
the split and name their shared target. Text labels accompany the colors.
Horizontal arrows span the top edge for row effects; vertical arrows run down
the left edge for columns; the four-cell symbol in the corner marks whole-matrix
effects. Growth tiles mark the line they add. Timed
protection keeps its Bronze/Silver/Gold badge and border on a green tile.

Each card shows a prominent title above its short description, with the shortcut
underneath. Roomy screens use taller cards; compact phone and landscape layouts
place the description beside the title to keep both matrices and readable card text visible. The card's
ownership colors and texture remain visible when hovered, selected or unavailable.
Click (?) for full rules in every mode, even when a tile is unavailable. Help
and Menu suspend gameplay shortcuts and return focus when closed with Close or
Escape. Online clocks and the server AI continue while these dialogs are open.
In Practice, help and Menu pause the AI's next move, but protection timers keep
running. Menu contains the practice introduction, Next stage and Finish practice.
Whole-matrix actions temporarily replace the column-label strip without moving
or covering the number cells. Selecting an offscreen tile with its shortcut
scrolls the tile tray without moving the boards.

## Turns and the shared cards

Games start with four shared operation cards, including in Practice. Only the
active player may act.
Drag a card onto a legal target, or click the card and then click its target.
Cell cards use the number cells. Row/column cards use R/C buttons. Matrix cards
use the whole-matrix action button. Illegal targets reject the action without consuming
anything. Legal targets are outlined; ownership is also written on every card.

Keyboard: press 1–8 to select the tile in that slot. For row/column tiles,
digits then select the shown targets on your matrix. Tap Shift to toggle to
the opponent's matrix and back; press Escape to cancel selection. Target digits
start at 0 for rows, followed by columns within that matrix: at 5×5, rows use
0–4 and columns use 5–9. Only usable targets show shortcuts. Each new tile
selection starts on your matrix. Shortcuts pause during help, text entry,
and the opponent's turn.

Unlock slot is a randomly drawn tile, with no guaranteed opening unlock. Select
it and click its Unlock slot action button, or drag it onto that button. Playing
it adds one filled slot for both players, replaces the used tile and passes the
turn. The shared pool grows permanently for that game, up to eight slots. At eight,
unlock tiles stop appearing and any remaining ones are replaced with other cards.
Unlock slot has an editable default rarity weight of 6; zero disables it.
It affects neither matrix nor score and does not increase either player's destroyed-tile total.

An accepted ordinary action consumes its card, generates a replacement immediately
and passes the turn, preserving the current slot count. Turns decrease linearly
from 6 seconds at the beginning to 3 seconds at the end. Timeout randomly destroys half the shared cards (rounded up),
replaces them and passes the turn. The number destroyed is added to the player
whose turn expired, accumulating for that game. The match clock never pauses during gameplay.

Card ownership:

- DEFENSIVE / SELF_ONLY: your matrix only.
- OFFENSIVE / OPPONENT_ONLY: your opponent's matrix only.
- EITHER: either matrix, selected by the active player.

## Operation registry

Arithmetic includes +N and −N on cells, rows, columns and whole matrices; doubling
and negation on cells, rows and columns. N defaults to 1–3. Arithmetic cell values
are clamped to ±1,000,000 to keep calculations bounded and safe in the prototype.
Add Row and Add Column are self-only. Remove Row and Remove Column are offensive.
Row Shield and Column Shield are self-only. Swap Rows, Swap Columns and Transpose are removed
from the tile pool and Admin → Tiles. Older saved settings discard their weights
while preserving all remaining tile weights, including zeroes, in every stage.

Rows and columns cannot be reduced below one. Both dimensions are limited to
five. Cards with no legal target for either player's turn are excluded from
new-card generation. A card can become temporarily unusable as matrices change;
its disabled UI state shows this. Card weights determine relative probability.
Zero weight disables a card type. At least one unrestricted arithmetic type must
stay enabled per stage. Factorial, Fibonacci, primes and Determinant have
conditional targets and cannot alone satisfy this rule.

### Additional arithmetic tiles

All the following tiles target either matrix, consume the tile, replace it and
pass the turn. Opponent changes skip cells under active timed protection; your
own changes still apply. All results are integers and respect the configured
signed cell-value limit (±1,000,000 by default).

| Tile                    | Targets                   | Result                                                                                                               |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Square                  | Cell, row, column         | Each value squared; −3 becomes 9.                                                                                    |
| Cube                    | Cell, row, column         | Each value cubed; −3 becomes −27.                                                                                    |
| Absolute value (module) | Cell, row, column, matrix | Each value's magnitude; −12 becomes 12.                                                                              |
| Factorial               | Cell                      | Inputs 0–5 only; 0! = 1 and 5! = 120.                                                                                |
| Fibonacci               | Cell                      | Inputs 0–15 only; F(0) = 0, F(1) = 1 and F(15) = 610.                                                                |
| Next Prime              | Cell                      | Smallest positive prime strictly greater than the cell; 7 becomes 11. Negative values, 0 and 1 become 2.             |
| Previous Prime          | Cell                      | Largest positive prime strictly smaller than the cell; 7 becomes 5. Values ≤2 are illegal.                           |
| Reverse Digits          | Cell                      | Reverse digits, preserve sign and drop leading zeroes; −120 becomes −21 and 0 stays 0.                               |
| Determinant             | Cell                      | Determinant of the selected cell's entire matrix, calculated before the change. Square matrices only, including 1×1. |

Factorial and Fibonacci reject out-of-range inputs without consuming the tile.
Prime targets are unavailable when no qualifying prime fits the cell-value
limit; a prime result is never clamped into a non-prime number. Other arithmetic
results use the normal clamp. Determinants are calculated exactly before
clamping, including large products and cancellation. For `[[1, 2], [3, 4]]`,
the determinant is −2; only the selected cell is replaced. Protected cells may
be read as part of that calculation, but a protected opponent destination is
unchanged.

All additional arithmetic tiles have default weight 6 in Early, Mid and Late.
Missing weights in saved settings receive this default; explicit zeroes remain
disabled. Every tile has a title and description visible in the shared tray,
its (?) help and the Admin → Tiles catalog.

## Imaginary results and square roots

Whenever an operation produces an imaginary result in a cell, substitute the
match's i value for i, round the complete numerical result **down** to an integer,
then apply the configured cell-value limit. Substitution happens independently
for each affected cell; real results do not use the i value. Cells store ordinary
integers after substitution, and scores remain signed sums.

The **√ cell**, **√ row** and **√ column** tiles can produce imaginary results.
They target a cell or every cell in a selected line of either matrix, consume
the tile and pass the turn.
For a negative cell v, its new value is `floor(sqrt(abs(v)) × iValue)`;
otherwise it is `floor(sqrt(v))`. With i = 7, √(−9) = 3i becomes 21,
and √(−10) becomes 22. Rounding happens after multiplication, not before it.
Zero stays zero; perfect square roots stay exact. The existing cell-value cap
applies after rounding, even when a substitution would exceed it.

Each tile has default rarity weight 6 in Early, Mid and Late; zero disables it.
Older settings receive the default only when the weight is missing. AI evaluates
the same substituted result as players.

## Time tiles and rarity

Time tiles add or deduct exactly 5, 10 or 15 seconds. Select one and use its
clock action button, or drag it onto that button. Match-clock tiles change the
shared match deadline and pass the turn. Exhausting the match clock ends the
match immediately using the current scores.

Positive turn-clock tiles extend your current turn and let you keep playing.
Negative turn-clock tiles pass the turn and shorten the opponent's next turn.
Exhausting that turn immediately triggers the normal timeout, destroying and
replacing half the shared tiles (rounded up) and passing back. The destroyed
tiles count toward the player whose turn expired. At the default 3–6 second turn length, −10s and −15s
always exhaust the opponent's turn. Only the active player may play time tiles, before either action deadline
has expired. Bonuses can stack, but the
match clock continues to run. Turn acceleration keeps its original 120-second
curve even if the match clock changes.

Each signed time amount has its own editable rarity weight. Match-clock defaults
are 3, 2 and 1 for 5, 10 and 15 seconds, respectively; turn-clock defaults are
0.3, 0.2 and 0.1. Thus larger amounts are rarer and a turn-clock variant is ten
times rarer than its corresponding match-clock variant.
Admin → Tiles lists every tile, its effect, target and rarity weight,
including disabled tiles. Lower weights mean rarer tiles, not percentages.
Missing new weights in older saved settings receive these defaults; existing
weights, including explicit zeroes, are retained.

## Single-use shields

A shield protects one selected row or column from removal. An opponent's removal
attempt consumes the shield and the removal card, leaves the line intact and
passes the turn. Shields do not prevent arithmetic changes. A protected line
cannot receive a second shield. A shield symbol ◈ identifies protected lines.

## Timed Protect tiles

Bronze, Silver and Gold each have a Protect Row and Protect Column tile. They
protect one of your own lines and every cell in it from all opponent changes for
10, 20 and 30 seconds, respectively, starting when played. Opponent arithmetic
(including square roots, addition, subtraction, doubling and negation) skips
protected cells, even when targeting a crossing line or the whole matrix;
unprotected cells in the target still change. For example, protecting row 1 of
`[[1, 2], [3, 4]]` makes an opponent's −2 matrix produce `[[1, 2], [1, 2]]`.

Opponent removal is blocked if any affected cell belongs to an active protected
row or column. Protecting a column therefore blocks removal of every crossing
row, and protecting a row blocks removal of every crossing column. Blocked attacks
consume their card and pass the turn, without consuming or shortening
protection. This also applies to arithmetic whose entire target is protected.

Your own arithmetic and growth still work. Protection includes new
cells added to a protected line; removing an unprotected line shifts the remaining
line indexes normally. Overlapping row and column protection protects their
shared cell until both timers expire. Timers run through turns and disconnects.
At the exact deadline protection ends and the line can receive protection again.
Active shields or timed protection cannot be stacked or refreshed.

Protect tiles show their tier and duration in bronze, silver or gold. Every
protected cell is outlined and labeled for screen readers. Protected R/C buttons
show a countdown that disappears on expiry. Each tile's rarity weight
is editable in Admin → Tiles: Bronze defaults to 4, Silver to 2 and Gold
to 1. Older saved settings gain these defaults while explicit zeroes stay disabled.

## Add Row / Add Column

Add Row and Add Column resolve immediately without a minigame. Each destroyed
shared tile contributes 1 to the player's total.

Each player starts with a destroyed-tile total of 0. Missing a turn destroys and
replaces 50% of the shared tiles, rounded up: pools of 4/5/6/7/8 replace
2/3/3/4/4 tiles. Only the player whose turn expired receives that count, including
when an opponent's time penalty immediately expires their next turn. Practice
skips use the same rule.

Add Row creates one cell per existing column; Add Column creates one cell per
existing row. Every new cell equals the acting player's total destroyed tiles
for the game, then the turn passes immediately. Destroying 2, then 3, then 4
tiles gives a total of 9, so every cell in the next new row or column is 9.
Before any missed turns, new cells are 0.

Adding a line does not spend or reset the total. Later missed turns increase
future additions without changing existing cells. Ordinary played tiles,
unlock replacements and removed matrix cells do not count. Each new game resets
both players' totals. Growth tiles show your current value per cell.

## Matchmaking, advertising and readiness

After choosing Play as guest or signing in, choose Casual mode, Ranked mode,
Vs AI, Create room or Join room. Ranked uses the original timing. Casual offers x1.5,
x2 and x3 and pairs players in queue order only with the same selected speed.
Custom-room hosts choose x1, x1.5, x2 or x3; their opponent inherits that speed.
Only Ranked affects ratings. Casual and custom rooms still count in overall
wins, losses, streaks, scores and match history.

Speed multiplies the initial match duration and starting turn duration, while
turns decrease linearly toward the same ending duration. With default balance:

| Speed | Match starts at | Turns decrease from |
| ----- | --------------- | ------------------- |
| x1    | 120 seconds     | 6 to 3 seconds      |
| x1.5  | 180 seconds     | 9 to 3 seconds      |
| x2    | 240 seconds     | 12 to 3 seconds     |
| x3    | 360 seconds     | 18 to 3 seconds     |

Time tiles retain their printed values; protection timers are unchanged.
The same identity cannot queue twice. A second game connection takes over the
identity's connection and disconnects the old one, including on another device.

Guests have saved profiles and leaderboard placement. Copy the private user code
from Play or Profile and use “Use guest code” on another device to restore it.
Anyone with that code can access the guest. Sign in to use an existing account,
or create an account and optionally import one guest code during signup. Import
is offered once only, including new Google and Discord accounts; it transfers
rank, stats and history, removes the guest, and invalidates its code. Existing
accounts cannot import. Skipping import keeps the guest separate. Finish any game
and cancel searches/rooms before importing. Failed imports leave progress safe
and may be retried as part of that same signup.

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

Guests and registered accounts start at Elo 1000. Default K is 32. Expected score
is 1 / (1 + 10^((opponentRating − ownRating)/400)); actual score is 1, 0.5 or 0.
Rating changes are rounded and zero-sum. Only Ranked games affect Elo, regardless
of whether either player has registered. Casual and custom rooms never do.
Historical matches retain their previously recorded ratings.

## Admin dashboard and balance changes

/admin requires an ADMIN account on both page and API. Documentation is available
at /admin/docs. The dashboard contains overview metrics, users, live games,
match history, leaderboard maintenance, game balance, tiles and advertising controls.

Users: inspect stats/providers/history, suspend/restore, change roles, reset rating.
Administrators cannot suspend or demote themselves. A suspended account loses its
sessions and live connection. Reset ratings when the player is not in a match.
Global rating reset is rejected while any match is active. Historic changes remain
available; reset does not rewrite history or claim to recalculate old matches.

Balance: all timing values are milliseconds. Configure matrix limits, arithmetic
ranges, cell ceiling, reconnect interval and Elo. Existing matches keep their
original rules.

Tiles: every registered tile appears, including disabled tiles, with its title,
ID, description, type, target, ownership and any tier or duration. Titles and
descriptions are read-only. Early, Mid and Late weights are editable independently.
Each base draw chance is the tile's weight divided by that stage's total weight;
weights 3 and 1 with every other tile disabled display 75% and 25%. This is a
configured share, not a historical appearance count or a guarantee: actual draws
exclude tiles without legal targets, including time tiles in Practice. Numeric
variants share one row, with N using the range shown above the table.

Percentages preview unsaved edits immediately. Zero weight displays Disabled · 0%;
positive chances below 0.01% display <0.01%. When all weights in a stage are zero,
chances display —. Server validation rejects malformed ranges or a stage without
an enabled unrestricted arithmetic tile. Save tile weights uses the shared settings save and
also saves any pending balance or advertising edits. Saved changes apply to new
matches; existing matches retain their original rules.

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

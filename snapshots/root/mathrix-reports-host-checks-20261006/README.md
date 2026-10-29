# MATHRIX

A playable 1v1 matrix tactics game: four shared operation cards with unlocks up
to eight, signed scoring, matches starting at 120 seconds, time tiles, arithmetic,
accelerating turns and Add Row/Column values earned from missed or skipped turns.
Live application: https://mathrix.app. Admin: https://mathrix.app/admin.
In-app documentation: https://mathrix.app/admin/docs.

Every match draws one shared i value from 1–50. The √ cell/row/column tiles take
square roots in either matrix; imaginary results substitute this value for i before
rounding down. With i = 7, √(−9) becomes 21 and √(−10) becomes 22. The value stays
fixed through reconnects and is saved in the match events. Cells remain integers
between −10,000 and 10,000, and scoring remains the signed sum. See [the imaginary-result rules](GAME_RULES.md#imaginary-results-and-square-roots).

Square and Cube affect single cells only, whose magnitude is within the acting
player's Maximum Square or Maximum Cube. Maximum Square starts at 2 and Maximum
Cube at 1. Both grow with destroyed tiles, plus independent +1–5 boost tiles;
they are not spent or capped.
The values are shown beside both matrices and in Menu, and reset each game.
Absolute value affects cells, rows, columns and whole
matrices. Cell tiles include Factorial (inputs 0–5), Fibonacci (inputs 0–15),
strict Next/Previous Prime, Reverse Digits (preserving the sign), and Determinant
(from the selected cell's full square matrix). All allow either matrix and
respect timed protection. Swap Rows, Swap Columns and Transpose are removed.
Every tile has a title and description in play, help and Admin → Tiles, with
independent Early/Mid/Late rarity weights. New arithmetic tiles default to 6;
saved weights, including explicit zeroes, are preserved.

Add Row / Add Column can target either matrix: select the tile, then choose your
matrix or your opponent's to apply it immediately, without another confirmation.
Every new cell uses the acting player's cumulative destroyed-tile count for the game, capped at the cell-value
limit. A missed turn, clicking Skip turn or pressing Q destroys and replaces half the shared
tiles, rounded up, credits the active player's growth total and passes the turn.
Skip turn is available on any of your turns in every mode, including Practice.
The total starts at 0 and is not spent: destroying 2 + 3 + 4 tiles makes every
cell in the next added line 9.
This uses your total even when growing the opponent's matrix. Each target must
have room within the row/column limit (5 by default); the tile is disabled only
when neither matrix has room. Growth leaves existing cells unchanged and ignores
shields; new cells crossing a timed protected line inherit its remaining protection.
See [the full growth rules](GAME_RULES.md#add-row--add-column) for time penalties,
practice skips and resets.

The app shares the landing page's white background, dark text and blue accents.
Active games, including Practice, hide the footer, main navigation and development
banner; results restore them. Both compact matrices and the tray share outer
widths and gutters. Desktop profiles sit separately at the matrices' outer sides
with centered names and 64px avatars. Below 1024px, both matrices sit side by
side, retaining names, scores and gameplay statistics, with avatar buttons that
open native player-details dialogs. Skip turn is at least 44px high, above the
tray on desktop and beside You in the mobile matrix header.

Portrait 3:4 cards have matte grain, inset frames, stable per-card gradient
angles and strengths, and an exact centered 50/50 green/red split for either or
shared targets. Recessed locked slots match their dimensions and explain how to
unlock. The desktop tray fits as many columns as its width allows, with a 172px
minimum slot and 24px gaps; additional rows scroll internally. Mobile and desktop
windows at most 800px high use one horizontal scrolling row of 132×176px cards
with 16px gaps. Mobile landscape screens at most 500px high place the matrices
on the left and cards on the right. Matrix cells stay between 24px and 44px.

Tiles retain complete titles, descriptions, ownership labels, scope arrows and
(?) details. Click or tap a tile, then its target if needed; keyboard shortcuts
also work. Unlock slot, Maximum Square/Cube boosts and time changes apply
immediately on selection, with no confirmation button. After selecting a
whole-matrix tile, including Add Row/Column, press 1 for your matrix or 2 for the
opponent's, even if only one target is legal. Press Q to skip with the same rules
as the button. Gameplay shortcuts pause during dialogs, text entry,
disconnection or the opponent's turn, and ignore repeated key events.
Preferences offers Show keyboard hints on mobile, default off and stored locally
as `mathrix_mobile_keyboard_hints=on|off`. It controls card keys, axis and matrix
keys, Q and gameplay guidance together; desktop hints stay visible and keyboard
input still works when hints are hidden.

Tiles cannot be dragged. Menu contains player statistics and Practice controls.
Help, Menu and player details restore focus when closed; online clocks and the
server AI continue, while Practice pauses its AI and keeps protection timers
running. Match snapshots include public rank/games-played values captured at
reservation; no additional profile requests or database migration are needed.

Outside active games, the shared footer shows Privacy Policy, Terms of Service,
email, Reddit, Discord, Report a bug and Send feedback. The bug and chat icons
open a modal with a required title and message. Submissions are saved to the
`bug_reports` and `feedback` tables, with player attribution when available;
guests and visitors can also submit. Failed saves retain the draft for retry,
and successful saves show confirmation.

Practice mode at `/play?mode=practice` runs locally against a very basic AI,
with no match/turn clocks, (?) tile explanations and a manual Finish practice
button. Protection durations still apply; clock-changing tiles are
excluded. Practice needs no account and does not affect history, stats or ratings.

Timed Protect tiles cover the entire selected row or column, including every
cell, against all opponent changes. Opponent arithmetic skips protected cells;
removals that touch them are blocked. Your own moves still work.

Vs AI is available on `/play` for guests and registered players. Mathrix AI plays
the normal timed rules at x1, x1.5, x2 or x3, with one standard difficulty and
normal pregame advertising (including premium exemptions). Matches are saved in
history as Vs AI, but never change ratings, overall statistics or score records.
The server controls the bot, so refreshing reconnects to the same match and
leaving for longer than the normal reconnect window forfeits the game.

Private 1v1 rooms are available on `/play` to registered players and guests.
Create a room and share its six-character code or invitation link; the other
player chooses guest play or signs in, then joins. Codes expire after 15 minutes
and are consumed when the opponent joins. Brief host reconnects preserve the
room; cancellation, a longer disconnect, or a game-server restart closes it.
Custom rooms use normal ads and gameplay, and never change ratings. Hosts choose
x1, x1.5, x2 or x3 speed; joining players inherit it. Casual matchmaking offers
x1, x1.5, x2 and x3 in separate queues. Ranked uses the original x1 timing and is the
only mode that changes ratings, for both guests and registered players.
All multiplayer modes contribute to overall statistics and match history.

Ready to play groups Ranked, Casual mode, Play vs the AI, Private Rooms and
Practice mode with labeled dividers. Casual and AI speed tiles start directly;
private-room forms expand inline. Ranked has a gold finish and shows the current
leaderboard position via `/api/play-options`. Socket.IO `queue_counts` snapshots
keep Ranked and each Casual speed's waiting-player count current. Practice's
untimed learning rules appear above its entry tile.

Guests have durable profiles and a private user code, shown on Play and Profile.
Use that code on the entry/sign-in screen to restore the same profile on another
device. Session cookies expire after seven days; the profile and code do not.
The code is a bearer credential: do not share it. It is signed with AUTH_SECRET,
so changing that secret also invalidates existing guest recovery codes.

New email, Google and Discord accounts may optionally import a guest code during
signup, once only. The import transfers the exact rating, stats and history,
removes the guest and invalidates its code and sessions. Existing accounts cannot
import; skipping signup import leaves profiles separate. A failed import preserves
the guest and may be retried from /auth/complete. The selected guest must be idle
with all completions saved. No account can play while its signup import is pending.

## Architecture

TypeScript throughout. Next.js 16 / React 19 renders the browser application.
A single Node.js / Socket.IO process owns game state and matchmaking. Better Auth
provides email/password (scrypt) and Google/Discord OAuth. PostgreSQL stores users,
provider accounts, sessions, stats, matches/events, ratings, settings and campaigns.
PostgreSQL also stores guest profiles; Redis holds guest sessions, rate limits, advertising cadence and live queue/game
metadata. Caddy terminates TLS and proxies both services. Native systemd services
restart after reboot. No Docker is used, per the deployment requirement.

We use PostgreSQL's mature `pg` driver with parameterized SQL instead of adding an
ORM just for the small application schema. Better Auth uses its built-in Kysely
PostgreSQL adapter. Versioned application SQL is in scripts/schema.sql; authentication
migrations use the library's migration API. pnpm-lock.yaml pins installed versions.

## Repository

- app/: landing, account, play, profile/history, leaderboard, tutorial, settings,
  privacy, admin/dashboard and protected documentation pages; style.css.
- lib/engine.ts: seeded generation, operation registry, validation, transitions,
  turn timers, growth totals, scoring and Elo. lib/config.ts: Zod schemas and defaults.
- lib/room.ts: pre-game readiness and reconnect lifecycle.
- server/: HTTP APIs, Socket.IO, authentication, PostgreSQL/Redis, ad providers,
  transactional completion persistence and retry spool.
- scripts/: database migration/seeding, development, native deployment and backups.
- tests/: unit checks, real HTTP/WebSocket integration and two-context Playwright.
- deploy/: Caddyfile and systemd units. PLAN.md records the implementation sequence.

## Installation and development

Ubuntu 26.04 ARM64, Node >=22, pnpm 10, PostgreSQL 18, Redis 8 and Caddy are used
on this VM. Install native PostgreSQL/Redis with apt; keep them on loopback.
Create a mathrix database/user and configure Redis authentication. See DEPLOYMENT.md.

    pnpm install --frozen-lockfile
    cp .env.example .env
    # Fill AUTH_SECRET (random >=32 characters), DATABASE_URL and REDIS_URL.
    pnpm db:migrate
    pnpm db:seed
    pnpm dev

Open http://localhost:3000. The development game endpoint is localhost:3001.
The dev command runs Next.js and the game server. A browser connects directly to
port 3001 in development; production uses same-origin Caddy WebSockets.

With `PRODUCTION=false` in the project-root `.env`, stop Mathrix and let other
agents finish using its database, then run `pnpm db:reset` to rebuild and seed the
configured application database's public schema. This deletes its existing data,
including accounts and matches. The command refuses other database sessions,
system databases and isolated test databases; Redis and uploaded designs are
untouched. Run `pnpm db:reset --check` to check the reset guards without connecting.

## Environment and authentication

.env is excluded from Git. Production values are in /etc/mathrix.env (root-only).
APP_URL is http://localhost:3000 in development and https://mathrix.app in production.
AUTH_SECRET signs authentication state and must be randomly generated. Database
and Redis connection URLs include independently generated private credentials.
NEXT_PUBLIC_GAME_URL is the direct dev game endpoint, and must be empty in the
production build for same-origin connections. GAME_INTERNAL_URL defaults to
http://127.0.0.1:3001. GAME_HOST is loopback in production. STATE_DIR points to a
writable completion spool, /var/lib/mathrix in production.

Google: create an OAuth Web application, set GOOGLE_CLIENT_ID and
GOOGLE_CLIENT_SECRET. Authorized JavaScript origin: https://mathrix.app.
Redirect URI: https://mathrix.app/api/auth/callback/google.

Discord: create an application in the developer portal, add the redirect URI
https://mathrix.app/api/auth/callback/discord. Set DISCORD_CLIENT_ID and
DISCORD_CLIENT_SECRET. For local testing use the same paths on localhost:3000.
Restart mathrix-game after changing credentials. Buttons are disabled until the
corresponding credentials exist. No invented credentials are present. These OAuth
flows are integrated but cannot be verified end-to-end without real provider apps.

Registered logins persist across reloads and browser restarts for seven days.
Browser requests renew the session at most once per day; signing out ends it.
The navbar, homepage, play screen and profile share the same session state.

New accounts are ordinary users. Role and suspended status cannot be submitted
through signup. Registered stats are created on first profile access or completion.
Admin APIs and the admin page layout enforce role server-side. API mutations and
WebSocket connections require an exact origin; cookies are HTTP-only and secure
under HTTPS. Input uses schemas, auth/queue/socket rate limits and parameterized SQL.
No secrets, session tokens, OAuth tokens or password hashes appear in API responses.

## Prototype accounts

When SEED_TEST_ADMINS=true, `pnpm db:seed` creates these only if absent:

- admin1@mathrix.app: password `amdin`
- admin2@mathrix.app: password `amdin`

Both are administrators; `amdin` is intentional. They are hashed normally using
Better Auth. These are weak, published prototype credentials. Change/remove both
accounts and set SEED_TEST_ADMINS=false before a serious launch. Seeding does not
reset an existing password or re-promote an existing user.

## Game rules and extension

Read GAME_RULES.md or /admin/docs; /how-to-play is an interactive player tutorial.
Game code is independent of React. Browser submissions specify card ID, turn
sequence and target, never a score. The server checks time, ownership, dimensions,
shields and stage sequencing. Full game-only snapshots are sent when state changes
(not on every timer tick); client clocks interpolate using server timestamps.
A maximum of 50 cells across the two 5×5 matrices keeps messages small. Application/profile data is
fetched separately. Delta encoding can be added if measured traffic warrants it.

Add a new card to operationIds and registry, implement its legality and controlled
transition, assign a default weight, and add a unit test. Set balance values in
Admin → Game balance and tile weights in Admin → Tiles. The Tiles catalog shows
every tile's title, ID, description, type, target, ownership and tier/duration,
with editable Early/Mid/Late weights and live base draw percentages. Percentages
are configured weight shares; actual draws exclude tiles without legal targets.
Changes are snapshotted for new matches; live matches retain
their original rules. Match seed, initial/final matrices, generated cards, accepted
operations, timeouts, disconnects, results and ratings are retained.
Completion is transactional and idempotent. Durable disk files retry failed writes.

## Design references

Admin → Design files stores one image or PDF with a required description per
upload. Supported formats: PNG, JPEG, WebP, GIF and PDF, up to 10 MiB each.
Filenames are case-sensitive and unique; rename a file before uploading another
with the same name. Files can be listed and downloaded only by administrators.
Uploading saves a reference; it does not start AI review or change the application.
Tell the coding assistant the filename and your implementation instructions later.

Storage is `STATE_DIR/design-files/<filename>/`, containing the original file
under its original name and `metadata.json` (description, MIME type, size, uploader
and timestamp). Production uses `/var/lib/mathrix/design-files`; development uses
`./var/design-files`. These files are outside Git and deployment syncs. The coding
assistant can read this directory when a design is requested by filename. Hidden
`.upload-*` directories are unfinished uploads, not saved references.

## Advertising and privacy

Initial mode: HOUSE_ADS. Admin → Advertising controls global/pregame switches,
audiences, mode, every-N frequency, cooldown, pregame wait, maximum wait and test mode. Create,
edit, disable, schedule and preview campaigns there. Campaign URLs are restricted
to safe HTTP(S), with no arbitrary-script setting. No click is needed to play.
The house-ad default duration initializes new campaigns; each saved campaign's
own duration takes precedence.
Impressions are recorded after display; clicks are accepted only for the viewer's
impression. Actual counts and CTR are shown; no revenue estimates are invented.

Google H5: set AD_PROVIDER=adsense-h5 and
AD_PROVIDER_CLIENT_ID=ca-pub-6449099608711175, choose EXTERNAL_PROVIDER,
everyN=1, cooldownMinutes=0 and pregameWaitMs=15000. Google test ads use
testMode=true; AD_PROVIDER=mock still provides the local mock for development.
The browser requests a start placement for each match; Google controls fill and
frequency. Blocked/unavailable ads use the same server-enforced minimum wait.
The game starts only after both players finish their wait and any displayed ad.
SDK readiness has a five-second limit; an unfinished placement cancels the
reservation after 120 seconds without changing stats. Refresh/reconnect preserves
the original wait and avoids a second placement for the same reservation.

Keep testMode=true until Google approves H5 access and a Privacy & messaging
consent message is published for mathrix.app. Live placements and preloading
require resolved CMP consent; consent refusals remain playable with the wait.
Google's tag delivers the published message. /settings provides the Google
privacy-settings entrypoint. Reload game pages after switching provider/test mode.
public/ads.txt contains this publisher's authorization. H5 needs no ad-slot ID.
House campaigns use no third-party ad SDK or advertising cookies. The platform
uses Poppins from Google Fonts. The privacy page identifies data and missing
production legal/retention/contact work. Connect an appropriate CMP before enabling
personalized production ads; the prototype does not claim legal compliance.

## Commands and tests

    pnpm format
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:integration           # game service running; loads .env
    pnpm exec playwright install --with-deps chromium
    pnpm test:e2e                   # web + game running on localhost
    NEXT_PUBLIC_GAME_URL= pnpm build
    sudo bash scripts/test-system.sh # isolated production build on this VM
    pnpm db:migrate
    pnpm db:seed

Integration/E2E require seeded admins. E2E temporarily changes match duration to
10 seconds and controls ads through the authenticated admin API, then restores
settings. Run those tests on a staging/dev instance, because they create actual
matches and update test-account stats. Tests use two independent browser contexts
and verify synchronization, final persistence, Elo, house ads, guests, cumulative row/column growth,
responsive rendering and admin authorization. Tests never expose a public test-only
match-finish bypass. NODE_ENV production uses the same rules/validation.

On this VM, `pnpm test:system` (as root) creates/reuses `mathrix_test_3100`, uses a
separate Redis database and loopback ports 3100–3102, migrates/seeds and runs both
integration and E2E suites against the production frontend build. It creates a
private, ignored .env.test-3100, records logs/artifacts in var/test-3100, and stops its services
on exit. Run `NEXT_PUBLIC_GAME_URL= pnpm build` first so browsers use the isolated same-origin game server. Public game state and balance are not touched.
The frontend runs from a private build copy and overlapping runs on the same ports
are refused. For a separate run, select another base port and unused Redis database:

    MATHRIX_TEST_PORT=43120 MATHRIX_TEST_REDIS_DB=4 pnpm test:system

This uses ports 43120–43122 and database mathrix_test_43120. Playwright filters can
be passed through, for example `pnpm test:system --grep 'H5 long'`.

## Deployment and operations

Admin → Analytics shows game-server CPU/memory, event-loop delay, processing
latency, dependency probes, database pool pressure, queue waits, connection
events and saved gameplay trends. Live samples refresh every 10 seconds;
historical aggregates refresh every minute. Processing times exclude player
network and rendering latency. Approximate p95 values use merged fixed buckets.

`performance_minutes` stores one aggregate per UTC minute and process instance,
retained for 30 days and pruned hourly. Apply `pnpm db:migrate` before starting
the updated server. Existing matches supply gameplay history; performance and
queue history start with collection. Failed telemetry writes are dropped,
reported in the dashboard, and shown as gaps; they do not block game actions.
No request payloads, player identifiers or third-party tracking are stored in
performance history. Practice games are excluded from gameplay analytics.

Read DEPLOYMENT.md for native provisioning, systemd, firewall, DNS, TLS, backups,
service commands and rebuilds. Only SSH and HTTP/HTTPS should be reachable. Health:
/api/health reports PostgreSQL/Redis connectivity. Admin → Overview reports active
matches, queue counts and database/game/Redis health. Logs use JSON event names
and match/player identifiers. Caddy access logs rotate at 10 MiB.

## Known prototype limitations

- One game process; no multi-server ownership or crash-resume for active matches.
  Brief client reconnects work; graceful shutdowns persist unrated completions.
- No email delivery, email verification, password-reset UI, or provider credentials.
  OAuth is implemented and awaiting actual credentials and provider-side validation.
- H5 approval and publishing Google's consent message are required before live ads.
  Legal identity/contact, deletion workflow and retention policy remain launch work.
- Leaderboard maintenance supports rating resets, not historical Elo recalculation.
- House images are remote public URLs; arbitrary URL schemes and private IP URLs are
  rejected, but a strict domain allowlist is advisable before accepting untrusted admins.
- Sound is off until explicitly enabled.

## Play mode migration

Games now have Early, Mid and Late stages, each initially one third of the
speed-adjusted match duration. Match-clock tiles adjust the current stage;
deductions carry into later stages if needed. Practice advances manually with
Next stage. Admin rarity settings now use `weights.early`, `weights.mid` and
`weights.late`; older flat weights are copied into all three on read, preserving
existing values and zeroes without a database migration. Each stage must keep
at least one unrestricted arithmetic tile enabled. New games snapshot these settings;
Practice continues to use the bundled defaults.

Run `pnpm db:migrate` before starting this version. It adds guest identity/import
fields and match mode/speed metadata, and caps saved row/column limits at 5.
Legacy matches retain their recorded dimensions and ratings;
legacy completion spools retain the old guest rules. Drain live games and completion
retries before replacing the server. Old 24-hour guest cookies are replaced with
new durable profiles; those temporary guests never had saved personal stats.

Speed multiplies the configured match and opening-turn durations, retaining the
configured ending-turn duration and existing linear curve. Defaults are x1:
120s / 6→3s, x1.5: 180s / 9→3s, x2: 240s / 12→3s, x3: 360s / 18→3s.
Time tiles still change clocks by their printed number of seconds. Protection,
countdown, reconnect and advertisement timing are unchanged.

## Profiles and Premium

Registered players can edit their unique username, optional public city/country,
and choose one of 24 locally served Bottts avatars. Usernames are 3–24 ASCII
letters, digits, underscores or hyphens, unique without regard to case. The
`handle` field on email signup selects the username; older API clients that only
send `name`, OAuth users, and existing accounts receive a generated valid handle.
Authentication names remain separate from public handles. Guest identities use a
mathematician name and four digits, and remain recoverable with their guest code.

Run `pnpm db:migrate` before starting the updated game service, then
`pnpm db:seed` for development fixtures. These changes preserve account IDs,
statistics and recorded match names. Profile edits apply to the next reserved
match. Premium changes never affect gameplay rules, ratings or matchmaking order.

### Stripe setup

Fill the three placeholders in `.env` (never commit secret values):

- `STRIPE_SECRET_KEY`: the Stripe secret key for your sandbox or live account.
- `STRIPE_WEBHOOK_SECRET`: the signing secret for this endpoint, not the API key.
- `STRIPE_PREMIUM_PRICE_ID`: an active recurring monthly Price, **EUR 4.99**
  (`unit_amount=499`, interval `month`, interval count `1`), with **inclusive**
  tax behavior. Create a product named **Mathrix Premium**. No trial, extra fees,
  promotion codes or adjustable quantities are used; EUR pricing is fixed.

Use sandbox credentials first. Enable the default Stripe Customer Portal with
payment-method updates, invoices and cancellation **at the end of the billing
period**. Disable plan changes and quantity changes. Use the corresponding live
Price and portal configuration only when ready to launch. Tax registrations and
any account-level tax configuration are managed in Stripe; the application does
not enable Stripe Tax automatically or add tax on top of the €4.99 price.

Register `${APP_URL}/api/billing/webhook` for these events:

- `checkout.session.completed`
- `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`

The integration pins Stripe API version `2026-09-30.endive`; select that
version when registering the webhook endpoint. For local sandbox testing, run
`stripe listen --forward-to http://127.0.0.1:3001/api/billing/webhook` and copy its
`whsec_...` value into `.env`, then restart the game service. Hosted Checkout and
the Customer Portal need no browser publishable key. Return URLs use `APP_URL`.

The profile Upgrade button creates hosted Checkout; Manage subscription opens
the portal. Only a signature-verified webhook confirming a paid invoice grants
Premium. Returning from Checkout shows a pending state until that happens.
Renewal failures do not extend the paid-through date. Current Stripe subscription
state is fetched while holding the account's billing-row lock, so duplicate and
out-of-order events cannot roll back newer status. Processing failures return
HTTP 500 for Stripe retries and log `billing_webhook_failed` with an event ID,
without exposing payment details or secrets. Missing keys disable purchasing;
existing paid access continues to be read from the database.

Premium players receive gold avatar frames/names and no pregame ads. If both
players are Premium there is no ad wait. In mixed matches the free player follows
normal ad rules while the Premium player sees rotating math facts; both start
together. Avatars, country flags and facts require no external API keys.

### Verification

`pnpm test` includes local signed-webhook fixtures, checkout reuse, payment
failure/cancellation, profile validation and cosmetic-only gameplay checks.
`NEXT_PUBLIC_GAME_URL= pnpm build` followed by `pnpm test:system` runs API and
browser tests against isolated PostgreSQL/Redis state. The runner blanks Stripe
credentials and loads its isolated environment into Playwright; it cannot make
real Stripe purchases. Billing browser fixtures only run against a database
whose name includes `_test_`. Browser checks cover profile persistence, public
location, all three tier pairings, synchronized countdowns and no Premium ad
requests/impressions.

With sandbox credentials configured, also complete a hosted checkout, verify the
webhook activates Premium, cancel through the portal, and exercise successful and
failed renewals with a Stripe test clock. Verify the paid-through date advances
only after payment. Real checkout/portal verification requires those credentials.

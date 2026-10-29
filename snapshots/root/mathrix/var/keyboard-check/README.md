# MATHRIX

A playable 1v1 matrix tactics game: four shared operation cards with unlocks up
to eight, signed scoring, matches starting at 120 seconds, time tiles, Transpose,
accelerating turns and Add Row/Column values earned from missed turns.
Live application: https://mathrix.app. Admin: https://mathrix.app/admin.
In-app documentation: https://mathrix.app/admin/docs.

Practice mode at `/play?mode=practice` runs locally against a very basic AI,
with no match/turn clocks, (?) tile explanations and a manual Finish practice
button. Protection durations still apply; clock-changing tiles are
excluded. Practice needs no account and does not affect history, stats or ratings.

Private 1v1 rooms are available on `/play` to registered players and guests.
Create a room and share its six-character code or invitation link; the other
player chooses guest play or signs in, then joins. Codes expire after 15 minutes
and are consumed when the opponent joins. Brief host reconnects preserve the
room; cancellation, a longer disconnect, or a game-server restart closes it.
Custom rooms use normal ads and gameplay, and never change ratings. Hosts choose
x1, x1.5, x2 or x3 speed; joining players inherit it. Casual matchmaking offers
x1.5, x2 and x3 in separate queues. Ranked uses the original x1 timing and is the
only mode that changes ratings, for both guests and registered players.
All multiplayer modes contribute to overall statistics and match history.

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

- admin1@mathrix.app — password `amdin`
- admin2@mathrix.app — password `amdin`

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
Admin → Game balance. Changes are snapshotted for new matches; live matches retain
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
House campaigns use no third-party ad SDK or advertising cookies. Fonts are
self-hosted with their OFL licenses. The privacy page identifies data and missing
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
    pnpm build
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
at least one arithmetic tile enabled. New games snapshot these settings;
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

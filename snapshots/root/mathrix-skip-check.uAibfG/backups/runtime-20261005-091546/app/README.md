# MATHRIX

A playable 1v1 matrix tactics game: eight shared operation cards, signed scoring,
matches starting at 120 seconds, time tiles, Transpose, accelerating turns and an Add Row/Column reflex challenge.
Live application: https://mathrix.app. Admin: https://mathrix.app/admin.
In-app documentation: https://mathrix.app/admin/docs.

## Architecture

TypeScript throughout. Next.js 16 / React 19 renders the browser application.
A single Node.js / Socket.IO process owns game state and matchmaking. Better Auth
provides email/password (scrypt) and Google/Discord OAuth. PostgreSQL stores users,
provider accounts, sessions, stats, matches/events, ratings, settings and campaigns.
Redis holds guest sessions, rate limits, advertising cadence and live queue/game
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
  turn/skill timers, scoring and Elo. lib/config.ts: Zod schemas and defaults.
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
A maximum of 128 matrix cells keeps messages small. Application/profile data is
fetched separately. Delta encoding can be added if measured traffic warrants it.

Add a new card to operationIds and registry, implement its legality and controlled
transition, assign a default weight, and add a unit test. Set balance values in
Admin → Game balance. Changes are snapshotted for new matches; live matches retain
their original rules. Match seed, initial/final matrices, generated cards, accepted
operations, skill stages/hits, timeouts, disconnects, results and ratings are retained.
Completion is transactional and idempotent. Durable disk files retry failed writes.

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
and verify synchronization, final persistence, Elo, house ads, guests, reflex stages,
responsive rendering and admin authorization. Tests never expose a public test-only
match-finish bypass. NODE_ENV production uses the same rules/validation.

On this VM, `pnpm test:system` (as root) creates/reuses `mathrix_test`, uses a
separate Redis database and loopback ports 3100–3102, migrates/seeds and runs both
integration and E2E suites against the production frontend build. It creates a
private, ignored .env.test, records logs in var/test-*.log, and stops its services
on exit. Run `pnpm build` first. Public game state and balance are not touched.

## Deployment and operations

Read DEPLOYMENT.md for native provisioning, systemd, firewall, DNS, TLS, backups,
service commands and rebuilds. Only SSH and HTTP/HTTPS should be reachable. Health:
/api/health reports PostgreSQL/Redis connectivity. Admin → Overview reports active
matches, queue counts and database/game/Redis health. Logs use JSON event names
and match/player identifiers. Caddy access logs rotate at 10 MiB.

## Known prototype limitations

- One game process; no multi-server ownership or crash-resume for active matches.
  Brief client reconnects work; graceful shutdowns persist unrated completions.
- Skill clicks are timing/position/stage validated, but automation is still possible.
  High latency reduces effective reflex deadlines; no latency compensation yet.
- No email delivery, email verification, password-reset UI, or provider credentials.
  OAuth is implemented and awaiting actual credentials and provider-side validation.
- H5 approval and publishing Google's consent message are required before live ads.
  Legal identity/contact, deletion workflow and retention policy remain launch work.
- Leaderboard maintenance supports rating resets, not historical Elo recalculation.
- House images are remote public URLs; arbitrary URL schemes and private IP URLs are
  rejected, but a strict domain allowlist is advisable before accepting untrusted admins.
- Extremely small skill targets scale with the arena on narrow phones; desktop is
  the primary competitive experience. Sound is off until explicitly enabled.

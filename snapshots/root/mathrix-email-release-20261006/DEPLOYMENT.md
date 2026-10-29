# Native deployment: mathrix.app

## This VM

Ubuntu 26.04 ARM64. Public IPv4: **152.53.14.163**. Source repository:
/root/mathrix. Deployed runtime: /srv/mathrix. Private production environment:
/etc/mathrix.env. Persistent game completion spool: /var/lib/mathrix/completed.
Services: mathrix-web, mathrix-game, postgresql, redis-server and caddy.
No Docker containers are used. Node services run as the dedicated `mathrix` user.

PostgreSQL and Redis listen only on loopback. Redis requires a random password.
Database credentials and AUTH_SECRET are randomly generated and not committed.
Caddy is installed from the official v2.11.6 ARM64 release with its SHA-512
checksum verified. The systemd drop-in selects /usr/local/bin/caddy; Ubuntu's
older package supplies the standard service account and unit.

## DNS (Namecheap)

Advanced DNS → Host Records (for Namecheap-hosted DNS):

| Type  | Host | Value         | TTL       |
| ----- | ---- | ------------- | --------- |
| A     | @    | 152.53.14.163 | Automatic |
| CNAME | www  | mathrix.app   | Automatic |

Replace conflicting parking/URL Redirect records for @ and www. Leave mail/TXT
records intact. No AAAA record is required for this deployment. Do not retain an
AAAA pointing elsewhere. Both domains must resolve here before TLS certificates
can be issued. Caddy redirects www to https://mathrix.app and HTTP to HTTPS.
If authoritative DNS is hosted elsewhere, make these changes at that provider.

Verify:

    dig +short mathrix.app A @1.1.1.1
    dig +short www.mathrix.app CNAME @1.1.1.1
    curl -I https://mathrix.app
    curl -I https://www.mathrix.app

## Provisioning a fresh host

Install Node 22+, pnpm 10 and native dependencies:

    sudo apt update
    sudo apt install postgresql redis-server caddy rsync ufw
    sudo npm install -g pnpm@10
    sudo systemctl enable --now postgresql redis-server

Create the PostgreSQL mathrix user/database using psql as postgres. Use a random
strong password, not a command shown in shell history. Append a random requirepass
to /etc/redis/redis.conf, confirm bind 127.0.0.1 ::1, and restart redis-server.
PostgreSQL's default listen_addresses must remain localhost. Do not open 5432/6379.
Use a current Caddy release; verify its checksum and install /usr/local/bin/caddy,
or adapt the supplied systemd drop-in to a current package-managed binary.

Populate .env using .env.example and secure permissions (chmod 600 .env). Run:

    pnpm install --frozen-lockfile
    pnpm db:migrate
    pnpm db:seed

Create /etc/mathrix.env using the same private credentials, with these production
values (preserve all OAuth/provider variables):

    NODE_ENV=production
    APP_URL=https://mathrix.app
    GAME_HOST=127.0.0.1
    GAME_PORT=3001
    GAME_INTERNAL_URL=http://127.0.0.1:3001
    NEXT_PUBLIC_GAME_URL=
    STATE_DIR=/var/lib/mathrix
    NEXT_TELEMETRY_DISABLED=1

Set chmod 600 /etc/mathrix.env. The example intentionally leaves secrets empty.
Systemd reads the root-only environment file before dropping privileges.

Enable the firewall after allowing your actual SSH port:

    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 443/udp
    ufw --force enable

Port 22 is the verified SSH port on this VM. If SSH differs on another machine,
allow that port first. A hosting-provider firewall must also permit 80/443.

## Deploy / update

From /root/mathrix:

    pnpm install --frozen-lockfile
    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:system  # after pnpm build; isolated integration + E2E, as root
    # Apply schema changes with production credentials if needed.
    sudo bash scripts/deploy.sh

The script builds Next standalone with an empty NEXT_PUBLIC_GAME_URL, copies
static assets and rules documentation, syncs to /srv/mathrix, installs units and
Caddy configuration, validates Caddy, restarts services and checks local health.
Do not stop the current app before the production build succeeds. Rebuilds
restart the game process; finish active games before a planned release. Graceful
shutdown persists unfinished matches as unrated `server_shutdown` results.
For migrations against production:

    cd /srv/mathrix
    sudo node --env-file=/etc/mathrix.env --import tsx scripts/migrate.ts

## Service commands

For community emails, run the application migration before starting the updated
game service. Add `BREVO_SMTP_KEY`, `BREVO_SMTP_LOGIN`, `BREVO_FROM_EMAIL` and
optionally `BREVO_FROM_NAME=Mathrix` to `/etc/mathrix.env` (mode 600). Use
`BREVO_SMTP_PORT=2525` on this VM because ports 587 and 465 are unreachable. The sender
must be verified in Brevo. Keep the SMTP key out of public environment variables.
Admin → Emails shows configuration readiness and manages the weekly reminder,
manual sends and campaign progress. The game service runs the durable worker;
there is no separate cron process. Use the public HTTPS `APP_URL` for email links.

Start:

    systemctl start mathrix-game mathrix-web caddy

Stop (PostgreSQL/Redis remain running):

    systemctl stop mathrix-web mathrix-game caddy

Restart:

    systemctl restart mathrix-game mathrix-web caddy

Status / logs:

    systemctl status mathrix-game mathrix-web caddy postgresql redis-server
    journalctl -u mathrix-game -u mathrix-web -u caddy -f
    tail -f /var/log/caddy/mathrix-access.log

Provider/secret changes in /etc/mathrix.env require a mathrix-game restart.
Build-time NEXT_PUBLIC settings require a rebuild. Client secrets never use a
NEXT_PUBLIC prefix. After any change, verify /api/health and a real match.

## Verification

    curl -fsS http://127.0.0.1:3001/api/health
    curl -fsS https://mathrix.app/api/health
    sudo -u postgres psql mathrix -c 'SELECT count(*) FROM matches;'
    systemctl is-enabled mathrix-game mathrix-web caddy postgresql redis-server
    ss -lntp
    ufw status

Health queries PostgreSQL and Redis, not just the HTTP process. Admin Overview
shows live activity. Node logs are JSON and include match IDs and queue/connection
transitions. The service does not log passwords, hashes or session tokens.

## Backup / restore

Create a private PostgreSQL custom-format backup and design-file archive:

    cd /root/mathrix
    sudo bash scripts/backup.sh

Or choose a private directory as the first argument. Copy backups to a separate
secure host for disaster recovery. Backup is not automatically scheduled.
If design uploads exist, the script also creates a matching
`mathrix-<timestamp>-design-files.tar.gz` from `/var/lib/mathrix/design-files`.
Set `STATE_DIR` when backing up a different state directory. Files and descriptions
are published together and never overwritten; unfinished uploads are excluded.
Restore into a fresh database after stopping app services:

    sudo -u postgres createdb -O mathrix mathrix_restore
    sudo -u postgres pg_restore --no-owner --role=mathrix -d mathrix_restore < /path/to/backup.dump

Restore the design-file archive into the state directory while the game service
is stopped, then restore service-account ownership:

    sudo tar -xzf /path/to/design-files.tar.gz -C /var/lib/mathrix
    sudo chown -R mathrix:mathrix /var/lib/mathrix/design-files

Design uploads persist in `/var/lib/mathrix/design-files`, within the game service's
existing writable directory. No database migration is needed. Deploy the updated
Caddy configuration with the application: only `POST /api/admin/design-files`
allows an 11 MB request envelope; the server limits the file itself to 10 MiB and
other API requests retain their 32 KB proxy limit.

Verify restoration before switching DATABASE_URL. Also back up /etc/mathrix.env,
Caddy's /var/lib/caddy certificate state and /var/lib/mathrix completion spool
securely. Redis guest/queue data is temporary and can be recreated.

## Administrator / launch work

The only administrator is gocandan@gmail.com. Sign in with Google; no password
credential was created for this account. The original admin1@mathrix.app and
admin2@mathrix.app accounts and their sessions were removed on 6 October 2026.
Keep SEED_TEST_ADMINS=false in the application environment. The isolated system
test runner enables its own test administrators in a separate database.

Fill GOOGLE_CLIENT_ID/SECRET and DISCORD_CLIENT_ID/SECRET in /etc/mathrix.env.
Callbacks: https://mathrix.app/api/auth/callback/google and
https://mathrix.app/api/auth/callback/discord. Provider flows cannot be confirmed
without actual OAuth applications and credentials.

Controls and campaigns are in /admin → Advertising. Google H5 uses
AD_PROVIDER=adsense-h5 and AD_PROVIDER_CLIENT_ID=ca-pub-6449099608711175.
Set mode=EXTERNAL_PROVIDER, enabled/pregame/guests/registered/admins=true,
everyN=1, cooldownMinutes=0, pregameWaitMs=15000 and testMode=true. These
are the initial H5 deployment values; test ads generate no revenue.

Before setting testMode=false, confirm H5 Games Ads approval and publish the
European regulations message for mathrix.app in AdSense → Privacy & messaging,
with consent, refusal and manage-options choices and the site's privacy URL.
Google's existing AdSense tag delivers the message. Verify consent acceptance,
refusal, revocation and unresolved consent on /play and /settings; refusal or
unavailable consent uses the pregame wait. Reload game pages after switching
provider/test mode. Preserve the ads.txt authorization at https://mathrix.app/ads.txt.

## Verification recorded on 2 October 2026

Formatting, ESLint, TypeScript and the Next.js production build passed. The initial
release passed 25 unit, 7 integration and 4 Playwright tests. The expanded source
passed 36 unit, 8 integration and 14 Playwright tests in the isolated mathrix_test_43120
instance, including mocked Google SDK failure, delay, refresh, reconnection and
consent scenarios. Real Google advertising remains subject to provider-side testing.
Integration includes real
WebSockets, reconnects, stale/out-of-turn rejection, duplicate browser identities,
admin authorization/suspension and transactional persistence failure/retry.
Two browser contexts verify registered matches, synchronized operations, completion,
history/Elo, guest matches, house ads before the clock, reflex growth, mobile width
and protected admin documentation. Full suites use an isolated production instance;
the public match duration remains 120 seconds.

Live HTTPS returns HTTP 200; HTTP redirects to HTTPS, www redirects to the apex,
and Caddy holds valid Let's Encrypt certificates. Health confirms PostgreSQL/Redis.
Both seeded admin logins and protected overview/users/matches/leaderboard/campaign
APIs were checked over HTTPS. Native services are enabled at boot. PostgreSQL and
Redis are bound to loopback, and UFW allows SSH/HTTP/HTTPS. A database backup was
restored into a temporary database and its admin accounts/matches checked.
Real Google/Discord OAuth and external advertising remain unverified until actual
credentials and a reviewed provider integration are supplied.

## Profile/Premium update

Before starting this version, run `pnpm db:migrate` and rebuild the web app. The
migration adds profile and billing data without resetting player history. Deploy
the updated Caddyfile as well: `/api/billing/webhook` accepts a raw signed body up
to 256 KiB, while ordinary API requests retain their existing limit.

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`STRIPE_PREMIUM_PRICE_ID` in the game-service environment. Follow README's Stripe
setup for the inclusive EUR 4.99 monthly Price, cancellation portal and webhook
subscriptions/API version. Keep keys blank until billing is configured. Observe
`billing_webhook_failed` logs and Stripe's webhook delivery dashboard; replay
failed deliveries after fixing configuration or transient failures. No billing
secrets are included in browser bundles or public game state.

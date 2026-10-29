#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(id -u)" = 0 ] || { echo 'Run deployment as root'; exit 1; }
[ -f /etc/mathrix.env ] || { echo 'Create /etc/mathrix.env first; see DEPLOYMENT.md'; exit 1; }
# Public variables must be built for the HTTPS origin; secrets remain server-side.
NEXT_PUBLIC_GAME_URL= NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 pnpm build
find .next/standalone -maxdepth 1 -name '.env*' -delete
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/
cp -a public .next/standalone/
cp GAME_RULES.md .next/standalone/
id mathrix >/dev/null 2>&1 || useradd --system --home /var/lib/mathrix --shell /usr/sbin/nologin mathrix
install -d -o mathrix -g mathrix /srv/mathrix /var/lib/mathrix /var/lib/mathrix/completed
rsync -a --delete --exclude=.git --exclude='.env*' --exclude='*.swp' --exclude=var --exclude=test-results --exclude=playwright-report --exclude=backups ./ /srv/mathrix/
chown -R mathrix:mathrix /srv/mathrix
install -m 644 deploy/mathrix-game.service deploy/mathrix-web.service /etc/systemd/system/
install -d -o caddy -g caddy /var/log/caddy
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/mathrix.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
Restart=on-failure
RestartSec=3
UNIT
runuser -u caddy -- /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable mathrix-game mathrix-web caddy postgresql redis-server
systemctl restart mathrix-game mathrix-web caddy
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3001/api/health && curl -fsS http://127.0.0.1:3000/ >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3000/ >/dev/null
for service in mathrix-game mathrix-web caddy postgresql redis-server; do
  systemctl is-active --quiet "$service"
done

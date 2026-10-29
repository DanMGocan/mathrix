#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v caddy >/dev/null
[ -f .next/standalone/server.js ] || { echo 'Run pnpm build first'; exit 1; }
mkdir -p var
test_port="${MATHRIX_TEST_PORT:-3100}"
[[ "$test_port" =~ ^[0-9]+$ ]] && ((test_port >= 1024 && test_port <= 65000)) || { echo 'Invalid test port'; exit 1; }
game_port=$((test_port + 1))
web_port=$((test_port + 2))
test_env="$PWD/.env.test-$test_port"
test_dir="$PWD/var/test-$test_port"
mkdir -p "$test_dir"
exec 9>"$test_dir/run.lock"
flock -n 9 || { echo 'Another isolated test run is active'; exit 1; }
for port in "$test_port" "$game_port" "$web_port"; do
  if [ -n "$(ss -H -ltn "sport = :$port")" ]; then
    echo "Test port $port is already in use; let that instance finish first"
    exit 1
  fi
done
# Dedicated database, Redis database and loopback ports; never test the public queue.
node --input-type=module - "$test_port" "$test_env" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source = parseEnv(readFileSync('.env', 'utf8'));
const database = new URL(source.DATABASE_URL), redis = new URL(source.REDIS_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || !['localhost', '127.0.0.1'].includes(redis.hostname))
  throw Error('This VM test runner requires local PostgreSQL and Redis');
const port = Number(process.argv[2]);
const name = database.pathname.slice(1) + '_test_' + port, owner = decodeURIComponent(database.username);
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name) || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(owner))
  throw Error('Unsupported database name or owner');
const exists = spawnSync('runuser', ['-u', 'postgres', '--', 'psql', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${name}'`], { encoding: 'utf8' });
if (exists.status !== 0) throw Error('Run this VM test runner as root');
if (exists.stdout.trim() !== '1') {
  const created = spawnSync('runuser', ['-u', 'postgres', '--', 'createdb', '-O', owner, name], { stdio: 'inherit' });
  if (created.status !== 0) throw Error('Could not create isolated test database');
}
database.pathname = '/' + name;
const redisDatabase = Number(process.env.MATHRIX_TEST_REDIS_DB || (port === 3100 ? 1 : 2));
if (!Number.isInteger(redisDatabase) || redisDatabase < 1 || redisDatabase > 15 || redisDatabase === Number(redis.pathname.slice(1) || 0))
  throw Error('Choose a separate test Redis database from 1 through 15');
redis.pathname = '/' + redisDatabase;
const env = { ...source, NODE_ENV: 'production', APP_URL: `http://localhost:${port}`,
  DATABASE_URL: database.href, REDIS_URL: redis.href, AUTH_SECRET: randomBytes(32).toString('hex'),
  GAME_HOST: '127.0.0.1', GAME_PORT: String(port + 1), GAME_INTERNAL_URL: `http://127.0.0.1:${port + 1}`,
  NEXT_PUBLIC_GAME_URL: '', STATE_DIR: `./var/test-state-${port}`, SEED_TEST_ADMINS: 'false',
  AD_PROVIDER: 'adsense-h5', AD_PROVIDER_CLIENT_ID: 'ca-pub-6449099608711175',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PREMIUM_PRICE_ID: '',
  BREVO_SMTP_KEY: '', BREVO_SMTP_LOGIN: '', BREVO_SMTP_PORT: '587', BREVO_FROM_EMAIL: '', BREVO_FROM_NAME: 'Mathrix',
  GOOGLE_CLIENT_ID: 'isolated-google-client', GOOGLE_CLIENT_SECRET: 'isolated-google-secret',
  DISCORD_CLIENT_ID: 'isolated-discord-client', DISCORD_CLIENT_SECRET: 'isolated-discord-secret' };
writeFileSync(process.argv[3], Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
JS
node --env-file="$test_env" --import tsx scripts/migrate.ts
node --env-file="$test_env" --import tsx scripts/seed.ts
node --env-file="$test_env" --import tsx --input-type=module <<'JS'
import { testSession } from './tests/auth-fixture.ts';
import { db } from './server/db.ts';
try {
  for (const email of ['admin1@mathrix.app', 'admin2@mathrix.app'])
    await testSession({ email, role: 'ADMIN' });
} finally {
  await db.end();
}
JS
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/
cp -a public .next/standalone/
cp GAME_RULES.md .next/standalone/
find .next/standalone -maxdepth 1 -name '.env*' -delete
test_runtime="$PWD/var/test-runtime-$$"
cp -a .next/standalone "$test_runtime"
cat > "$test_dir/Caddyfile" <<CADDY
{
  admin off
  auto_https off
}
http://localhost:$test_port {
  bind 127.0.0.1
  @designUpload {
    method POST
    path /api/admin/design-files
  }
  handle @designUpload {
    request_body {
      max_size 11MB
    }
    reverse_proxy 127.0.0.1:$game_port {
      header_up X-Forwarded-For {client_ip}
    }
  }
  @billingWebhook {
    method POST
    path /api/billing/webhook
  }
  handle @billingWebhook {
    request_body {
      max_size 256KB
    }
    reverse_proxy 127.0.0.1:$game_port {
      header_up X-Forwarded-For {client_ip}
    }
  }
  @backend path /api/* /socket.io/*
  handle @backend {
    request_body {
      max_size 32KiB
    }
    reverse_proxy 127.0.0.1:$game_port {
      header_up X-Forwarded-For {client_ip}
    }
  }
  handle {
    reverse_proxy 127.0.0.1:$web_port {
      header_up X-Forwarded-For {client_ip}
    }
  }
}
CADDY
pids=()
cleanup() {
  if [ "${#pids[@]}" -gt 0 ]; then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
  rm -rf "$test_runtime"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
node --env-file="$test_env" --import tsx server/index.ts > "$test_dir/game.log" 2>&1 & pids+=("$!")
PORT="$web_port" HOSTNAME=127.0.0.1 node --env-file="$test_env" "$test_runtime/server.js" > "$test_dir/web.log" 2>&1 & pids+=("$!")
caddy run --config "$test_dir/Caddyfile" --adapter caddyfile > "$test_dir/proxy.log" 2>&1 & pids+=("$!")
for attempt in {1..30}; do
  if curl -fsS "http://localhost:$test_port/api/health" >/dev/null 2>&1 && curl -fsS "http://localhost:$test_port/" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://localhost:$test_port/api/health"
TEST_API_URL="http://localhost:$test_port" node --env-file="$test_env" --import tsx --test tests/server.test.ts
# Respect login and guest-creation rate limits shared by the two suites.
sleep 60
E2E_BASE_URL="http://localhost:$test_port" E2E_ARTIFACT_DIR="$test_dir/results" PLAYWRIGHT_HTML_OUTPUT_DIR="$test_dir/report" node --env-file="$test_env" node_modules/@playwright/test/cli.js test --output "$test_dir/results" "$@"

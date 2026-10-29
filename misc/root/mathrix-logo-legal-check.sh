#!/usr/bin/env bash
set -euo pipefail
cd /root/mathrix-logo-release-20261005-161538
test_port=44110
game_port=44111
web_port=44112
test_env="$PWD/.env.test-$test_port"
test_dir="$PWD/var/test-$test_port"
exec 9>"$test_dir/run.lock"
flock -n 9
for port in "$test_port" "$game_port" "$web_port"; do
  [ -z "$(ss -H -ltn "sport = :$port")" ] || { echo "Test port $port is in use"; exit 1; }
done
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
    reverse_proxy 127.0.0.1:$game_port
  }
  @billingWebhook {
    method POST
    path /api/billing/webhook
  }
  handle @billingWebhook {
    request_body {
      max_size 256KB
    }
    reverse_proxy 127.0.0.1:$game_port
  }
  @backend path /api/* /socket.io/*
  handle @backend {
    request_body {
      max_size 32KB
    }
    reverse_proxy 127.0.0.1:$game_port
  }
  handle {
    reverse_proxy 127.0.0.1:$web_port
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
E2E_BASE_URL="http://localhost:$test_port" E2E_ARTIFACT_DIR="$test_dir/results-legal-final" PLAYWRIGHT_HTML_OUTPUT_DIR="$test_dir/report-legal-final" node --env-file="$test_env" node_modules/@playwright/test/cli.js test --output "$test_dir/results-legal-final" "$@"
